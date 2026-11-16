// Rendu des constats hygrométriques et saisonniers de l'historique.
// Les calculs restent dans leurs modules métier ; ce module ne fait que présenter leurs résultats.
export function createHistoryInsightRenderers({ $, fmt, fmtShort, median, absoluteHumidity, isPlausibleHumidity, isPlausibleTemperature, summarizeWeeklyDiagnostic, analyzeSeasonalVentilation }) {
function renderWeeklyDiagnostic(data){
 const box=$('weeklyDiagnostic');
 if(!box)return;
 const result=summarizeWeeklyDiagnostic(data);
 const duplicateSummary=(result.duplicateTimestampCount||result.conflictingTimestampCount)
  ? '<p class="note">Contrôle des horodatages : '+(result.duplicateTimestampCount||0)+' horodatage(s) répété(s), dont '+(result.conflictingTimestampCount||0)+' avec des valeurs contradictoires. Les doublons identiques ne sont comptés qu’une fois ; les horodatages contradictoires sont exclus des calculs.</p>'
  : '';
 if(result.status==='no-data'){
  box.className='advice';
  box.innerHTML='<p>Aucun historique horodaté exploitable pour établir un bilan hebdomadaire.</p>'+duplicateSummary;
  return;
 }
 const formatValue=(number,unit)=>number==null?'–':fmt(number)+' '+unit;
 const periodLabel=period=>{
  const start=new Date(period.start+'T12:00:00');
  const end=new Date(period.end+'T12:00:00');
  return start.toLocaleDateString('fr-FR')+' au '+end.toLocaleDateString('fr-FR');
 };
 if(result.status!=='available'){
  box.className='advice';
  box.innerHTML='<p>Comparaison hebdomadaire non disponible : il faut au moins '+result.minDaysPerWindow+' journées exploitables dans chacune des deux fenêtres de '+result.windowDays+' jours.</p>'+
   '<ul>'+result.periods.map(period=>'<li><b>'+(period.id==='previous'?'Semaine précédente':'Semaine récente')+'</b> · '+periodLabel(period)+' : '+period.dayCount+' / '+result.minDaysPerWindow+' jours exploitables, '+period.sampleCount+' relevés complets.</li>').join('')+'</ul>'+
   '<p class="note">Les périodes ne sont pas rapprochées lorsqu’une couverture minimale manque. Les trous de plusieurs jours ne sont pas comblés.</p>'+duplicateSummary;
  return;
 }
 let html='<p class="note">Comparaison des deux fenêtres calendaires de '+result.windowDays+' jours, ancrées sur la date du dernier relevé. Chaque journée a le même poids dans les médianes.</p>'+duplicateSummary;
 html+='<div class="table-wrap"><table><thead><tr><th>Période</th><th>Jours / relevés</th><th>HA intérieure</th><th>HA air entrant</th><th>Écart intérieur − entrant</th><th>HR intérieure</th><th>Température</th><th>Ventilateur estimé</th></tr></thead><tbody>';
 for(const period of result.periods){
  const energy=period.estimatedFanKwh==null?'–':fmt(period.estimatedFanKwh)+' kWh ('+period.energyCoveredDays+' j)';
  html+='<tr><td>'+(period.id==='previous'?'Précédente':'Récente')+'<br><small>'+periodLabel(period)+'</small></td>'+
   '<td>'+period.dayCount+' j · '+period.sampleCount+'</td>'+
   '<td>'+formatValue(period.medianIndoorHA,'g/m³')+'</td>'+
   '<td>'+formatValue(period.medianIncomingHA,'g/m³')+'</td>'+
   '<td>'+formatValue(period.medianDeltaHA,'g/m³')+'</td>'+
   '<td>'+formatValue(period.medianRH,'%')+'</td>'+
   '<td>'+formatValue(period.medianTemperature,'°C')+'</td>'+
   '<td>'+energy+'</td></tr>';
 }
 html+='</tbody></table></div>';
 const change=result.comparison;
 html+='<h4>Constats entre les deux périodes</h4><ul>'+result.findings.map(item=>'<li><b>'+item.title+'</b> : '+item.text+'</li>').join('')+'</ul>';
 html+='<p class="note">Évolution des médianes : HA intérieure '+formatValue(change.indoorHA,'g/m³')+' · air entrant '+formatValue(change.incomingHA,'g/m³')+' · écart intérieur − entrant '+formatValue(change.deltaHA,'g/m³')+'.</p>';
 html+='<details><summary>Critères et limites de lecture</summary><ul>'+result.limits.map(item=>'<li>'+item+'</li>').join('')+'</ul></details>';
 box.className='advice';
 box.innerHTML=html;
}

function renderSeasonalAdvice(data){
 const box=$('seasonalAdvice');
 if(!box)return;
 const result=analyzeSeasonalVentilation(data);
 box.className='advice';
 if(result.status!=='available'){
  box.textContent=result.advice;
  return;
 }
 const seasonLabel=result.currentSeason||'non déterminée';
 let html='<p><strong>Saison actuelle de l’historique : '+seasonLabel+'</strong>';
 if(result.latestAt)html+=' · dernier relevé : '+fmtShort(result.latestAt);
 html+='</p><p>'+result.advice+'</p>';
 html+='<div class="table-wrap"><table><thead><tr><th>Saison calendrier</th><th>Relevés / jours</th><th>Écart extérieur − intérieur</th><th>Écart HA intérieur − entrant</th><th>Jours avec conditions favorables</th><th>Codes Saison CSV (bruts)</th></tr></thead><tbody>';
 for(const item of result.seasons){
  const codes=Object.entries(item.codeCounts).map(([code,count])=>code+' ('+count+')').join(', ')||'non renseigné';
  const margin=item.medianOutdoorMinusIndoor==null?'–':(item.medianOutdoorMinusIndoor>0?'+':'')+fmt(item.medianOutdoorMinusIndoor)+' °C';
  const humidity=item.medianHumidityDelta==null?'–':(item.medianHumidityDelta>0?'+':'')+fmt(item.medianHumidityDelta)+' g/m³';
  html+='<tr><td>'+item.season+'</td><td>'+item.sampleCount+' / '+item.dayCount+'</td><td>'+margin+'</td><td>'+humidity+'</td><td>'+item.opportunityDayCount+'</td><td>'+codes+'</td></tr>';
 }
 html+='</tbody></table></div><details><summary>Comment interpréter ces conseils ?</summary><ul>'+result.limits.map(item=>'<li>'+item+'</li>').join('')+'</ul></details>';
 box.innerHTML=html;
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

 return { renderWeeklyDiagnostic, renderSeasonalAdvice, renderRecommendation };
}
