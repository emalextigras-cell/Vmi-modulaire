// Présentation des analyses énergétiques ; les calculs restent dans les modules métier.
export function createEnergyRenderers({ $, fmt, fmtShort, median, ENERGY_METER_LABELS, energyReadings, hist, summarizeEnergyReadiness, summarizeOperatingReference, summarizeRawVmiMode, summarizeRawVmiSpeed, summarizeTemperatureLimit, summarizeFanEnergyEstimate, summarizeFanEnergyByManualMode, summarizeDailyEnergyClimateContext, summarizeEnergyReadings, summarizeEnergyClimateContext, summarizeMonthlyEnergyReadings }) {
function renderEnergyReadiness(data){
 const result=summarizeEnergyReadiness(data);
 const labels={rpm:'Régime moteur',debit:'Débit VMI+ (m³/h)',vmiSpeedRaw:'Code vitesse VMI+ brut',vmiPwmRaw:'PWM brut',consDpRaw:'Cons DP brut',consTmaxRaw:'Seuil température extérieure (Cons TMax)'};
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
 let modeHtml='<h4>Débit et renouvellement théorique par mode VMI+</h4><p class="muted">Le champ « mode » est distinct du champ « Vitesse ». La colonne « Debit » de l’export VMI+ correspond au débit d’air en m³/h. Le mode 3 dispose d’une référence distincte communiquée par l’utilisateur de 184 m³/h. Le taux de renouvellement théorique est calculé à partir du débit en m³/h et du volume du logement ; il ne mesure pas l’air effectivement distribué dans chaque pièce.</p>';
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
  rawHtml+='<table><thead><tr><th>Code vitesse brut</th><th>Relevés</th><th>Débit médian (m³/h)</th><th>Minimum (m³/h)</th><th>Maximum (m³/h)</th></tr></thead><tbody>';
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
 const temperatureLimit = summarizeTemperatureLimit(data);
 let temperatureLimitHtml='<h4>Régulation selon la température extérieure</h4>';
 if(!temperatureLimit.thresholds.length){
  temperatureLimitHtml+='<div class="advice">Aucune paire de données exploitable entre le seuil Cons TMax et la température extérieure Tempext. Le réglage est conservé, mais aucune comparaison n’est possible.</div>';
 }else{
  for(const item of temperatureLimit.thresholds){
   temperatureLimitHtml+='<div class="advice"><strong>Seuil configuré : '+fmt(item.threshold)+' °C</strong> · '+item.sampleCount+' relevés avec température extérieure · '+item.aboveThresholdCount+' au-dessus du seuil · '+item.atOrBelowThresholdCount+' au seuil ou en dessous.</div>';
   if(item.modes.length){
    temperatureLimitHtml+='<table><thead><tr><th>Mode manuel</th><th>Au-dessus du seuil</th><th>Au seuil ou en dessous</th></tr></thead><tbody>';
    for(const group of item.modes){
     const cell=segment=>segment.sampleCount+' relevé(s) au total · '+segment.dayCount+' jour(s)';
     const paired=segment=>group.comparable
      ?' · comparaison sur '+segment.dayCount+' jours communs ('+segment.sampleCount+' relevés) : débit '+(segment.medianDebit==null?'–':fmt(segment.medianDebit)+' m³/h')+' · régime '+(segment.medianRPM==null?'–':fmt(segment.medianRPM)+' tr/min')
      :' · comparaison non disponible (effectif ou dates communes insuffisants)';
     temperatureLimitHtml+='<tr><td>'+group.mode+'</td><td>'+cell(group.above)+paired(group.pairedAbove)+'</td><td>'+cell(group.atOrBelow)+paired(group.pairedAtOrBelow)+'</td></tr>';
    }
    temperatureLimitHtml+='</tbody></table>';
   }else{
    temperatureLimitHtml+='<div class="muted">Aucun Mode manuel 1, 2 ou 3 renseigné pour ces relevés.</div>';
   }
  }
 }
 temperatureLimitHtml+='<div class="advice">Lecture prudente : les relevés au-dessus du seuil correspondent à des conditions où la réduction de ventilation peut s’appliquer. Une différence de débit ne démontre pas à elle seule que la régulation en est la cause. Les comparaisons sont séparées par mode et restent descriptives.</div>';
 const manufacturerPowerReference=[
  {flow:50,pressure:5,power:4},
  {flow:125,pressure:25,power:10},
  {flow:200,pressure:64,power:25},
  {flow:245,pressure:96,power:39},
  {flow:350,pressure:195,power:99}
 ];
 let referenceHtml='<h4>Repères électriques constructeur — PUREVENT</h4><p class="muted">Valeurs publiées par VMI pour le ventilateur selon le débit et la pression. Mesures réalisées par TÜV SÜD.</p>';
 referenceHtml+='<table><thead><tr><th>Débit (m³/h)</th><th>Pression (Pa)</th><th>Puissance (W)</th></tr></thead><tbody>';
 for(const point of manufacturerPowerReference){
  referenceHtml+='<tr><td>'+point.flow+'</td><td>'+point.pressure+'</td><td>'+point.power+'</td></tr>';
 }
 referenceHtml+='</tbody></table>';
 referenceHtml+='<div class="advice">La notice indique également une puissance maximale de 169 W sans préchauffage et une puissance maximale de préchauffage de 1 800 W. Ces repères ne permettent pas de reconstituer la consommation réelle de ton historique : le CSV ne fournit pas de mesure électrique vérifiée, et l’état/temps de fonctionnement du préchauffage n’est pas confirmé par les champs disponibles. Ne pas assimiler « Cons Res » à des watts.</div>';
 referenceHtml+='<p class="note">Source : <a href="https://www.vmi-technologies.com/wp-content/uploads/2024/11/FR-VMI%C2%AE-Purevent-Notice-dinstallation-et-de-maintenance-1.pdf" target="_blank" rel="noopener">notice officielle VMI PUREVENT, §2.2–2.3, pages 7–8</a>. Il s’agit d’une référence constructeur, pas d’une mesure de cette installation.</p>';
 $('energyReadiness').innerHTML=volumeHtml+html+temperatureLimitHtml+operatingHtml+modeHtml+rawHtml+referenceHtml+'<div class="advice">'+result.message+' Les valeurs brutes sont conservées ; aucune conversion des champs non documentés en watts, kWh ou rendement n’est appliquée. Le débit exporté VMI+ est exprimé en m³/h.</div>';
 renderEnergyMeterTracking();
}

function renderFanEnergyEstimate(data){
 const box=$('fanEnergyEstimate');
 if(!box)return;
 const result=summarizeFanEnergyEstimate(data);
 const duplicateNotice=(result.duplicateTimestampCount||result.conflictingTimestampCount)
  ? 'Horodatages : '+result.duplicateTimestampCount+' groupe(s) avec doublons, dont '+result.conflictingTimestampCount+' contradictoire(s) écarté(s). Les doublons identiques sont comptés une seule fois.'
  : 'Aucun doublon d’horodatage détecté.';
 box.className='advice';
 if(result.status!=='estimated'){
  box.textContent=(result.sampleCount<2
   ?'Il faut au moins deux relevés historiques avec un débit VMI+ exploitable pour établir une estimation.'
   :'Aucun intervalle exploitable : vérifie que le débit est compris entre 50 et 350 m³/h et que deux relevés successifs sont espacés de 2 h maximum.')+' '+duplicateNotice;
  const modeBox=$('fanEnergyByMode');
  if(modeBox){
   const byMode=summarizeFanEnergyByManualMode(data);
   const modeStatus=byMode.hasManualModeData
    ? 'Comparaison par mode non affichée car aucune estimation ventilateur globale exploitable.'
    : 'Pas de champ « Mode » manuel identifié dans cet historique.';
   modeBox.textContent=modeStatus+' Horodatages : '+byMode.duplicateTimestampCount+' groupe(s) avec doublons, dont '+byMode.conflictingTimestampCount+' contradictoire(s) écarté(s).';
  }
  return;
 }
 const coverage=result.coveragePercent;
 const coverageLabel=coverage>=80?'couverture correcte':coverage>=50?'couverture partielle':'couverture faible';
 box.innerHTML='<div class="grid cols3">'+
  '<div class="metric"><b>'+fmt(result.estimatedKwh)+' kWh</b><span>Énergie estimée du ventilateur</span></div>'+
  '<div class="metric"><b>'+fmt(result.averagePowerW)+' W</b><span>Puissance moyenne estimée</span></div>'+
  '<div class="metric"><b>'+fmt(coverage)+' %</b><span>Couverture ('+coverageLabel+')</span></div></div>'+
  '<p class="note">Période : '+fmtShort(result.firstAt)+' → '+fmtShort(result.lastAt)+' · '+fmt(result.coveredHours)+' h intégrées sur '+fmt(result.observedHours)+' h · '+result.acceptedIntervalCount+' intervalle(s) retenu(s).</p>'+
  '<p class="note">'+duplicateNotice+'</p>'+
  '<p class="note">Il s’agit d’une estimation du ventilateur, pas d’une mesure au compteur. La pression réelle du réseau, l’état du filtre et les conditions d’installation peuvent modifier la puissance absorbée.</p>'+
  '<p class="note"><strong>Préchauffage et total VMI : non estimables avec les champs actuellement validés.</strong> Le champ « Cons Res » n’est pas converti en watts ou en kWh.</p>'+
  '<details><summary>Méthode et limites</summary><ul>'+result.limits.map(item=>'<li>'+item+'</li>').join('')+'</ul><p class="note">Référence : notice officielle PUREVENT, valeurs de puissance mesurées par TÜV SÜD à 50, 125, 200, 245 et 350 m³/h.</p></details>';
  const modeBox=$('fanEnergyByMode');
  if(modeBox){
   const byMode=summarizeFanEnergyByManualMode(data);
   const modeNotice=(byMode.duplicateTimestampCount||byMode.conflictingTimestampCount)
    ? 'Horodatages : '+byMode.duplicateTimestampCount+' groupe(s) avec doublons, dont '+byMode.conflictingTimestampCount+' contradictoire(s) écarté(s). Les doublons identiques sont comptés une seule fois.'
    : 'Aucun doublon d’horodatage détecté.';
   if(!byMode.hasManualModeData){
    modeBox.textContent='Pas de champ « Mode » manuel identifié dans cet historique. Les codes bruts VMI+ ne sont pas utilisés pour inventer les niveaux 1/2/3. '+modeNotice;
   }else{
    let table='<div class="table-wrap"><table><thead><tr><th>Mode manuel</th><th>Énergie estimée</th><th>Puissance moyenne quotidienne médiane</th><th>Heures intégrées</th><th>Jours</th><th>Couverture</th><th>Conditions moyennes</th></tr></thead><tbody>';
    for(const group of byMode.groups){
     table+='<tr><td>'+group.mode+'</td><td>'+(group.estimatedKwh==null?'–':fmt(group.estimatedKwh)+' kWh')+'</td><td>'+(group.medianDailyAveragePowerW==null?'–':fmt(group.medianDailyAveragePowerW)+' W')+'</td><td>'+fmt(group.coveredHours)+' h</td><td>'+group.dayCount+'</td><td>'+fmt(group.coveragePercent)+' %</td><td>'+((group.climate.deltaAbsHumidity==null)?'Non disponible':'Intérieur '+fmt(group.climate.indoorTemp)+' °C · extérieur '+fmt(group.climate.outdoorTemp)+' °C · écart humidité absolue '+fmt(group.climate.deltaAbsHumidity)+' g/m³')+'</td></tr>';
    }
    table+='</tbody></table></div>';
    modeBox.innerHTML=table+'<p class="note">'+modeNotice+'</p><p class="note">Les changements de mode, les trous de plus de '+byMode.maxGapHours+' h et les débits hors plage sont exclus. '+byMode.transitionIntervalCount+' intervalle(s) traversant un changement de mode ignoré(s).</p><p class="note">La puissance moyenne est la médiane des moyennes journalières afin que les journées aient le même poids. Une comparaison nécessite au moins '+byMode.minDays+' jours par mode ; les lignes avec moins de jours restent descriptives.</p>';
   }
  }
}
function renderDailyEnergyClimateContext(data){
 const box=$('dailyEnergyClimateContext');
 if(!box)return;
 const result=summarizeDailyEnergyClimateContext(data);
 const duplicateNotice=(result.duplicateTimestampCount||result.conflictingTimestampCount)
  ? 'Contrôle des horodatages : '+result.duplicateTimestampCount+' groupe(s) avec doublons détecté(s), dont '+result.conflictingTimestampCount+' groupe(s) contradictoire(s) écarté(s). Les doublons identiques sont comptés une seule fois.'
  : 'Aucun doublon d’horodatage détecté dans les données analysées.';
 if(result.status!=='available'){
  box.className='advice';
  box.textContent='Rapprochement encore insuffisant : '+result.matchedDayCount+' jour(s) disposent à la fois d’au moins '+result.minFanHours+' h de puissance ventilateur estimée et de '+result.minClimateSamples+' relevés hygrométriques valides. Il en faut '+result.minDays+' pour afficher une comparaison journalière. '+duplicateNotice;
  return;
 }
 const rows=result.matchedDays.slice(-7);
 let html='<p class="note">'+result.matchedDayCount+' jour(s) apparié(s) · seuils : '+result.minFanHours+' h d’estimation ventilateur et '+result.minClimateSamples+' relevés hygrométriques par jour. Derniers jours disponibles :</p>';
 html+='<p class="note">'+duplicateNotice+'</p>';
 html+='<div class="table-wrap"><table><thead><tr><th>Jour</th><th>Ventilateur estimé</th><th>Puissance moyenne estimée</th><th>HA intérieure médiane</th><th>HA air entrant médiane</th><th>Écart intérieur − entrant</th></tr></thead><tbody>';
 for(const item of rows){
  const dateParts=item.date.split('-').map(Number);
  const label=new Date(dateParts[0],dateParts[1]-1,dateParts[2]).toLocaleDateString('fr-FR',{weekday:'short',day:'2-digit',month:'2-digit'});
  const value=(number,unit)=>number==null?'–':fmt(number)+' '+unit;
  html+='<tr><td>'+label+'</td><td>'+value(item.estimatedKwh,'kWh')+'<br><small>'+fmt(item.fanHours)+' h intégrées</small></td><td>'+value(item.averagePowerW,'W')+'</td><td>'+value(item.medianIndoorAbsHumidity,'g/m³')+'</td><td>'+value(item.medianIncomingAbsHumidity,'g/m³')+'</td><td>'+value(item.medianDeltaAbsHumidity,'g/m³')+'</td></tr>';
 }
 html+='</tbody></table></div><p class="note">Lecture : ce tableau met côte à côte des observations des mêmes journées. Il ne démontre pas qu’une puissance plus élevée assèche davantage le logement et ne calcule pas de rendement. L’énergie est estimée à partir du débit et de la courbe constructeur, pas mesurée au compteur.</p>';
 html+='<details><summary>Critères et limites</summary><ul>'+result.limits.map(item=>'<li>'+item+'</li>').join('')+'</ul></details>';
 box.className='advice';
 box.innerHTML=html;
}


function renderEnergyMeterTracking(){
 const result=summarizeEnergyReadings(energyReadings);
 const climateSummary=summarizeEnergyClimateContext(energyReadings,hist);
 const summary=$('energyMeterSummary'),history=$('energyMeterHistory');
 if(!result.readingCount){
  summary.className='advice';
  summary.textContent='Aucun relevé de compteur externe. Le CSV VMI+ ne fournit pas de mesure électrique vérifiée.';
  history.innerHTML='<p class="note">Ajoute deux index successifs du même compteur pour calculer l’énergie consommée entre ces deux dates.</p>';
  return;
 }
 summary.className='advice';
 summary.textContent=result.meters.map(meter=>{
  const latest=[...meter.intervals].reverse().find(interval=>interval.status==='measured');
  const amount=meter.measuredIntervalCount
    ? ' · '+fmt(meter.totalKwh)+' kWh cumulés sur les intervalles calculables'
    : ' · en attente d’un deuxième index';
  const recent=latest
    ? ' · dernier intervalle : '+fmt(latest.deltaKwh)+' kWh, puissance moyenne '+fmt(latest.averagePowerW)+' W'
    : '';
  return meter.label+' : '+meter.readingCount+' index'+amount+recent;
 }).join(' | ');
 let html='';
 for(const meter of result.meters){
  html+='<h4>'+meter.label+'</h4>';
  if(!meter.intervals.length){
   html+='<p class="note">Un seul index : ajoute un relevé ultérieur pour obtenir un écart.</p>';
   continue;
  }
  html+='<table><thead><tr><th>Du</th><th>Au</th><th>Énergie</th><th>Puissance moyenne</th></tr></thead><tbody>';
  for(const interval of meter.intervals){
   if(interval.status==='counter-decreased'){
    html+='<tr><td>'+fmtShort(interval.from)+'</td><td>'+fmtShort(interval.to)+'</td><td colspan="2">Index en baisse : remise à zéro ou changement de compteur. Écart non calculé.</td></tr>';
   }else{
    html+='<tr><td>'+fmtShort(interval.from)+'</td><td>'+fmtShort(interval.to)+'</td><td>'+fmt(interval.deltaKwh)+' kWh</td><td>'+fmt(interval.averagePowerW)+' W</td></tr>';
   }
  }
  html+='</tbody></table>';
  const monthly=summarizeMonthlyEnergyReadings(energyReadings).find(item=>item.meterType===meter.meterType);
  html+='<h5>Bilans mensuels mesurés</h5>';
  if(monthly&&monthly.months.length){
   html+='<table><thead><tr><th>Mois</th><th>Énergie mesurée</th><th>Intervalles</th></tr></thead><tbody>';
   for(const month of monthly.months){
    const parts=month.month.split('-').map(Number);
    const label=new Date(parts[0],parts[1]-1,1).toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
    html+='<tr><td>'+label+'</td><td>'+fmt(month.energyKwh)+' kWh</td><td>'+month.intervalCount+'</td></tr>';
   }
   html+='</tbody></table>';
   html+='<p class="note">Ces totaux regroupent uniquement les intervalles dont les deux index sont dans le même mois. Ils ne représentent pas nécessairement un mois complet.</p>';
  }else{
   html+='<p class="note">Pas encore d’intervalle entièrement compris dans un même mois.</p>';
  }
  if(monthly&&monthly.crossMonthIntervalCount){
   html+='<p class="note"> '+monthly.crossMonthIntervalCount+' intervalle(s), soit '+fmt(monthly.crossMonthKwh)+' kWh, traversent une limite de mois : ils restent dans le total global mais ne sont attribués à aucun mois pour éviter une répartition artificielle.</p>';
  }
  const climateMeter=climateSummary.meters.find(item=>item.meterType===meter.meterType);
  html+='<h5>Mise en perspective avec l’historique hygrométrique et thermique</h5>';
  if(!climateMeter||!climateMeter.intervals.length){
   html+='<p class="note">Aucun intervalle électrique mesuré à rapprocher des conditions intérieures et extérieures.</p>';
  }else{
   html+='<p class="note">Moyennes pondérées dans le temps, calculées uniquement sur les portions d’historique réellement couvertes. Les intervalles insuffisamment couverts restent signalés et ne sont pas interprétés.</p>';
   html+='<table><thead><tr><th>Période</th><th>Énergie / puissance moyenne</th><th>Conditions moyennes observées</th><th>Couverture</th></tr></thead><tbody>';
   for(const interval of climateMeter.intervals){
    const c=interval.context;
    const value=(v,suffix='')=>v==null?'–':fmt(v)+suffix;
    const conditions=c.ready
      ? 'Extérieur : '+value(c.outdoorTemp,' °C')+' · air entrant : '+value(c.incomingTemp,' °C')+' · intérieur : '+value(c.indoorTemp,' °C')+'<br>Humidité relative : intérieur '+value(c.indoorRH,' %')+' · air entrant '+value(c.incomingRH,' %')+'<br>Humidité absolue : intérieur '+value(c.indoorAbsHumidity,' g/m³')+' · air entrant '+value(c.incomingAbsHumidity,' g/m³')+'<br>Écart intérieur − entrant : '+value(c.deltaAbsHumidity,' g/m³')
      : 'Conditions non interprétées : couverture insuffisante';
    html+='<tr><td>'+fmtShort(interval.from)+' → '+fmtShort(interval.to)+'</td><td>'+value(interval.deltaKwh,' kWh')+'<br>'+value(interval.averagePowerW,' W')+'</td><td>'+conditions+'</td><td>'+value(c.coveragePercent,' %')+'<br>'+value(c.coverageHours,' h')+'</td></tr>';
   }
   html+='</tbody></table>';
  }
 }
 html+='<details><summary>Limites et méthode</summary><ul>'+result.limits.map(item=>'<li>'+item+'</li>').join('')+'</ul><ul>'+climateSummary.limits.map(item=>'<li>'+item+'</li>').join('')+'</ul></details>';
 const rows=[...energyReadings].filter(item=>item&&Number.isFinite(item.t)).sort((a,b)=>b.t-a.t);
 html+='<h4>Index enregistrés</h4><table><thead><tr><th>Date</th><th>Compteur</th><th>Index</th><th>Note</th><th></th></tr></thead><tbody>';
 for(const reading of rows){
  const label=ENERGY_METER_LABELS[reading.meterType]||reading.meterType;
  const id=String(reading.id).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  const note=String(reading.note||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  html+='<tr><td>'+fmtShort(reading.t)+'</td><td>'+label+'</td><td>'+fmt(reading.kwh)+' kWh</td><td>'+note+'</td><td><button type="button" class="outline" data-energy-delete="'+id+'">Supprimer</button></td></tr>';
 }
 html+='</tbody></table>';
 history.innerHTML=html;
}

 return { renderEnergyReadiness, renderFanEnergyEstimate, renderDailyEnergyClimateContext, renderEnergyMeterTracking };
}
