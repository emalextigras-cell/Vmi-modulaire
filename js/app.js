import { DAY, pad, localDay, dayStart, shiftDay, fmt, num, MIN_VALID, HIST_MAX } from './modules/date-utils.js';
import { pruneHistory, mergeImportedHistory } from './modules/history.js';
import { createBackupSnapshot, mergeBackupData } from './modules/backup.js';
import { $, sleep, APP_VERSION } from './modules/core.js';
import { createStore } from './modules/store.js';
import { fromOldRow } from './modules/legacy-migration.js';
import { median, analyzeSpeedLevels, analyzeSpeedTimeContext, analyzeHygrometricPeriods, summarizeDailyTrends, analyzeHourlyPatterns, detectRapidChanges, summarizeEnergyReadiness, summarizeRawVmiSpeed, summarizeRawVmiMode, summarizeOperatingReference, compareOperatingPeriods, buildHygrometricDiagnosis } from './modules/analysis.js';
import { renderCharts, resetChartViews } from './modules/charts.js';
import { SVC_C, CH_C, SVC_T, CH_T, frame, timeFrame, hex } from './modules/ble.js';
import { armDownloadTimeout } from './modules/sync.js';
import { parseCell, recFrom, getColumnMapping, parseCsvRows, isCsvFile } from './modules/dataio.js';
import { fixClock } from './modules/clock-correction.js';
import { absoluteHumidity, psychro, validTemp } from './modules/psychrometry.js';
import { summarizeDataQuality, isPlausibleHumidity, isPlausibleTemperature } from './modules/data-quality.js';


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
let manualDisconnect=false,commandQueue=Promise.resolve(),manualCommandPending=false,polling=false,autoDone=false;
let meta={},cur={},lastSeen={},live=[],hist=[],source='hist',selectedDate=null,daysSetting=30;
let logLines=[],dlFrames=0;
let download={on:false,rows:[],buf:'',total:0,sigs:new Set(),got:false,lastPacket:0,timeout:null};
const DB='VMI_PUREVENT_DB_TEST',STORE='data';
const { get: dbGet, set: dbSet } = createStore({ databaseName: DB, storeName: STORE, onError: message => log(message) });
const connected=()=>!!(chC&&dev&&dev.gatt&&dev.gatt.connected);

function showError(e){$('err').textContent=e?String(e.message||e):''}
function renderLog(){const p=$('log');p.textContent=logLines.slice(-70).join('\n');p.scrollTop=p.scrollHeight}
function log(s){logLines.push(`${new Date().toLocaleTimeString('fr-FR')} ${s}`);if(logLines.length>300)logLines.shift();if($('logDetails').open)renderLog()}
$('logDetails').addEventListener('toggle',()=>{if($('logDetails').open)renderLog()});
function setStatus(s,isConnected=false){$('st').textContent=s;$('bleState').textContent=isConnected?'Connecté':'Déconnecté';$('conn').disabled=isConnected;$('disc').disabled=!isConnected}

/* La lecture IndexedDB ancienne reste ici ; la conversion des lignes est isolée. */
async function readOldDatabase(){
 try{
  if(!indexedDB.databases)return null;
  const list=await indexedDB.databases();
  if(!list.some(d=>d.name==='VMI_DB'))return null;
  const old=await new Promise((res,rej)=>{const r=indexedDB.open('VMI_DB');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
  if(!old.objectStoreNames.contains('vmi_store')){old.close();return null}
  const get=k=>new Promise((res,rej)=>{const r=old.transaction('vmi_store','readonly').objectStore('vmi_store').get(k);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
  const out={hist:await get('vmi_hist'),live:await get('vmi_live')};old.close();return out;
 }catch(e){return null}
}
async function init(){
 let l=await dbGet('live'),h=await dbGet('hist');
 live=Array.isArray(l)?l:[];hist=Array.isArray(h)?h:[];
 meta=(await dbGet('meta'))||{};
 const migrated=await dbGet('migrated');
 if(!migrated&&!hist.length&&!live.length){
  const old=await readOldDatabase();
  if(old){
   if(Array.isArray(old.hist))hist=old.hist.map(fromOldRow);
   if(Array.isArray(old.live))live=old.live;
  }
  if(!hist.length){try{const x=JSON.parse(localStorage.getItem('vmi_hist')||'[]');if(Array.isArray(x))hist=x.map(fromOldRow)}catch(e){}}
  if(!live.length){try{const x=JSON.parse(localStorage.getItem('vmi_live')||'[]');if(Array.isArray(x))live=x}catch(e){}}
  await dbSet('migrated',true);
 }
 /* Les relevés datés d'avant 2025 ont une date fausse (horloge de la VMI) et ne peuvent pas être corrigés
    sans leur compteur de jours : on les retire, un nouvel import ou téléchargement les rétablit avec la bonne date. */
 const bad=hist.filter(r=>!(r&&r.t>=MIN_VALID)).length;
 if(bad){hist=hist.filter(r=>r&&r.t>=MIN_VALID);$('importInfo').textContent=`${bad} anciens relevés à date invalide ont été retirés. Réimporte ton export VMI+ ou récupère l’historique : ils reviendront avec la bonne date.`}
 hist.sort((a,b)=>a.t-b.t);
 await dbSet('hist',hist);if(live.length)await dbSet('live',live);
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
  cur.vit=a[34]+1; // code brut VMI : ne jamais le traiter comme niveau manuel\n   cur.boost=a[44];cur.hol=a[43];cur.rpm=null;
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
 const freshest=Math.max(lastSeen.salon||0,lastSeen.probes||0);
 $('sampleAge').textContent=lastSeen.salon&&lastSeen.probes?'Dernières mesures reçues : '+Math.max(0,Math.round((Date.now()-freshest)/1000))+' s':'Mesures partielles : en attente des deux trames capteurs.';
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
 cleanupConnection();setStatus('Déconnecté.');
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
async function connectBLE(){
 manualDisconnect=false;clearTimeout(reconnectTimer);showError('');
 if(!navigator.bluetooth){showError('Web Bluetooth indisponible. Utilise Chrome sur Android ou un navigateur compatible, en HTTPS.');return}
 try{
  dev=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:[SVC_C,SVC_T]});
  dev.removeEventListener('gattserverdisconnected',onDisconnect);dev.addEventListener('gattserverdisconnected',onDisconnect);
  setStatus('Connexion à '+(dev.name||'la VMI')+'…');
  const server=await dev.gatt.connect();await connectCharacteristics(server);
  setStatus('Connecté à '+(dev.name||'la VMI')+'.',true);startPolling();
  autoDone=false;setTimeout(autoHistory,3000);
 }catch(e){showError(e);setStatus('Connexion impossible.')}
}
async function reconnect(){
 if(manualDisconnect||!dev)return;
 try{const server=await dev.gatt.connect();await connectCharacteristics(server);setStatus('Reconnecté à '+(dev.name||'la VMI')+'.',true);startPolling()}
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
 pruneHist();dbSet('hist',hist);source='hist';selectedDate=null;$('dayPicker').value='';
 const lost=recs.length-kept.length;
 $('importInfo').textContent=`${label} : ${recs.length} relevés lus${fixed?`, dont ${fixed} dont la date a été corrigée (horloge de la VMI fausse)`:''}${lost?`, ${lost} ignorés (date invalide impossible à corriger)`:''}.`;
 log($('importInfo').textContent);
 render();
}

/* Téléchargement de l'historique : on s'arrête au premier relevé déjà connu, puis on coupe la connexion
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
 if(reachedCut&&dev&&dev.gatt&&dev.gatt.connected)dev.gatt.disconnect();
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

/* Import tableur */
const XLSX_URLS=['https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js','https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'];
function loadScript(url,ms=15000){
 return new Promise((res,rej)=>{
  const sc=document.createElement('script');
  const t=setTimeout(()=>{sc.remove();rej(new Error('délai dépassé'))},ms);
  sc.src=url;sc.onload=()=>{clearTimeout(t);res()};sc.onerror=()=>{clearTimeout(t);sc.remove();rej(new Error('échec du chargement'))};
  document.head.appendChild(sc);
 });
}
let xlsxPromise=null;
function loadXLSX(){
 if(window.XLSX)return Promise.resolve();
 if(!xlsxPromise)xlsxPromise=(async()=>{
  for(const u of XLSX_URLS){try{await loadScript(u);if(window.XLSX)return}catch(e){log('SheetJS : '+e.message+' ('+u+')')}}
  throw new Error('Impossible de charger la bibliothèque de lecture : l’import CSV/Excel demande une connexion internet (une seule fois). Le téléchargement par Bluetooth n’en a pas besoin.');
 })().catch(e=>{xlsxPromise=null;throw e});
 return xlsxPromise;
}
$('fx').onchange=async e=>{
 const file=e.target.files&&e.target.files[0];if(!file)return;showError('');
 try{
  let rows,spreadsheet=null;
  if(isCsvFile(file.name)){
   $('importInfo').textContent='Lecture du CSV…';
   rows=parseCsvRows(await file.text());
  }else{
   $('importInfo').textContent='Chargement de la bibliothèque Excel…';
   await loadXLSX();spreadsheet=XLSX;
   const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false});
   const sheet=wb.Sheets[wb.SheetNames[0]];
   if(!sheet)throw new Error('Aucune feuille trouvée.');
   rows=XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:''});
  }
  const columnMapping=getColumnMapping(rows[3]||[]);
  const recs=[];for(let i=4;i<rows.length;i++){const r=recFrom(rows[i],spreadsheet,columnMapping);if(r)recs.push(r)}
  ingest(recs,'Import');
 }catch(err){showError('Import impossible : '+err.message)}
 e.target.value='';
};
$('clearImport').onclick=async()=>{if(confirm('Effacer tout l’historique importé ?')){hist=[];await dbSet('hist',[]);$('importInfo').textContent='';render()}};
$('histBtn').onclick=()=>{source='hist';render()};
$('liveBtn').onclick=()=>{source='live';render()};
$('dayPicker').onchange=e=>{selectedDate=e.target.value||null;resetChartViews();render()};
$('clearDay').onclick=()=>{selectedDate=null;$('dayPicker').value='';resetChartViews();render()};
$('prev').onclick=()=>{selectedDate=shiftDay(selectedDate,-1);$('dayPicker').value=selectedDate;resetChartViews();render()};
$('next').onclick=()=>{selectedDate=shiftDay(selectedDate,1);$('dayPicker').value=selectedDate;resetChartViews();render()};
document.querySelectorAll('[data-days]').forEach(b=>b.onclick=()=>{daysSetting=Number(b.dataset.days);selectedDate=null;$('dayPicker').value='';resetChartViews();render()});
$('clearLive').onclick=async()=>{if(confirm('Effacer les relevés en direct ?')){live=[];await dbSet('live',[]);$('liveCount').textContent='0';render()}};
$('csv').onclick=()=>{
 const keys=['t','st','sh','t1','h1','te','he','rpm','fil','vit','boost','hol'];
 const rows=[keys.join(';'),...live.map(r=>keys.map(k=>k==='t'?new Date(r.t).toISOString():(r[k]!=null?r[k]:'')).join(';'))];
 downloadText(rows.join('\n'),'vmi-purevent-live.csv','text/csv;charset=utf-8');
};
function downloadText(content,name,type,bom=true){
 const blob=new Blob(bom?['\ufeff',content]:[content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

/* ---------- Export, sauvegarde et fraîcheur de l'historique ---------- */
const fmtLocal=t=>{const d=new Date(t);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`};
const fmtShort=t=>{const d=new Date(t);return `${pad(d.getDate())}/${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`};
const decFr=v=>(v==null||!Number.isFinite(v))?'':String(Math.round(v*100)/100).replace('.',',');
function histToCsv(rows){
 const head=['date_heure','salon_temp_C','salon_HR_pct','temperature_exterieure_vmi_plus_C','salon_HA_calculee_g_m3','salon_rosee_C','sonde1_temp_C','sonde1_HR_pct','vmi_plus_P0_Hum_abs_brute','air_entrant_temp_C','air_entrant_HR_pct','vmi_plus_P1_Hum_abs_brute','air_entrant_HA_calculee_g_m3','regime_tr_min','etat_filtre_brut','indice_encrassement_pct','duree_fonctionnement_j','debit_vmi_plus_brut','vitesse_vmi_plus_code_brut','pwm_vmi_plus_brut','mode_vmi_plus_brut','volume_vmi_plus_m3_brut','cons_dp_vmi_plus_brut'];
 const lines=[head.join(';')];
 for(const r of rows){
  const p=psychro({st:r.st,sh:r.sh,te:r.te,he:r.he});
  lines.push([fmtLocal(r.t),decFr(r.st),decFr(r.sh),decFr(r.tExt),decFr(p.haIn),decFr(p.dewIn),decFr(r.t1),decFr(r.h1),decFr(r.vmiAbsP0),decFr(r.te),decFr(r.he),decFr(r.vmiAbsP1),decFr(p.haOut),decFr(r.rpm),decFr(r.fil),decFr(r.filterIndexPct),decFr(r.d),decFr(r.debit),decFr(r.vmiSpeedRaw),decFr(r.vmiPwmRaw),decFr(r.vmiModeRaw),decFr(r.volumeRaw),decFr(r.consDpRaw)].join(';'));
 }
 return lines.join('\r\n');
}
function makeBackup(){return createBackupSnapshot({hist,live,meta})}
function restoreBackup(obj){
 const previousLastSync=meta.lastSync;
 const result=mergeBackupData({backup:obj,currentHist:hist,currentLive:live,currentMeta:meta,minValid:MIN_VALID});
 hist=result.hist;live=result.live;meta=result.meta;
 pruneHist();dbSet('hist',hist);dbSet('live',live);
 if(meta.lastSync!==previousLastSync)dbSet('meta',meta);
 return {add:result.addedHistory,enriched:result.enrichedHistory,addL:result.addedLive};
}
$('expHist').onclick=()=>{
 const rows=hist.filter(r=>r.t>=MIN_VALID);
 if(!rows.length){$('backupInfo').textContent='Aucun historique à exporter.';return}
 downloadText(histToCsv(rows),`vmi-historique-${localDay()}.csv`,'text/csv;charset=utf-8');
 $('backupInfo').textContent=`${rows.length} relevés exportés (séparateur « ; », virgule décimale, prêt pour Excel).`;
};
$('expBackup').onclick=()=>{
 downloadText(JSON.stringify(makeBackup()),`vmi-sauvegarde-${localDay()}.json`,'application/json',false);
 $('backupInfo').textContent=`Sauvegarde créée : ${hist.length} relevés d’historique, ${live.length} relevés en direct.`;
};
$('restoreFile').onchange=async e=>{
 const file=e.target.files&&e.target.files[0];if(!file)return;
 try{
  const obj=JSON.parse(await file.text());
  const {add,enriched,addL}=restoreBackup(obj);
  $('backupInfo').textContent=`Sauvegarde restaurée : ${add} relevés d’historique ajoutés, ${enriched} complétés et ${addL} relevés en direct ajoutés.`;
  render();
 }catch(err){$('backupInfo').textContent='Restauration impossible : '+err.message}
 e.target.value='';
};
/* La VMI ne garde que ~800 relevés : on estime sa capacité en jours d'après le rythme réel des relevés
   et on prévient avant que des relevés non téléchargés soient écrasés. */
function renderFreshness(){
 const box=$('fresh');
 const rows=hist.filter(r=>r.t>=MIN_VALID);
 if(!rows.length){box.className='advice';box.textContent='Aucun historique mémorisé. Connecte la VMI pour le télécharger : elle ne garde que ses 800 derniers relevés (environ 4 semaines).';return}
 const newest=rows[rows.length-1].t,age=(Date.now()-newest)/DAY;
 const spanDays=Math.max(1,Math.min(14,(newest-rows[0].t)/DAY));
 const perDay=rows.filter(r=>r.t>=newest-14*DAY).length/spanDays;
 const cap=perDay>0?Math.min(60,Math.max(7,800/perDay)):28;
 const left=cap-age;
 let cls='advice good';
 let msg=`Historique à jour jusqu’au ${fmtShort(newest)} (il y a ${age<1?Math.max(0,Math.round(age*24))+' h':age.toFixed(1)+' j'}). La VMI garde environ ${Math.round(cap)} jours de relevés : télécharge avant le ${fmtShort(newest+cap*DAY)}.`;
 if(left<=1){cls='advice warn';msg+=' ⚠ Des relevés ont peut-être déjà été écrasés : connecte-toi maintenant.'}
 else if(age>=14||left<7){cls='advice warn';msg+=' Pense à te connecter bientôt.'}
 if(meta.lastSync)msg+=` Dernière synchronisation : ${fmtShort(meta.lastSync)}.`;
 box.className=cls;box.textContent=msg;
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
function selectDataRange(records){
 const data=(Array.isArray(records)?records:[]).filter(r=>r&&r.t>=MIN_VALID).sort((a,b)=>a.t-b.t);
 if(selectedDate){const start=dayStart(selectedDate),end=dayStart(shiftDay(selectedDate,1));return data.filter(r=>r.t>=start&&r.t<end)}
 if(daysSetting&&data.length){const end=data[data.length-1].t;return data.filter(r=>r.t>=end-daysSetting*86400000)}
 return data;
}
/* Le direct reste une vue facultative ; toutes les analyses utilisent l'historique importé/téléchargé. */
function selectedData(){return selectDataRange(source==='live'?live:hist)}
function selectedHistoricalData(){return selectDataRange(hist)}
function formatDuration(ms){
 const minutes=Math.round(ms/60000),hours=Math.floor(minutes/60),days=Math.floor(hours/24);
 if(days)return days+' j '+(hours%24)+' h';
 if(hours)return hours+' h '+(minutes%60)+' min';
 return minutes+' min';
}
function renderHygrometricPeriods(data){
 const box=$('hygroPeriods');
 const result=analyzeHygrometricPeriods(data,{threshold:1,maxGapHours:2});
 if(result.sampleCount<2||!result.observedDurationMs){
  box.className='advice';
  box.textContent=result.sampleCount<2?'Pas assez de mesures simultanées valides pour analyser une durée.':'Aucune durée exploitable : les mesures sont trop espacées (plus de 2 h entre deux relevés).';
  return;
 }
 const total=result.observedDurationMs;
 const pct=value=>Math.round(value/total*100);
 let message='Sur '+formatDuration(total)+' de périodes observées (sans extrapoler les trous de plus de 2 h) : ';
 message+='Air entrant plus sec : '+formatDuration(result.dryDurationMs)+' ('+pct(result.dryDurationMs)+' %). ';
 message+='Air entrant plus humide : '+formatDuration(result.humidDurationMs)+' ('+pct(result.humidDurationMs)+' %). ';
 message+='Écart faible : '+formatDuration(result.neutralDurationMs)+' ('+pct(result.neutralDurationMs)+' %). ';
 message+='Écart médian salon − air entrant : '+fmt(result.medianDelta)+' g/m³. ';
 message+='Plus longue séquence asséchante estimée : '+formatDuration(result.longestDryMs)+'. ';
 message+='Plus longue séquence où l’air entrant est plus humide : '+formatDuration(result.longestHumidMs)+'.';
 if(result.gapCount)message+=' '+result.gapCount+' interruption(s) de plus de 2 h exclue(s) du calcul.';
 box.className=result.humidDurationMs>result.dryDurationMs?'advice warn':'advice';
 box.textContent=message;
}

function renderTemporalAnalysis(data){
 const dailyBox=$('dailyTrends'), hourlyBox=$('hourlyPatterns'), anomalyBox=$('rapidChanges');
 const daily=summarizeDailyTrends(data);
 if(!daily.days.length){
  dailyBox.textContent='Pas assez de températures et d’humidités valides pour établir une tendance journalière.';
 }else{
  const rows=daily.days.slice(-7).map(d=>{
   const parts=d.date.split('-').map(Number),date=new Date(parts[0],parts[1]-1,parts[2]);
   return date.toLocaleDateString('fr-FR',{weekday:'short',day:'2-digit',month:'2-digit'})+
    ' : '+fmt(d.medianRH)+' % HR · '+fmt(d.medianAbsoluteHumidity)+' g/m³ HA · '+d.sampleCount+' relevés';
  });
  let message='Médianes journalières du salon (7 derniers jours disponibles) : '+rows.join(' | ')+'. ';
  if(daily.changeRH!=null){
   const direction=daily.changeRH>0?'hausse':daily.changeRH<0?'baisse':'stabilité';
   message+='Entre les deux derniers jours suffisamment documentés : '+direction+' de '+fmt(Math.abs(daily.changeRH))+' points d’humidité relative et variation de '+fmt(daily.changeAbsoluteHumidity)+' g/m³ d’humidité absolue.';
  }else message+='Il faut au moins 3 relevés par jour et deux jours suffisamment documentés pour calculer une évolution.';
  dailyBox.textContent=message;
 }
 const hourly=analyzeHourlyPatterns(data,3);
 hourlyBox.textContent='Profils par tranche de 6 h (médiane salon ; minimum 3 relevés) : '+hourly.buckets.map(b=>
  b.label+' : '+(b.medianRH==null?'données insuffisantes':fmt(b.medianRH)+' % HR · '+fmt(b.medianDelta)+' g/m³ écart HA · '+b.sampleCount+' relevés')
 ).join(' | ')+'.';
 const events=detectRapidChanges(data);
 if(!events.length){
  anomalyBox.className='advice';
  anomalyBox.textContent='Aucune variation rapide dépassant les seuils de surveillance n’a été détectée dans les données valides de cette période.';
 }else{
  anomalyBox.className='advice warn';
  anomalyBox.textContent='Variations rapides à examiner (ce ne sont pas des diagnostics de panne) : '+events.slice(-5).reverse().map(e=>{
   const start=new Date(e.start).toLocaleString('fr-FR'),end=new Date(e.end).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
   return start+' → '+end+' : '+(e.deltaRH>0?'+':'')+fmt(e.deltaRH)+' points HR, '+(e.deltaAbsoluteHumidity>0?'+':'')+fmt(e.deltaAbsoluteHumidity)+' g/m³ HA';
  }).join(' | ')+(events.length>5?' | '+(events.length-5)+' autre(s) événement(s).':'.');
 }
}


function renderIntelligentDiagnosis(data){
 const result=buildHygrometricDiagnosis(data);
 const box=$('diagnosisStatus'), evidence=$('diagnosisEvidence'), limits=$('diagnosisLimits');
 const available=result.status==='analysis-available';
 const confidence='Couverture '+result.coverageLevel+' · '+result.sampleCount+' relevés valides · '+result.dayCount+' jour(s) · '+fmt(result.observedHours)+' h exploitables';
 box.className=available?'advice good':'advice warn';
 box.textContent=(available?'Analyse possible avec les données disponibles. ':'Diagnostic non concluant pour le moment. ')+confidence+'.';
 if(result.medianSampleIntervalMinutes!=null){
  box.textContent+=' Intervalle médian entre relevés : '+fmt(result.medianSampleIntervalMinutes)+' min.';
 }
 if(result.excludedGapCount){
  box.textContent+=' '+result.excludedGapCount+' interruption(s) de plus de '+result.maxGapHours+' h exclue(s)';
  if(result.largestExcludedGapHours>0)box.textContent+=' ; plus longue : '+fmt(result.largestExcludedGapHours)+' h';
  box.textContent+='.';
 }
 evidence.replaceChildren();
 if(!result.observations.length){
  const empty=document.createElement('p');
  empty.className='muted';
  empty.textContent='Aucun constat ne peut être établi avec les mesures disponibles.';
  evidence.append(empty);
 }else{
  result.observations.forEach((item,index)=>{
   const article=document.createElement('article');
   const heading=document.createElement('h4');
   const detail=document.createElement('p');
   const action=document.createElement('p');
   const tag=document.createElement('span');
   const level=item.level==='positive'?'favorable':item.level==='caution'?'à surveiller':'information';
   article.className='diagnosis-item diagnosis-'+(item.level==='positive'?'positive':item.level==='caution'?'caution':'info');
   tag.className='diagnosis-tag';
   tag.textContent=level;
   heading.textContent=(index+1)+'. '+item.title;
   detail.textContent=item.detail;
   action.className='diagnosis-action';
   action.textContent='À faire : '+item.recommendation;
   article.append(tag,heading,detail,action);
   if(item.basis&&Object.keys(item.basis).length){
    const proof=document.createElement('details');
    proof.className='diagnosis-proof';
    const proofTitle=document.createElement('summary');
    proofTitle.textContent='Voir les mesures et les critères';
    const list=document.createElement('dl');
    const labels={
     validSamples:'Relevés valides',requiredSamples:'Minimum de relevés requis',
     distinctDays:'Jours distincts',requiredDays:'Minimum de jours requis',
     observedHours:'Durée exploitable',requiredObservedHours:'Durée minimale requise',
     medianIndoorMinusIncomingHA:'Écart médian salon − air entrant',
     threshold:'Seuil appliqué',durationShare:'Part des durées observées',
     requiredDurationShare:'Part minimale requise',dryDurationShare:'Air entrant plus sec',
     humidDurationShare:'Air entrant plus humide',dominanceThreshold:'Seuil de dominance',
     firstDate:'Première date comparée',lastDate:'Dernière date comparée',
     firstMedianAbsoluteHumidity:'Humidité absolue médiane au départ',
     lastMedianAbsoluteHumidity:'Humidité absolue médiane à la fin',
     change:'Évolution mesurée',timeWindow:'Tranche horaire retenue',
     medianDelta:'Écart médian observé',sampleCount:'Nombre de relevés',
     dayCount:'Nombre de jours'
    };
    const percentKeys=new Set(['durationShare','requiredDurationShare','dryDurationShare','humidDurationShare','dominanceThreshold']);
    const hourKeys=new Set(['observedHours','requiredObservedHours']);
    const humidityKeys=new Set(['medianIndoorMinusIncomingHA','firstMedianAbsoluteHumidity','lastMedianAbsoluteHumidity','change','medianDelta','threshold']);
    Object.entries(item.basis).forEach(([key,value])=>{
     if(key==='unit'||value==null||!labels[key])return;
     const term=document.createElement('dt');
     const description=document.createElement('dd');
     term.textContent=labels[key];
     let shown;
     if(typeof value==='number'){
      if(percentKeys.has(key))shown=(value*100).toLocaleString('fr-FR',{maximumFractionDigits:1})+' %';
      else if(hourKeys.has(key))shown=value.toLocaleString('fr-FR',{maximumFractionDigits:1})+' h';
      else if(humidityKeys.has(key))shown=value.toLocaleString('fr-FR',{maximumFractionDigits:2})+' g/m³';
      else shown=value.toLocaleString('fr-FR',{maximumFractionDigits:1});
     }else shown=String(value);
     description.textContent=shown;
     list.append(term,description);
    });
    proof.append(proofTitle,list);
    article.append(proof);
   }
   evidence.append(article);
  });
 }
 const method=document.createElement('details');
 method.className='diagnosis-method';
 const methodTitle=document.createElement('summary');
 methodTitle.textContent='Méthode et seuils utilisés';
 const methodText=document.createElement('p');
 methodText.textContent='Version '+result.methodology.version+' · écart hygrométrique : '+fmt(result.methodology.dryDeltaThreshold)+' g/m³ · évolution intérieure : '+fmt(result.methodology.trendDeltaThreshold)+' g/m³ · minimum '+result.methodology.minimumSamples+' relevés sur '+result.methodology.minimumDistinctDays+' jours et '+result.methodology.minimumObservedHours+' h exploitables · interruptions de plus de '+fmt(result.methodology.maximumGapHours)+' h exclues · dominance requise : '+Math.round(result.methodology.dominantDurationShare*100)+' % · tranches horaires de '+result.methodology.hourlyBucketHours+' h (au moins '+result.methodology.hourlyMinimumSamples+' relevés sur '+result.methodology.hourlyMinimumDistinctDays+' jours).';
 method.append(methodTitle,methodText);
 evidence.append(method);
 limits.textContent='À garder en tête : '+result.limits.join(' ');
}

/* Affichage de la comparaison calculée par le module d'analyse. */
function analyzeSpeeds(data){
 const min=Number($('minSamples').value);
 const result=analyzeSpeedLevels(data,min,Number($('targetRH').value));
 const groups=result.groups;
 let html='<table><thead><tr><th>Niveau manuel</th><th>Relevés</th><th>Jours mesurés</th><th>Jours communs avec autres niveaux</th><th>HR médiane</th><th>HA salon</th><th>Écart HA</th><th>Temps couvert</th><th>RPM médian</th><th>Part avec air entrant plus sec</th></tr></thead><tbody>';
 for(const g of groups){
  const span=g.spanHours>=24?fmt(g.spanHours/24)+' j':g.spanHours>0?fmt(g.spanHours)+' h':'–';
  html+='<tr><td>'+g.v+'</td><td>'+g.n+'</td><td>'+g.daysCovered+'</td><td>'+g.sharedDays+'</td><td>'+(g.rh==null?'–':fmt(g.rh)+' %')+'</td><td>'+(g.ha==null?'–':fmt(g.ha)+' g/m³')+'</td><td>'+(g.delta==null?'–':fmt(g.delta)+' g/m³')+'</td><td>'+span+'</td><td>'+(g.rpm==null?'–':fmt(g.rpm)+' ('+g.rpmSamples+')')+'</td><td>'+(g.dryingShare==null?'–':fmt(g.dryingShare*100)+' % ('+g.deltaSamples+')')+'</td></tr>';
 }
 html+='</tbody></table>';
 const usable=groups.filter(g=>g.n>=min);
 let advice='';
 if(result.status==='no-speed-data')advice='Aucun relevé ne contient un niveau manuel identifié. Les codes bruts VMI+ ne sont volontairement pas assimilés aux niveaux 1/2/3. L’analyse reste donc indisponible avec cet import seul.';
 else if(result.status==='insufficient')advice='Données insuffisantes : il faut au moins '+min+' relevés identifiés par niveau pour établir une comparaison. Les résultats partiels restent visibles mais ne permettent pas de conclure.';
 else advice='Comparaison descriptive disponible pour '+usable.map(g=>'niveau '+g.v).join(', ')+'. Les jours communs indiquent sur combien de dates chaque niveau recoupe au moins un autre niveau analysable : plus ce nombre est faible, moins la comparaison est directe. Même avec des jours communs, les heures, la météo et l’occupation peuvent différer. Aucun niveau n’est désigné comme optimal.';
 const context=analyzeSpeedTimeContext(data,{minSamples:5,minDays:2});
 let contextHtml='<h4>Comparaison par tranche horaire</h4><p class="muted">Une tranche n’est comparée que si au moins deux niveaux manuels ont chacun 5 relevés minimum et au moins 2 dates communes dans cette tranche.</p>';
 if(!context.comparableBuckets.length){
  contextHtml+='<div class="advice">Pas encore assez de données réparties sur plusieurs jours et plusieurs niveaux dans une même tranche horaire. Les valeurs brutes VMI+ ne sont pas utilisées comme vitesses manuelles.</div>';
 }else{
  contextHtml+='<table><thead><tr><th>Horaire</th><th>Niveau</th><th>Relevés / jours</th><th>HR médiane</th><th>HA salon</th><th>Écart HA salon − entrant</th><th>RPM médian</th></tr></thead><tbody>';
  for(const bucket of context.comparableBuckets){
   for(const g of context.groups.filter(x=>x.bucket===bucket&&x.ready)){
    contextHtml+='<tr><td>'+g.label+'</td><td>'+g.speed+'</td><td>'+g.sampleCount+' / '+g.dayCount+' ('+g.sharedDays+' communes)</td><td>'+fmt(g.medianRH)+' %</td><td>'+fmt(g.medianIndoorHA)+' g/m³</td><td>'+(g.medianDeltaHA==null?'–':fmt(g.medianDeltaHA)+' g/m³ ('+g.deltaSamples+')')+'</td><td>'+(g.medianRPM==null?'–':fmt(g.medianRPM))+'</td></tr>';
   }
  }
  contextHtml+='</tbody></table><div class="advice">Cette lecture réduit une partie des différences horaires, mais ne contrôle pas la météo, les apports d’humidité, l’occupation ni le débit réel. Elle ne permet pas de désigner une vitesse optimale.</div>';
 }

 const periods=compareOperatingPeriods(data,{periodDays:7,minSamples:12,minDays:3});
 let periodHtml='<h4>Évolution entre deux périodes successives</h4><p class="muted">Comparaison sur 7 jours consécutifs, à Mode et tranche horaire identiques. Minimum : 12 relevés et 3 jours distincts dans chacune des deux périodes.</p>';
 if(periods.status!=='comparison-available'){
  periodHtml+='<div class="advice">Pas encore assez de données Mode réparties sur deux périodes successives comparables. Il faut au moins 12 relevés sur 3 jours dans chaque période, pour un même Mode et une même tranche horaire. Les codes Vitesse bruts ne sont pas utilisés.</div>';
 }else{
  periodHtml+='<p class="muted">Période précédente : '+periods.periods[0].start+' au '+periods.periods[0].end+' · Période récente : '+periods.periods[1].start+' au '+periods.periods[1].end+'.</p>';
  periodHtml+='<table><thead><tr><th>Mode / horaire</th><th>Relevés / jours<br>précédent → récent</th><th>Débit m³/h<br>médiane · Δ</th><th>RPM<br>médiane · Δ</th><th>PWM brut<br>médiane · Δ</th><th>Pression moteur brute<br>médiane · Δ</th></tr></thead><tbody>';
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
function renderEnergyReadiness(data){
 const result=summarizeEnergyReadiness(data);
 const labels={rpm:'Régime moteur',debit:'Débit VMI+ (m³/h confirmé)',vmiSpeedRaw:'Code vitesse VMI+ brut',vmiPwmRaw:'PWM brut',consDpRaw:'Cons DP brut'};
 let html='<table><thead><tr><th>Champ exporté</th><th>Mesures</th><th>Zéros</th><th>Manquants</th><th>Minimum</th><th>Maximum</th><th>Valeurs distinctes</th></tr></thead><tbody>';
 for(const f of result.fields){
  const distinct=f.distinct.length>8?f.distinct.slice(0,8).map(fmt).join(', ')+'…':f.distinct.map(fmt).join(', ')||'–';
  html+='<tr><td>'+(labels[f.key]||f.label)+'<br><small>'+f.unit+'</small></td><td>'+f.count+'</td><td>'+f.zeroCount+'</td><td>'+f.missingCount+'</td><td>'+(f.min==null?'–':fmt(f.min))+'</td><td>'+(f.max==null?'–':fmt(f.max))+'</td><td>'+distinct+'</td></tr>';
 }
 html+='</tbody></table>';

 const operating = summarizeOperatingReference(data);
 let operatingHtml='<h4>Référence descriptive du fonctionnement par mode VMI+</h4><p class="muted">Profil calculé à partir des relevés importés, en séparant strictement le champ Mode du code Vitesse brut. Les valeurs PWM, Pression moteur et Cons DP restent des signaux bruts.</p>';
 if(!operating.groups.length){
  operatingHtml+='<div class="advice">Aucune donnée Mode exploitable pour construire cette référence.</div>';
 }else{
  operatingHtml+='<table><thead><tr><th>Mode</th><th>Relevés / jours</th><th>Variable</th><th>Médiane</th><th>Plage observée</th></tr></thead><tbody>';
  for(const group of operating.groups){
   for(const field of group.fields){
    operatingHtml+='<tr><td>'+fmt(group.mode)+'</td><td>'+group.sampleCount+' / '+group.dayCount+'</td><td>'+field.label+'<br><small>'+field.unit+'</small></td><td>'+(field.median==null?'–':fmt(field.median))+'</td><td>'+(field.min==null?'–':fmt(field.min)+' – '+fmt(field.max))+'</td></tr>';
   }
  }
  operatingHtml+='</tbody></table>';
 }
 operatingHtml+='<div class="advice">'+operating.limits.join(' ')+'</div>';
 const modeGroups=summarizeRawVmiMode(data);
 let modeHtml='<h4>Débit et renouvellement théorique par mode VMI+</h4><p class="muted">Le champ « mode » est distinct du champ « Vitesse ». Débit en m³/h confirmé. Le mode 3 dispose d’une référence confirmée de 184 m³/h ; elle est affichée séparément des mesures historiques. Le taux est calculé à partir du volume du logement renseigné dans chaque relevé ; il décrit un renouvellement théorique, pas une mesure de l’air effectivement distribué dans chaque pièce.</p>';
 if(!modeGroups.length){modeHtml+='<div class="advice">Aucun mode VMI+ exploitable dans la période sélectionnée.</div>'}
 else{
  modeHtml+='<table><thead><tr><th>Mode VMI+</th><th>Relevés</th><th>Débit médian / référence</th><th>Min–max débit mesuré</th><th>Renouvellement théorique</th></tr></thead><tbody>';
  for(const group of modeGroups){modeHtml+='<tr><td>'+fmt(group.mode)+'</td><td>'+group.sampleCount+'</td><td>'+(group.medianDebit!=null?fmt(group.medianDebit)+' m³/h (médiane)':group.referenceDebit!=null?fmt(group.referenceDebit)+' m³/h (référence)':'–')+'</td><td>'+(group.minDebit==null?'–':fmt(group.minDebit)+' – '+fmt(group.maxDebit)+' m³/h')+'</td><td>'+(group.medianRenewalRate!=null?fmt(group.medianRenewalRate)+' vol/h':group.referenceRenewalRate!=null?fmt(group.referenceRenewalRate)+' vol/h (théorique)':'–')+'</td></tr>'}
  modeHtml+='</tbody></table>';
 }
 const rawGroups=summarizeRawVmiSpeed(data);
 let rawHtml='<h4>Débit selon le code vitesse brut VMI+</h4><p class="muted">Le code « Vitesse » est affiché séparément du mode. Les codes bruts ne sont pas assimilés aux niveaux manuels 1, 2 ou 3.</p>';
 if(!rawGroups.length){rawHtml+='<div class="advice">Aucun code vitesse brut exploitable dans la période sélectionnée.</div>'}
 else{
  rawHtml+='<table><thead><tr><th>Code vitesse brut</th><th>Relevés</th><th>Débit médian</th><th>Minimum</th><th>Maximum</th></tr></thead><tbody>';
  for(const group of rawGroups){rawHtml+='<tr><td>'+fmt(group.code)+'</td><td>'+group.sampleCount+'</td><td>'+(group.medianDebit==null?'–':fmt(group.medianDebit)+' m³/h')+'</td><td>'+(group.minDebit==null?'–':fmt(group.minDebit)+' m³/h')+'</td><td>'+(group.maxDebit==null?'–':fmt(group.maxDebit)+' m³/h')+'</td></tr>'}
  rawHtml+='</tbody></table>';
 }
 const volumes=data.map(r=>r?.volumeRaw).filter(v=>Number.isFinite(v)&&v>0);
 const volumeValues=[...new Set(volumes)].sort((a,b)=>a-b);
 const volumeMedian=median(volumes);
 let volumeHtml='<h4>Volume du logement enregistré dans la VMI+</h4>';
 if(volumeMedian==null){
  volumeHtml+='<div class="advice">Aucune valeur de volume (champ Vol(m³)) disponible dans cette période.</div>';
 }else{
  volumeHtml+='<div class="advice"><strong>'+fmt(volumeMedian)+' m³</strong> · '+volumes.length+' relevé(s) renseigné(s)'+
   (volumeValues.length>1?' · valeurs rencontrées : '+volumeValues.map(fmt).join(', ')+' m³':' · valeur constante dans les relevés')+
   '. Cette donnée correspond au volume du logement déclaré dans la VMI+, pas à un volume d’air réellement renouvelé.</div>';
 }
 $('energyReadiness').innerHTML=volumeHtml+html+operatingHtml+modeHtml+rawHtml+'<div class="advice">'+result.message+' Les valeurs brutes sont conservées ; aucune conversion des champs non documentés en watts, kWh ou rendement n’est appliquée. Le débit confirmé reste affiché en m³/h.</div>';
}

function renderRecommendation(data){
 const box=$('recommendation');
 const valid=data.filter(r=>Number.isFinite(r.st)&&isPlausibleTemperature(r.st)&&Number.isFinite(r.sh)&&isPlausibleHumidity(r.sh)&&Number.isFinite(r.te)&&isPlausibleTemperature(r.te)&&Number.isFinite(r.he)&&isPlausibleHumidity(r.he));
 box.className='advice';
 if(!valid.length){box.textContent='Pas assez de données historiques valides. Importe un export VMI+ ou télécharge l’historique depuis la VMI. Le Bluetooth en direct ne sert pas à produire ce diagnostic.';return}
 const recent=valid.slice(-Math.min(24,valid.length));
 const rh=median(recent.map(r=>r.sh)),ha=median(recent.map(r=>absoluteHumidity(r.st,r.sh))),haIn=median(recent.map(r=>absoluteHumidity(r.te,r.he)));
 const target=Number($('targetRH').value),delta=ha-haIn;
 let msg=`Sur les ${recent.length} derniers relevés exploitables : humidité relative médiane du salon ${fmt(rh)} %, humidité absolue du salon ${fmt(ha)} g/m³. `;
 if(rh>target+5)msg+=`L'humidité est au-dessus de ton objectif de ${target} %. Vérifie d'abord les sources de vapeur d'eau, les entrées d'air, les bouches d'extraction et l'état du filtre. `;
 else if(rh<target-5)msg+=`L'humidité est sous ton objectif de ${target} %. Il n'y a pas d'indice hygrométrique justifiant à lui seul d'augmenter la ventilation. `;
 else msg+=`L'humidité est proche de ton objectif de ${target} %. `;
 if(Number.isFinite(delta)){
  if(delta>1)msg+=`L'air entrant est actuellement plus sec en humidité absolue d'environ ${fmt(delta)} g/m³ : le renouvellement d'air a un potentiel d'assèchement.`;
  else if(delta< -1)msg+=`L'air entrant est actuellement plus humide en valeur absolue d'environ ${fmt(Math.abs(delta))} g/m³ : augmenter la vitesse ne garantit pas d'assécher le logement.`;
  else msg+="L'air entrant et l'air intérieur ont des humidités absolues proches.";
 }
 box.textContent=msg;
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
 qualityBox.className=quality.hasAnomalies?'advice warn':'advice';
 qualityBox.textContent='Contrôle qualité de l’historique analysé : '+coverageText+missingText+invalidText+' Les données manquantes réduisent la couverture ; elles ne sont pas considérées comme des anomalies.';
 renderCharts(data,selectedDate,$);
 renderRecommendation(analysisData);renderHygrometricPeriods(analysisData);renderIntelligentDiagnosis(analysisData);
 renderTemporalAnalysis(analysisData);analyzeSpeeds(analysisData);renderEnergyReadiness(analysisData);renderFreshness();
}
$('targetRH').onchange=render;$('minSamples').onchange=render;

setInterval(()=>{if(cur.sal_t!==undefined)updateLiveMetrics()},5000);
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
init();
