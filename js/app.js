import { DAY, pad, localDay, dayStart, shiftDay, fmt, num, MIN_VALID, HIST_MAX } from './modules/date-utils.js';
import { pruneHistory, mergeImportedHistory } from './modules/history.js';
import { createBackupSnapshot, mergeBackupData } from './modules/backup.js';
import { $, sleep, APP_VERSION } from './modules/core.js';
import { createStore } from './modules/store.js';
import { fromOldRow } from './modules/legacy-migration.js';
import { median, analyzeSpeedLevels, analyzeSpeedTimeContext, analyzeHygrometricPeriods, compareOperatingPeriods } from './modules/analysis.js';
import { summarizeEnergyReadiness, summarizeRawVmiSpeed, summarizeRawVmiMode, summarizeOperatingReference, summarizeTemperatureLimit } from './modules/operating-reference.js';
import { renderCharts, resetChartViews } from './modules/charts.js';
import { SVC_C, CH_C, SVC_T, CH_T, frame, timeFrame, hex } from './modules/ble.js';
import { armDownloadTimeout } from './modules/sync.js';
import { parseCell, recFrom, getColumnMapping, findVmiHeaderRowIndex, parseCsvRows, isCsvFile } from './modules/dataio.js';
import { fixClock } from './modules/clock-correction.js';
import { absoluteHumidity, psychro, validTemp } from './modules/psychrometry.js';
import { summarizeDataQuality, isPlausibleHumidity, isPlausibleTemperature } from './modules/data-quality.js';
import { upsertEnergyReading, summarizeEnergyReadings, summarizeMonthlyEnergyReadings, summarizeEnergyClimateContext, ENERGY_METER_LABELS } from './modules/energy-meter.js';
import { summarizeFanEnergyEstimate, summarizeFanEnergyByManualMode } from './modules/energy-estimate.js';
import { summarizeDailyEnergyClimateContext } from './modules/energy-climate.js';
import { buildHygrometricDiagnosis } from './modules/hygrometric-diagnosis.js';
import { summarizeDailyTrends, analyzeHourlyPatterns, detectRapidChanges } from './modules/temporal-analysis.js';
import { chooseAuthorizedDevice } from './modules/bluetooth-autoconnect.js';
import { buildLiveFreshnessText } from './modules/live-freshness.js';
import { formatDiagnosisConfidence } from './modules/diagnostic-confidence.js';
import { renderVmiAssistant } from './modules/assistant-renderer.js';
import { selectDataRange } from './modules/history-selection.js';
import { formatDuration, localDateTimeValue } from './modules/format-utils.js';
import { estimateHistoryRetention } from './modules/history-freshness.js';
import { buildHistoryFreshnessView } from './modules/history-freshness-view.js';
import { createHistoryInsightRenderers } from './modules/history-insight-renderers.js';
import { createEnergyRenderers } from './modules/energy-renderers.js';
import { createHygrometricRenderers } from './modules/hygrometric-renderers.js';
import { summarizeWeeklyDiagnostic } from './modules/weekly-diagnostic.js';
import { analyzeSeasonalVentilation } from './modules/seasonal-advice.js';
import { createImportController } from './modules/import-controller.js';
import { createHistoryExportController } from './modules/history-export-controller.js';




const hygrometricRenderers = createHygrometricRenderers({
 $, fmt, formatDuration, analyzeHygrometricPeriods, summarizeDailyTrends, analyzeHourlyPatterns,
 detectRapidChanges, buildHygrometricDiagnosis, formatDiagnosisConfidence
});

if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js').catch(()=>{})}

/* Protocole Bluetooth : UUID, registres et positions d'octets déduits d'une capture réelle de VMI+. */





const errors=[];
function recordError(m){
 errors.push(new Date().toLocaleTimeString('fr-FR')+' '+m);if(errors.length>30)errors.shift();
 const b=$('errBanner');b.textContent='⚠ Une erreur interne est survenue ('+errors.length+'). Touche « Diagnostic » (en bas de page) pour la copier.';b.style.display='block';
}
window.addEventListener('error',e=>recordError('Erreur : '+(e.message||(e.error&&e.error.message)||'inconnue')+(e.filename?' ('+String(e.filename).split('/').pop()+':'+e.lineno+')':'')));
window.addEventListener('unhandledrejection',e=>recordError('Promesse rejetée : '+((e.reason&&e.reason.message)||e.reason)));











let dev=null,chC=null,chT=null,pollTimer=null,snapTimer=null,reconnectTimer=null;
let manualDisconnect=false,intentionalDisconnect=false,commandQueue=Promise.resolve(),manualCommandPending=false,polling=false,autoDone=false;
let meta={},cur={},lastSeen={},live=[],hist=[],energyReadings=[],source='hist',selectedDate=null,daysSetting=30;
let logLines=[],dlFrames=0;
let download={on:false,rows:[],buf:'',total:0,sigs:new Set(),got:false,lastPacket:0,timeout:null};
const DB='VMI_PUREVENT_DB_TEST',STORE='data';
const { get: dbGet, set: dbSet, setMany: dbSetMany } = createStore({ databaseName: DB, storeName: STORE, onError: message => log(message) });
const connected=()=>!!(chC&&dev&&dev.gatt&&dev.gatt.connected);

function showError(e){$('err').textContent=e?String(e.message||e):''}
function renderLog(){const p=$('log');p.textContent=logLines.slice(-70).join('\n');p.scrollTop=p.scrollHeight}
function log(s){logLines.push(`${new Date().toLocaleTimeString('fr-FR')} ${s}`);if(logLines.length>300)logLines.shift();if($('logDetails').open)renderLog()}
$('logDetails').addEventListener('toggle',()=>{if($('logDetails').open)renderLog()});
function setStatus(s,isConnected=false){$('st').textContent=s;$('bleState').textContent=isConnected?'Connecté':'Déconnecté';$('conn').disabled=isConnected;$('disc').disabled=!isConnected;const overview=$('dashboardConnectionStatus');if(overview)overview.textContent=s}

/* La lecture IndexedDB ancienne reste ici ; la conversion des lignes est isolée.
   Un état "unavailable" interdit de marquer la migration terminée : l'ancienne base
   n'a alors pas été vérifiée et pourrait encore contenir l’historique à récupérer. */
async function readOldDatabase(){
 if(typeof indexedDB==='undefined'||typeof indexedDB.databases!=='function')return {status:'unavailable'};
 let list;
 try{list=await indexedDB.databases()}catch(e){return {status:'unavailable',error:e}}
 if(!Array.isArray(list))return {status:'unavailable'};
 if(!list.some(d=>d&&d.name==='VMI_DB'))return {status:'absent'};
 let old=null;
 try{
  old=await new Promise((res,rej)=>{const r=indexedDB.open('VMI_DB');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
  if(!old.objectStoreNames.contains('vmi_store'))return {status:'read',hist:[],live:[]};
  const get=k=>new Promise((res,rej)=>{const r=old.transaction('vmi_store','readonly').objectStore('vmi_store').get(k);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
  return {status:'read',hist:await get('vmi_hist'),live:await get('vmi_live')};
 }catch(e){return {status:'unavailable',error:e}}
 finally{if(old)old.close()}
}
async function init(){
 let l=await dbGet('live'),h=await dbGet('hist');
 live=Array.isArray(l)?l:[];hist=Array.isArray(h)?h:[];
 meta=(await dbGet('meta'))||{};
 const storedEnergyReadings=await dbGet('energyReadings');
 energyReadings=Array.isArray(storedEnergyReadings)?storedEnergyReadings:[];
 const migrated=await dbGet('migrated');
 // Le marqueur est l'unique preuve d'une migration achevée. Des données déjà présentes
 // ne doivent pas empêcher une nouvelle tentative après une migration interrompue.
 const migrationPending=migrated!==true;
 let migrationCompleted=false;
 if(migrationPending){
  const old=await readOldDatabase();
  if(old.status==='unavailable'){
   $('importInfo').textContent='Migration de l’ancien historique en attente : le navigateur ne permet pas de vérifier l’ancienne base. Les données actuelles sont conservées ; réessaie avec Chrome à jour ou importe une sauvegarde.';
  }else{
   let oldHist=[],oldLive=[];
   if(old.status==='read'){
    if(Array.isArray(old.hist))oldHist=old.hist.map(fromOldRow).filter(Boolean);
    if(Array.isArray(old.live))oldLive=old.live;
   }
   if(!oldHist.length){try{const x=JSON.parse(localStorage.getItem('vmi_hist')||'[]');if(Array.isArray(x))oldHist=x.map(fromOldRow).filter(Boolean)}catch(e){}}
   if(!oldLive.length){try{const x=JSON.parse(localStorage.getItem('vmi_live')||'[]');if(Array.isArray(x))oldLive=x}catch(e){}}
   // Fusion par horodatage : une nouvelle tentative ne remplace jamais un historique
   // plus récent déjà enregistré dans la base de préversion.
   hist=mergeImportedHistory(hist,oldHist);
   live=mergeImportedHistory(live,oldLive);
   migrationCompleted=true;
  }
 }
 /* Les relevés datés d'avant 2025 ont une date fausse (horloge de la VMI) et ne peuvent pas être corrigés
    sans leur compteur de jours : on les retire, un nouvel import ou téléchargement les rétablit avec la bonne date. */
 const bad=hist.filter(r=>!(r&&r.t>=MIN_VALID)).length;
 if(bad){hist=hist.filter(r=>r&&r.t>=MIN_VALID);$('importInfo').textContent=`${bad} anciens relevés à date invalide ont été retirés. Réimporte ton export VMI+ ou récupère l’historique : ils reviendront avec la bonne date.`}
 hist.sort((a,b)=>a.t-b.t);
 if(migrationPending&&migrationCompleted){
  // Les données fusionnées et le marqueur sont validés ensemble : un échec permet une nouvelle tentative.
  await dbSetMany([['hist',hist],['live',live],['migrated',true]]);
 }else{
  // Si l'ancienne base n'a pas pu être vérifiée, conserver les données courantes sans
  // marquer la migration comme terminée : elle pourra être retentée au prochain démarrage.
  await dbSet('hist',hist);if(live.length)await dbSet('live',live);
 }
 $('liveCount').textContent=live.length;render();
}
function pruneHist(){
 const result=pruneHistory(hist,HIST_MAX);
 hist=result.records;
 if(result.removed)log(`Historique limité à ${HIST_MAX} relevés (les plus anciens supprimés).`);
}

/* Psychrométrie : approximation de Magnus */














/* Trames */




function writeFrame(bytes){
 const task=commandQueue.then(async()=>{
  if(!connected())throw new Error('VMI non connectée');
  if(chC.properties&&chC.properties.write&&typeof chC.writeValueWithResponse==='function'){
   await chC.writeValueWithResponse(bytes);
  }else if(chC.properties&&chC.properties.writeWithoutResponse&&typeof chC.writeValueWithoutResponse==='function'){
   await chC.writeValueWithoutResponse(bytes);
  }else if(typeof chC.writeValue==='function'){
   await chC.writeValue(bytes);
  }else{
   throw new Error('Cette caractéristique Bluetooth ne permet pas l’écriture.');
  }
  log('> '+hex(bytes));
  await sleep(350);
  return true;
 });
 const result=task.catch(e=>{
  showError('Échec de l’envoi Bluetooth : '+(e.message||e));
  log('Erreur commande : '+(e.message||e));
  return false;
 });
 commandQueue=result.then(()=>{},()=>{});
 return result;
}
const send=(reg,val)=>writeFrame(frame(reg,val));
async function setClock(){if(!chC){showError('Connecte-toi d’abord à la VMI.');return false}const d=new Date();const ok=await writeFrame(timeFrame(d));$('dlp').textContent=ok?'Heure envoyée : '+d.toLocaleString('fr-FR'):'Heure non envoyée.';return ok}

function onNotification(ev){
 try{handleNotification(ev)}catch(e){log('Erreur de décodage d’une trame : '+(e.message||e));recordError('Décodage d’une trame : '+(e.message||e))}
}
function handleNotification(ev){
 const v=ev.target.value;
 const a=new Uint8Array(v.buffer,v.byteOffset,v.byteLength);
 if(a.length<3||a[0]!==0xA5||a[1]!==0xB6)return;
 const type=a[2],now=Date.now();
 if(type===0x30){
  if(!download.on)return;
  if(a.length<14){log('Trame d’historique trop courte, ignorée.');return}
  dlFrames++;if(dlFrames%200===1)log(`< trames d’historique reçues : ${dlFrames}`);
  download.got=true;download.lastPacket=now;
  let end=14;while(end<a.length&&a[end]!==0)end++;
  download.buf+=new TextDecoder('latin1').decode(a.slice(14,end));
  const lines=download.buf.split('\n');download.buf=lines.pop();lines.forEach(parseDownloadLine);
  if(download.on){
   $('dlp').textContent=`${download.rows.length} nouvelles lignes (${a[9]|(a[10]<<8)} / ${download.total||'?'} lues)`;
   armTimer();
   if(a[13]===1){if(download.buf.trim())parseDownloadLine(download.buf);finishDownload(false)}
  }
  return;
 }
 log('< '+hex(a));
 if(type===1&&a.length>53){
  cur.filtre=a[28];cur.jours=a[26];cur.vol=a[22]|(a[23]<<8);cur.tmax=a[38];
  cur.vit=a[34]+1; // code brut VMI : ne jamais le traiter comme niveau manuel
  cur.boost=a[44];cur.hol=a[43];cur.rpm=null;
  lastSeen.state=now;
  $('fi').textContent=cur.filtre;$('jf').textContent=cur.jours;$('vo').textContent=cur.vol;$('tm').textContent=cur.tmax;
  $('sp').textContent=cur.vit;$('bo').textContent=cur.boost?'Actif':'Arrêté';$('ho').textContent=cur.hol?'Actif':'Arrêté';
 }
 else if(type===2&&a.length>13){
  cur.sal_t=a[11];cur.sal_h=a[13];lastSeen.salon=now;
  $('tp').textContent=cur.sal_t;$('hp').textContent=cur.sal_h;
 }
 else if(type===3&&a.length>13){
  cur.s1_t=a[6];cur.s1_h=a[8];cur.s2_t=a[11];cur.s2_h=a[13];lastSeen.probes=now;
  $('ti').textContent=cur.s1_t;$('hi').textContent=cur.s1_h;$('t2').textContent=cur.s2_t;$('h2').textContent=cur.s2_h;
 }
 else if(type===4&&a.length>7){download.total=a[6]|(a[7]<<8);return}
 else return;
 updateLiveMetrics();
}
function updateLiveMetrics(){
 $('sampleAge').textContent=buildLiveFreshnessText(lastSeen);
 const r={st:cur.sal_t,sh:cur.sal_h,te:cur.s2_t,he:cur.s2_h};
 const p=psychro(r);
 $('haSalon').textContent=fmt(p.haIn);$('haExt').textContent=fmt(p.haOut);$('dew').textContent=fmt(p.dewIn);$('dewExt').textContent=fmt(p.dewOut);
 $('deltaHA').textContent=p.haIn!=null&&p.haOut!=null?fmt(p.haIn-p.haOut):'–';
 $('deltaT').textContent=validTemp(r.st)&&validTemp(r.te)?fmt(r.st-r.te):'–';
 const box=$('hygroAdvice');
 if(p.haIn==null||p.haOut==null){box.className='advice';box.textContent='En attente de mesures valides pour comparer les masses de vapeur d’eau.';return}
 const delta=p.haIn-p.haOut;
 if(delta>1){box.className='advice good';box.textContent=`L’air entrant contient environ ${fmt(delta)} g/m³ de vapeur d’eau en moins que l’air du salon. Dans ces conditions, le renouvellement d’air peut contribuer à réduire l’humidité intérieure.`}
 else if(delta< -1){box.className='advice warn';box.textContent=`L’air entrant contient environ ${fmt(Math.abs(delta))} g/m³ de vapeur d’eau de plus que l’air du salon. Une ventilation accrue ne garantit donc pas un assèchement.`}
 else{box.className='advice';box.textContent='Les humidités absolues sont proches. L’effet asséchant potentiel de l’air entrant est limité à cet instant.'}
}

/* Relevés en direct : dès que le salon est frais, avec les sondes si elles le sont aussi */
function takeSnapshot(){
 const now=Date.now();
 if(!lastSeen.salon||now-lastSeen.salon>90000)return;
 const pf=lastSeen.probes&&now-lastSeen.probes<=90000;
 const row={t:now,st:cur.sal_t,sh:cur.sal_h,t1:pf?cur.s1_t:null,h1:pf?cur.s1_h:null,te:pf?cur.s2_t:null,he:pf?cur.s2_h:null,
  rpm:null,fil:Number.isFinite(cur.filtre)?cur.filtre:null,vit:Number.isFinite(cur.vit)?cur.vit:null,
  boost:cur.boost!=null?cur.boost:null,hol:cur.hol!=null?cur.hol:null};
 if(!Number.isFinite(row.st)&&!Number.isFinite(row.sh))return;
 live.push(row);
 if(live.length>10000)live.splice(0,live.length-10000);
 dbSet('live',live);$('liveCount').textContent=live.length;
 if(source==='live')render();
}

/* Scrutation : pas de chevauchement, arrêt dès que la connexion tombe */
async function poll(force=false){
 if(polling||!connected()||download.on||(manualCommandPending&&!force))return;
 polling=true;
 try{for(const r of [3,6,7]){if(!connected()||download.on)break;const ok=await send(r,0);if(!ok)break}}
 finally{polling=false}
}
function startPolling(){
 clearInterval(pollTimer);clearInterval(snapTimer);
 poll();
 pollTimer=setInterval(()=>poll(),12000);
 setTimeout(takeSnapshot,15000);
 snapTimer=setInterval(takeSnapshot,300000);
}
function cleanupConnection(){clearInterval(pollTimer);clearInterval(snapTimer);chC=null;chT=null}
function onDisconnect(){
 const wasIntentional=intentionalDisconnect;
 intentionalDisconnect=false;
 cleanupConnection();
 if(wasIntentional){setStatus('Synchronisation terminée. Bluetooth déconnecté.');return}
 setStatus('Déconnecté.');
 if(!manualDisconnect&&dev){setStatus('Connexion perdue, tentative de reconnexion…');clearTimeout(reconnectTimer);reconnectTimer=setTimeout(reconnect,4000)}
}
async function connectCharacteristics(server){
 const serviceC=await server.getPrimaryService(SVC_C);
 chC=await serviceC.getCharacteristic(CH_C);
 const serviceT=await server.getPrimaryService(SVC_T);
 chT=await serviceT.getCharacteristic(CH_T);
 await chT.startNotifications();chT.removeEventListener('characteristicvaluechanged',onNotification);chT.addEventListener('characteristicvaluechanged',onNotification);
 try{await chC.startNotifications();chC.removeEventListener('characteristicvaluechanged',onNotification);chC.addEventListener('characteristicvaluechanged',onNotification)}catch(e){log('Notifications canal commande non disponibles : '+e.message)}
}
function preferredBluetoothDeviceId(){
 try{return localStorage.getItem('vmi_bluetooth_device_id')||''}catch(e){return ''}
}
function rememberBluetoothDevice(device){
 try{if(device&&device.id)localStorage.setItem('vmi_bluetooth_device_id',device.id)}catch(e){}
}
async function connectDevice(device){
 if(!device||!device.gatt)throw new Error('Appareil Bluetooth invalide.');
 dev=device;manualDisconnect=false;
 dev.removeEventListener('gattserverdisconnected',onDisconnect);
 dev.addEventListener('gattserverdisconnected',onDisconnect);
 setStatus('Connexion à '+(dev.name||'la VMI')+'…');
 const server=await dev.gatt.connect();
 await connectCharacteristics(server);
 setStatus('Connecté à '+(dev.name||'la VMI')+'. Synchronisation des données…',true);
 startPolling();
 // Une reconnexion ne doit pas relancer la synchronisation automatique déjà effectuée.
 setTimeout(autoHistory,3000);
}
async function connectBLE(){
 // Un clic explicite démarre une nouvelle session et autorise une synchronisation initiale.
 autoDone=false;manualDisconnect=false;clearTimeout(reconnectTimer);showError('');
 if(!navigator.bluetooth){showError('Web Bluetooth indisponible. Utilise Chrome sur Android ou un navigateur compatible, en HTTPS.');return}
 try{
  /* requestDevice reste directement dans le geste utilisateur requis par le navigateur. */
  const device=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:[SVC_C,SVC_T]});
  rememberBluetoothDevice(device);
  await connectDevice(device);
 }catch(e){showError(e);setStatus('Connexion impossible.')}
}
async function autoConnectAuthorizedDevice(){
 if(!navigator.bluetooth||typeof navigator.bluetooth.getDevices!=='function'){
  setStatus('Autorisation Bluetooth requise : appuie sur « Se connecter ».');
  return;
 }
 try{
  const devices=await navigator.bluetooth.getDevices();
  const device=chooseAuthorizedDevice(devices,preferredBluetoothDeviceId());
  if(!device){
   setStatus(devices.length>1?'Plusieurs appareils sont autorisés. Appuie sur « Se connecter » pour choisir la VMI.':'VMI non encore autorisée. Appuie sur « Se connecter » une première fois.');
   return;
  }
  log('VMI déjà autorisée détectée : tentative de reconnexion automatique.');
  await connectDevice(device);
 }catch(e){
  log('Reconnexion automatique indisponible : '+(e.message||e));
  setStatus('Reconnexion automatique impossible. Appuie sur « Se connecter ».');
 }
}
async function reconnect(){
 if(manualDisconnect||!dev)return;
 try{await connectDevice(dev)}
 catch(e){log('Reconnexion échouée : '+e.message);clearTimeout(reconnectTimer);reconnectTimer=setTimeout(reconnect,7000)}
}
$('conn').onclick=connectBLE;
$('disc').onclick=()=>{manualDisconnect=true;clearTimeout(reconnectTimer);cleanupConnection();if(dev&&dev.gatt&&dev.gatt.connected)dev.gatt.disconnect();setStatus('Déconnexion demandée.')};

/* Boutons de commande : une commande à la fois, avec vérification de l'état renvoyé par la VMI */
const EXPECT={24:v=>['vit',v+1,'Vitesse '+(v+1)],25:v=>['boost',v,'Boost '+(v?'activé':'arrêté')],26:v=>['hol',v,'Mode vacances '+(v?'activé':'arrêté')]};
document.querySelectorAll('[data-r]').forEach(b=>b.addEventListener('click',async()=>{
 if(manualCommandPending||download.on)return;
 if(!connected()){showError('VMI non connectée.');$('cmdResult').textContent='';return}
 manualCommandPending=true;
 const controls=[...document.querySelectorAll('[data-r]')];
 controls.forEach(x=>x.disabled=true);
 showError('');
 const reg=Number(b.dataset.r),value=Number(b.dataset.v),[key,expected,label]=EXPECT[reg](value);
 const result=$('cmdResult');
 try{
  result.textContent='Envoi de la commande à la VMI…';
  const t0=Date.now();
  const sent=await send(reg,value);
  if(!sent){result.textContent='La commande n’a pas pu être envoyée (voir le journal Bluetooth).';return}
  result.textContent='Commande envoyée, vérification de l’état…';
  for(let i=0;i<10&&!((lastSeen.state||0)>t0);i++)await sleep(200);
  if(!((lastSeen.state||0)>t0)){await send(3,0);for(let i=0;i<10&&!((lastSeen.state||0)>t0);i++)await sleep(200)}
  if((lastSeen.state||0)>t0&&cur[key]===expected)result.textContent='✓ Confirmé par la VMI : '+label+'.';
  else if((lastSeen.state||0)>t0)result.textContent='⚠ La VMI a répondu mais l’état affiché n’est pas '+label.toLowerCase()+'. Vérifie sur la VMI ou dans VMI+.';
  else result.textContent='⚠ Commande envoyée mais aucune réponse de la VMI : l’état n’a pas pu être vérifié.';
  poll(true);
 }catch(e){
  showError(e);result.textContent='Erreur pendant la commande.';
 }finally{
  manualCommandPending=false;controls.forEach(x=>x.disabled=false);
 }
}));
const setCommandsDisabled=dis=>document.querySelectorAll('[data-r]').forEach(x=>x.disabled=dis);
$('clk').onclick=setClock;

/* Correction des dates historiques isolée dans clock-correction.js. */
function ingest(recs,label){
 const {fixed,kept}=fixClock(recs,hist);
 hist=mergeImportedHistory(hist,kept);
 pruneHist();dbSet('hist',hist);source='hist';
 // Conserver le jour choisi : une synchronisation en arrière-plan ne doit pas réinitialiser les graphiques.
 const lost=recs.length-kept.length;
 $('importInfo').textContent=`${label} : ${recs.length} relevés lus${fixed?`, dont ${fixed} dont la date a été corrigée (horloge de la VMI fausse)`:''}${lost?`, ${lost} ignorés (date invalide impossible à corriger)`:''}.`;
 log($('importInfo').textContent);
 render();
}

/* Téléchargement de l’historique : on s'arrête au premier relevé déjà connu, puis on coupe la connexion
   pour interrompre le flux de la VMI (elle ne sait pas s'arrêter seule). */
const sigOf=r=>r.rk+'|'+r.d;
function parseDownloadLine(line){
 if(!download.on||!/^\d{1,2}\/\d{1,2}\/\d{4} \d{1,2}:\d{2}:\d{2};/.test(line))return;
 const f=line.split(';'),p=parseCell(f[0]);if(!p)return;
 if(download.sigs.size&&download.sigs.has(p.rk+'|'+num(f[11]))){finishDownload(true);return}
 const rec=recFrom(f);if(rec)download.rows.push(rec);
}
function armTimer(){armDownloadTimeout(download,finishDownload)}
function finishDownload(reachedCut,timeout=false){
 if(!download.on)return;
 download.on=false;clearTimeout(download.timeout);
 const count=download.rows.length;
 if(count)ingest(download.rows,'Téléchargement');
 if(download.got){meta.lastSync=Date.now();dbSet('meta',meta);renderFreshness()}
 $('dlh').disabled=false;setCommandsDisabled(false);
 $('dlp').textContent=`Terminé : ${count} nouvelles lignes${reachedCut?' · historique à jour':timeout?(download.got?' · arrêt après une pause de 20 s':' · aucune réponse de la VMI'):(download.sigs.size?' · attention : trou possible avant la dernière ligne mémorisée':' · historique complet')}`;
 if(reachedCut&&dev&&dev.gatt&&dev.gatt.connected){
  // La VMI ne sait pas arrêter seule le flux historique : cette coupure est volontaire.
  // onDisconnect doit la distinguer d'une vraie perte de liaison.
  intentionalDisconnect=true;
  dev.gatt.disconnect();
 }
}
async function startDownload(auto=false){
 if(!chC){if(!auto)showError('Connecte-toi d’abord à la VMI.');return}
 if(download.on)return;
 showError('');dlFrames=0;
 download={on:true,rows:[],buf:'',total:0,sigs:new Set(hist.filter(r=>r.rk&&Number.isFinite(r.d)).map(sigOf)),got:false,lastPacket:Date.now(),timeout:null};
 $('dlh').disabled=true;setCommandsDisabled(true);
 $('dlp').textContent=auto?'Téléchargement automatique de l’historique…':'Démarrage du téléchargement…';
 const ok=await setClock();
 if(!ok){download.on=false;$('dlh').disabled=false;setCommandsDisabled(false);return}
 await send(0x2c,0);await send(0x20,0);await send(0x22,0);armTimer();
}
$('dlh').onclick=()=>startDownload(false);
function autoHistory(){
 if(autoDone||download.on||!connected())return;
 autoDone=true; /* une seule fois par connexion : pas de boucle déconnexion/reconnexion */
 startDownload(true).catch(e=>log('Téléchargement automatique impossible : '+(e.message||e)));
}

/* Import CSV/Excel délégué au contrôleur dédié. */
/* ---------- Export, sauvegarde et fraîcheur de l’historique ---------- */
const fmtLocal=t=>{const d=new Date(t);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`};
const fmtShort=t=>{const d=new Date(t);return `${pad(d.getDate())}/${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`};

const energyRenderers = createEnergyRenderers({
 $, fmt, fmtShort, median, ENERGY_METER_LABELS, energyReadings, hist,
 summarizeEnergyReadiness, summarizeOperatingReference, summarizeRawVmiMode, summarizeRawVmiSpeed,
 summarizeTemperatureLimit, summarizeFanEnergyEstimate, summarizeFanEnergyByManualMode,
 summarizeDailyEnergyClimateContext, summarizeEnergyReadings, summarizeEnergyClimateContext,
 summarizeMonthlyEnergyReadings
});

const historyInsightRenderers = createHistoryInsightRenderers({
 $, fmt, fmtShort, median, absoluteHumidity, isPlausibleHumidity, isPlausibleTemperature,
 summarizeWeeklyDiagnostic, analyzeSeasonalVentilation
});
/* Export CSV et sauvegarde/restauration délégués au contrôleur dédié. */
$('energyMeterForm').addEventListener('submit',async event=>{
 event.preventDefault();
 const meterType=$('energyMeterType').value;
 const timestamp=new Date($('energyMeterAt').value).getTime();
 const rawKwh=$('energyMeterKwh').value.trim();
 const kwh=rawKwh===''?NaN:Number(rawKwh);
 const note=$('energyMeterNote').value;
 const id=meterType+':'+timestamp;
 try{
  const nextReadings=upsertEnergyReading(energyReadings,{id,meterType,t:timestamp,kwh,note});
  await dbSetMany([['energyReadings',nextReadings]]);
  energyReadings=nextReadings;
  $('energyMeterFormInfo').textContent='Index enregistré. Si un index existait déjà pour ce compteur à cette date, il a été remplacé.';
  $('energyMeterKwh').value='';
  $('energyMeterNote').value='';
  $('energyMeterAt').value=localDateTimeValue();
  energyRenderers.renderEnergyMeterTracking();
 }catch(error){
  $('energyMeterFormInfo').textContent=error.message;
 }
});
$('energyMeterAt').value=localDateTimeValue();
$('energyMeterHistory').addEventListener('click',async event=>{
 const button=event.target.closest('[data-energy-delete]');
 if(!button)return;
 const id=button.getAttribute('data-energy-delete');
 const nextReadings=energyReadings.filter(reading=>reading.id!==id);
 await dbSetMany([['energyReadings',nextReadings]]);
 energyReadings=nextReadings;
 energyRenderers.renderEnergyMeterTracking();
});

/* La VMI ne garde que ~800 relevés : on estime sa capacité en jours d'après le rythme réel des relevés
   et on prévient avant que des relevés non téléchargés soient écrasés. */
function renderFreshness(){
 const box=$('fresh');
 const estimate=estimateHistoryRetention(hist,{now:Date.now(),minValid:MIN_VALID,dayMs:DAY,capacity:800});
 const view=buildHistoryFreshnessView({estimate,lastSync:meta.lastSync,fmtShort});
 box.className=view.className;
 box.textContent=view.text;
}
setInterval(renderFreshness,60000);

/* ---------- Diagnostic ---------- */
function buildDiagnostic(){
 const L=[];
 const ago=t=>t?Math.round((Date.now()-t)/1000)+' s':'jamais';
 L.push(`VMI Purevent – diagnostic – version ${APP_VERSION} – ${new Date().toLocaleString('fr-FR')}`);
 L.push('Navigateur : '+navigator.userAgent);
 L.push(`Bluetooth : ${navigator.bluetooth?'disponible':'indisponible'} · connecté : ${connected()?'oui':'non'} · service worker : ${'serviceWorker' in navigator?(navigator.serviceWorker.controller?'actif':'non actif'):'absent'} · SheetJS : ${window.XLSX?'chargé':'non chargé'}`);
 const valid=hist.filter(r=>r.t>=MIN_VALID);
 L.push(`Historique : ${hist.length} relevés dont ${valid.length} valides`);
 if(valid.length){
  const ts=valid.map(r=>r.t);
  L.push(`  période : ${fmtLocal(ts[0])} → ${fmtLocal(ts[ts.length-1])}`);
  const gaps=[];for(let i=1;i<ts.length;i++)if(ts[i]-ts[i-1]>2*3600e3)gaps.push(`${fmtShort(ts[i-1])} → ${fmtShort(ts[i])} (${((ts[i]-ts[i-1])/3600e3).toFixed(1)} h)`);
  L.push(`  trous > 2 h : ${gaps.length}${gaps.length?' : '+gaps.slice(0,8).join(' ; '):''}`);
  const miss=k=>valid.filter(r=>r[k]==null).length;
  L.push(`  valeurs manquantes : salon T ${miss('st')}, ext. VMI+ T ${miss('tExt')}, salon HR ${miss('sh')}, sonde 1 T ${miss('t1')}, air entrant T ${miss('te')}, air entrant HR ${miss('he')}, régime ${miss('rpm')}`);
  for(const [key,label] of [['st','Salon'],['t1','Sonde résistances'],['te','Air entrant']]){
   const extreme=valid.filter(r=>Number.isFinite(r[key])&&r[key]>40);
   L.push(`  Température >40°C – ${label} : ${extreme.length}${extreme.length?' · '+extreme.slice(0,8).map(r=>fmtLocal(r.t)+' = '+r[key]+'°C').join(' ; '):''}`);
  }
  for(const [tk,hk,label] of [['st','sh','Salon'],['t1','h1','Sonde résistances'],['te','he','Air entrant']]){
   const extreme=valid.map(r=>({r,v:Number.isFinite(r[tk])&&Number.isFinite(r[hk])?absoluteHumidity(r[tk],r[hk]):null})).filter(x=>Number.isFinite(x.v)&&x.v>35);
   L.push(`  Humidité absolue calculée >35 g/m³ – ${label} : ${extreme.length}${extreme.length?' · '+extreme.slice(0,8).map(x=>fmtLocal(x.r.t)+' = '+x.v.toFixed(1)).join(' ; '):''}`);
  }
  L.push(`  relevés avec compteur de jours : ${valid.filter(r=>Number.isFinite(r.d)).length} · avec date brute : ${valid.filter(r=>r.rk).length}`);
 }
 L.push(`Direct : ${live.length} relevés${live.length?` (du ${fmtShort(live[0].t)} au ${fmtShort(live[live.length-1].t)})`:''}`);
 L.push(`Synchro : dernière ${meta.lastSync?fmtLocal(meta.lastSync):'jamais'} · mesures reçues : salon ${ago(lastSeen.salon)}, sondes ${ago(lastSeen.probes)}, état ${ago(lastSeen.state)}`);
 L.push(`Affichage : source ${source}, jour ${selectedDate||'aucun'}, période ${daysSetting?daysSetting+' j':'tout'}`);
 L.push('Graphiques : '+['chartRH','chartHA','chartTemp','chartRPM'].map(id=>`${id} ${(($(id).innerHTML.match(/<path/g))||[]).length} courbe(s)`).join(' · '));
 L.push('Téléchargement : '+(download.on?'en cours':'inactif')+` · ${$('dlp').textContent||'—'}`);
 L.push('Commandes : '+($('cmdResult').textContent||'—'));
 L.push('Erreurs : '+(errors.length?'\n  '+errors.join('\n  '):'aucune'));
 L.push('Journal (25 dernières lignes) :');
 logLines.slice(-25).forEach(x=>L.push('  '+x));
 return L.join('\n');
}
$('diagBtn').onclick=()=>{$('diagOut').textContent=buildDiagnostic()};
$('diagCopy').onclick=async()=>{
 const txt=buildDiagnostic();$('diagOut').textContent=txt;
 try{await navigator.clipboard.writeText(txt);showError('Diagnostic copié : colle-le dans la conversation.')}
 catch(e){showError('Copie impossible : sélectionne le texte du diagnostic puis copie-le à la main.')}
};

/* ---------- Graphiques SVG ---------- */
/* Le direct reste une vue facultative ; toutes les analyses utilisent l’historique importé/téléchargé. */
function selectedData(){return selectDataRange(source==='live'?live:hist,{selectedDate,daysSetting})}
function selectedHistoricalData(){return selectDataRange(hist,{selectedDate,daysSetting})}
/* Affichage de la comparaison calculée par le module d'analyse. */
function analyzeSpeeds(data){
 const min=Number($('minSamples').value);
 const result=analyzeSpeedLevels(data,min,Number($('targetRH').value));
 const groups=result.groups;
 let html='<table><thead><tr><th>Niveau manuel</th><th>Relevés</th><th>Jours mesurés</th><th>Maximum de jours communs avec un autre niveau</th><th>HR médiane</th><th>HA salon</th><th>Écart HA</th><th>Temps couvert</th><th>RPM médian</th><th>Part avec air entrant plus sec</th></tr></thead><tbody>';
 for(const g of groups){
  const span=g.spanHours>=24?fmt(g.spanHours/24)+' j':g.spanHours>0?fmt(g.spanHours)+' h':'–';
  html+='<tr><td>'+g.v+'</td><td>'+g.n+'</td><td>'+g.daysCovered+'</td><td>'+g.sharedDays+'</td><td>'+(g.rh==null?'–':fmt(g.rh)+' %')+'</td><td>'+(g.ha==null?'–':fmt(g.ha)+' g/m³')+'</td><td>'+(g.delta==null?'–':fmt(g.delta)+' g/m³')+'</td><td>'+span+'</td><td>'+(g.rpm==null?'–':fmt(g.rpm)+' ('+g.rpmSamples+')')+'</td><td>'+(g.dryingShare==null?'–':fmt(g.dryingShare*100)+' % ('+g.deltaSamples+')')+'</td></tr>';
 }
 html+='</tbody></table>';
 const usable=groups.filter(g=>g.n>=min);
 let advice='';
 if(result.status==='no-speed-data')advice='Aucun relevé ne contient un niveau manuel identifié. Les codes bruts VMI+ ne sont volontairement pas assimilés aux niveaux 1/2/3. L’analyse reste donc indisponible avec cet import seul.';
 else if(result.status==='insufficient')advice='Données insuffisantes : il faut au moins '+min+' relevés identifiés par niveau pour établir une comparaison. Les résultats partiels restent visibles mais ne permettent pas de conclure.';
 else advice='Comparaison descriptive disponible pour '+usable.map(g=>'niveau '+g.v).join(', ')+'. Le nombre de jours communs affiché correspond au meilleur recoupement avec un seul autre niveau, et non à l’addition de dates provenant de plusieurs comparaisons. Les statistiques générales restent descriptives : les heures, la météo et l’occupation peuvent différer. Aucun niveau n’est désigné comme optimal.';
 const context=analyzeSpeedTimeContext(data,{minSamples:5,minDays:2});
 let contextHtml='<h4>Comparaison par tranche horaire et dates communes</h4><p class="muted">Chaque paire de niveaux est comparée séparément, dans la même tranche de 6 h et uniquement sur les mêmes dates calendaires. Il faut au moins 2 dates communes et 5 relevés par niveau sur ces dates. Les relevés sont d’abord résumés par jour, puis chaque jour reçoit le même poids dans la médiane finale.</p>';
 const readyComparisons=context.comparisons.filter(item=>item.ready);
 if(!readyComparisons.length){
  const overlaps=context.comparisons.filter(item=>item.sharedDayCount>0);
  if(!overlaps.length){
   contextHtml+='<div class="advice">Aucune date commune n’a été trouvée entre deux niveaux manuels dans une même tranche horaire. Il n’est donc pas possible de neutraliser suffisamment les différences de dates. Les codes bruts Vitesse ne sont pas utilisés.</div>';
  }else{
   contextHtml+='<table><thead><tr><th>Horaire</th><th>Paire de niveaux</th><th>Dates communes</th><th>Relevés sur ces dates</th><th>État</th></tr></thead><tbody>';
   for(const item of overlaps){
    contextHtml+='<tr><td>'+item.label+'</td><td>'+item.speeds[0]+' / '+item.speeds[1]+'</td><td>'+item.sharedDayCount+' / '+context.minDays+'</td><td>'+item.sampleCountFirst+' / '+item.sampleCountSecond+'</td><td>'+item.reason+'</td></tr>';
   }
   contextHtml+='</tbody></table><div class="advice">Les recoupements actuels ne satisfont pas les critères minimaux. Aucune médiane comparative n’est affichée : c’est préférable à une comparaison trompeuse.</div>';
  }
 }else{
  contextHtml+='<table><thead><tr><th>Horaire</th><th>Paire</th><th>Jours communs</th><th>Relevés A / B</th><th>HA air entrant A / B</th><th>Écart HA A / B</th><th>Écart météo B − A</th><th>Différence d’écart B − A</th></tr></thead><tbody>';
  for(const item of readyComparisons){
   const first=item.first,second=item.second;
   const incoming=first.medianIncomingHA==null||second.medianIncomingHA==null?'–':fmt(first.medianIncomingHA)+' / '+fmt(second.medianIncomingHA)+' g/m³';
   const delta=first.medianDeltaHA==null||second.medianDeltaHA==null?'–':fmt(first.medianDeltaHA)+' / '+fmt(second.medianDeltaHA)+' g/m³';
   const weatherDifference=item.medianIncomingHADifference==null?'–':(item.medianIncomingHADifference>0?'+':'')+fmt(item.medianIncomingHADifference)+' g/m³';
   const deltaDifference=item.medianDeltaHADifference==null?'–':(item.medianDeltaHADifference>0?'+':'')+fmt(item.medianDeltaHADifference)+' g/m³';
   contextHtml+='<tr><td>'+item.label+'</td><td>'+item.speeds[0]+' / '+item.speeds[1]+'</td><td>'+item.sharedDayCount+'</td><td>'+item.sampleCountFirst+' / '+item.sampleCountSecond+'</td><td>'+incoming+'</td><td>'+delta+'</td><td>'+weatherDifference+'</td><td>'+deltaDifference+'</td></tr>';
  }
  contextHtml+='</tbody></table><div class="advice">HA air entrant = contexte hygrométrique de l’air extérieur introduit. « Écart météo B − A » mesure la différence d’humidité absolue entrante entre les deux modes. L’écart HA = humidité absolue intérieure moins air entrant ; « Différence d’écart » est calculée date par date avant agrégation. Les deux niveaux sont mesurés les mêmes jours et dans la même tranche, mais pas nécessairement aux mêmes minutes. Cette comparaison ne contrôle pas l’occupation, les apports d’humidité ni tous les écarts météo ; elle ne prouve pas un effet causal et ne désigne pas une vitesse optimale.</div>';
 }

 const periods=compareOperatingPeriods(data,{periodDays:7,minSamples:12,minDays:3});
 let periodHtml='<h4>Évolution entre deux périodes successives</h4><p class="muted">Comparaison sur 7 jours consécutifs, à Mode et tranche horaire identiques. Minimum : 12 relevés et 3 jours distincts dans chacune des deux périodes.</p>';
 if(periods.status!=='comparison-available'){
  periodHtml+='<div class="advice">Pas encore assez de données Mode réparties sur deux périodes successives comparables. Il faut au moins 12 relevés sur 3 jours dans chaque période, pour un même Mode et une même tranche horaire. Les codes Vitesse bruts ne sont pas utilisés.</div>';
 }else{
  periodHtml+='<p class="muted">Période précédente : '+periods.periods[0].start+' au '+periods.periods[0].end+' · Période récente : '+periods.periods[1].start+' au '+periods.periods[1].end+'.</p>';
  periodHtml+='<table><thead><tr><th>Mode / horaire</th><th>Relevés / jours<br>précédent → récent</th><th>Débit (m³/h)<br>médiane · Δ</th><th>RPM<br>médiane · Δ</th><th>PWM brut<br>médiane · Δ</th><th>Pression moteur brute<br>médiane · Δ</th></tr></thead><tbody>';
  for(const item of periods.comparisons.filter(entry=>entry.comparable)){
   const show=key=>{
    const value=item.deltas[key];
    if(!value)return '–';
    const percent=value.relativePercent==null?'': ' ('+(value.relativePercent>0?'+':'')+fmt(value.relativePercent)+' %)';
    return fmt(value.previous)+' → '+fmt(value.current)+' · '+(value.absolute>0?'+':'')+fmt(value.absolute)+percent;
   };
   periodHtml+='<tr><td>'+item.mode+' · '+item.label+'</td><td>'+item.previous.sampleCount+'/'+item.previous.dayCount+' → '+item.current.sampleCount+'/'+item.current.dayCount+'</td><td>'+show('debit')+'</td><td>'+show('rpm')+'</td><td>'+show('vmiPwmRaw')+'</td><td>'+show('motorPressureRaw')+'</td></tr>';
  }
  periodHtml+='</tbody></table><div class="advice">Les écarts sont descriptifs, sans seuil automatique d’alerte. Une évolution du débit, du régime ou des signaux bruts ne prouve pas un filtre encrassé ni une panne. Les changements de météo, d’installation, de réglage, d’entretien et les conditions d’utilisation peuvent expliquer une partie des différences.</div>';
 }
 $('speedAnalysis').innerHTML=html+'<div class="advice">'+advice+'</div>'+contextHtml+periodHtml;
}
function render(){
 const data=selectedData();
 const analysisData=selectedHistoricalData();
 const dashboardData=$('dashboardDataStatus');
 const dashboardAnalysis=$('dashboardAnalysisStatus');
 dashboardData.textContent=analysisData.length?`${analysisData.length} relevés historiques dans la période sélectionnée.`:'Aucun relevé historique exploitable dans la période sélectionnée. Importe un export VMI+.';
 const dashboardDiagnosis=buildHygrometricDiagnosis(analysisData);
 dashboardAnalysis.textContent=dashboardDiagnosis.status==='analysis-available'?'Des constats hygrométriques peuvent être établis à partir de l’historique.':'Historique encore insuffisant pour établir un diagnostic fiable.';
 $('liveCount').textContent=live.length;
 const rangeLabel=selectedDate?'jour '+selectedDate:(daysSetting?daysSetting+' derniers jours':'toute la période');
 $('historyStatus').textContent=`Graphiques : ${data.length} relevés · ${source==='live'?'enregistrement direct facultatif':'historique importé / VMI'} · ${rangeLabel}. Analyses et diagnostics : historique importé / VMI uniquement.`;
 const lastRpm=[...hist].reverse().find(r=>Number.isFinite(r.rpm));
 $('rpm').textContent=lastRpm?lastRpm.rpm:'–';
 const quality=summarizeDataQuality(analysisData);
 renderVmiAssistant(analysisData,{targetRH:Number($('targetRH').value),minSamples:Number($('minSamples').value),energyReadings,meterHistory:hist,onError:log});
 const qualityBox=$('dataQuality');
 const coreCoverage=quality.fieldCoverage.filter(field=>quality.coreSensorKeys.includes(field.key));
 const missingDetails=coreCoverage.filter(field=>field.missingCount>0)
  .map(field=>`${field.label} : ${field.missingCount} absent(s)`);
 const invalidDetails=quality.fields.map(field=>`${field.label} : ${field.invalidCount} aberrant(s)`);
 const coverageText=quality.total
  ? `${quality.completeHygrometricRecords}/${quality.total} relevés avec les quatre mesures présentes (air intérieur et air entrant) (${fmt(quality.hygrometricCoveragePercent)} %).`
  : 'Aucun relevé historique dans la période sélectionnée.';
 const missingText=missingDetails.length
  ? ' Mesures absentes : '+missingDetails.join(' · ')+'.'
  : '';
 const invalidText=invalidDetails.length
  ? ` ${quality.affectedRecords} relevé(s) contiennent des valeurs physiquement improbables (${invalidDetails.join(' · ')}). Ces valeurs sont conservées dans l’historique et les exports, mais écartées des calculs concernés.`
  : ' Aucune valeur physiquement aberrante détectée sur les capteurs contrôlés.';
 const spikeText=quality.transientSpikes.count
  ? ' '+quality.transientSpikes.count+' pic(s) isolé(s) à vérifier : '+quality.transientSpikes.candidates.slice(0,5).map(item=>item.label+' ('+fmt(item.value)+' '+item.unit+', '+new Date(item.timestamp).toLocaleString('fr-FR')+')').join(' · ')+'. Un pic isolé est un indice de variation brusque, pas une preuve de panne.'
  : ' Aucun pic isolé répondant aux critères temporels n’a été détecté.';
 qualityBox.className=quality.hasAnomalies||quality.transientSpikes.count?'advice warn':'advice';
 qualityBox.textContent='Contrôle qualité de l’historique analysé : '+coverageText+missingText+invalidText+spikeText+' Les données manquantes réduisent la couverture ; elles ne sont pas considérées comme des anomalies.';
 renderCharts(data,selectedDate,$);
 historyInsightRenderers.renderRecommendation(analysisData);historyInsightRenderers.renderSeasonalAdvice(analysisData);hygrometricRenderers.renderHygrometricPeriods(analysisData);hygrometricRenderers.renderIntelligentDiagnosis(analysisData);
 hygrometricRenderers.renderTemporalAnalysis(analysisData);analyzeSpeeds(analysisData);energyRenderers.renderEnergyReadiness(analysisData);energyRenderers.renderFanEnergyEstimate(analysisData);energyRenderers.renderDailyEnergyClimateContext(analysisData);historyInsightRenderers.renderWeeklyDiagnostic(analysisData);renderFreshness();
}
/* Initialisation des contrôleurs après la création du store et de l'état applicatif. */
createImportController({
 $, showError, log, isCsvFile, parseCsvRows, findVmiHeaderRowIndex, getColumnMapping, recFrom, ingest
});
createHistoryExportController({
 $, getState: () => ({ hist, live, meta, energyReadings }),
 setState: next => { hist = next.hist; live = next.live; meta = next.meta; energyReadings = next.energyReadings; },
 dbSetMany, createBackupSnapshot, mergeBackupData, pruneHistory, psychro, pad, localDay,
 minValid: MIN_VALID, maxHistory: HIST_MAX, render
});

/* Les commandes qui modifient l'état restent dans app.js, propriétaire de cet état. */
$('clearImport').onclick=async()=>{
 if(confirm('Effacer tout l’historique importé ?')){
  hist=[];await dbSet('hist',[]);$('importInfo').textContent='';render();
 }
};
$('histBtn').onclick=()=>{source='hist';render()};
$('liveBtn').onclick=()=>{source='live';render()};
$('dayPicker').onchange=e=>{selectedDate=e.target.value||null;resetChartViews();render()};
$('clearDay').onclick=()=>{selectedDate=null;$('dayPicker').value='';resetChartViews();render()};
$('prev').onclick=()=>{selectedDate=shiftDay(selectedDate,-1);$('dayPicker').value=selectedDate;resetChartViews();render()};
$('next').onclick=()=>{selectedDate=shiftDay(selectedDate,1);$('dayPicker').value=selectedDate;resetChartViews();render()};
document.querySelectorAll('[data-days]').forEach(button=>button.onclick=()=>{
 daysSetting=Number(button.dataset.days);selectedDate=null;$('dayPicker').value='';resetChartViews();render();
});
$('clearLive').onclick=async()=>{
 if(confirm('Effacer les relevés en direct ?')){
  live=[];await dbSet('live',[]);$('liveCount').textContent='0';render();
 }
};
function downloadLiveText(content,name,type){
 const blob=new Blob(['\\ufeff',content],{type});
 const url=URL.createObjectURL(blob),anchor=document.createElement('a');
 anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('csv').onclick=()=>{
 const keys=['t','st','sh','t1','h1','te','he','rpm','fil','vit','boost','hol'];
 const rows=[keys.join(';'),...live.map(row=>keys.map(key=>key==='t'?new Date(row.t).toISOString():(row[key]!=null?row[key]:'')).join(';'))];
 downloadLiveText(rows.join('\\n'),'vmi-purevent-live.csv','text/csv;charset=utf-8');
};

$('targetRH').onchange=render;$('minSamples').onchange=render;

setInterval(()=>{if(cur.sal_t!==undefined)updateLiveMetrics();else $('sampleAge').textContent=buildLiveFreshnessText(lastSeen)},5000);
$('copyLog').onclick=()=>navigator.clipboard.writeText(logLines.join('\n')).then(()=>showError('Journal copié.'),showError);
$('clearLog').onclick=()=>{logLines=[];$('log').textContent=''};
$('themeBtn').onclick=()=>{
 const root=document.documentElement;
 const dark=root.dataset.theme?root.dataset.theme==='dark':matchMedia('(prefers-color-scheme: dark)').matches;
 root.dataset.theme=dark?'light':'dark';
 try{localStorage.setItem('vmi_modulaire_theme',root.dataset.theme)}catch(e){}
};
try{const theme=localStorage.getItem('vmi_modulaire_theme');if(theme)document.documentElement.dataset.theme=theme}catch(e){}
if(!navigator.bluetooth)showError('Web Bluetooth indisponible : ouvre cette page en HTTPS dans Chrome sur Android.');
init().then(autoConnectAuthorizedDevice).catch(e=>recordError('Initialisation impossible : '+(e.message||e)));
