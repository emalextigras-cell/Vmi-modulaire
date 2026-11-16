// Présentation des analyses hygrométriques et temporelles.
// Les calculs et leurs seuils restent dans les modules métier dédiés.
export function createHygrometricRenderers({ $, fmt, formatDuration, analyzeHygrometricPeriods, summarizeDailyTrends, analyzeHourlyPatterns, detectRapidChanges, buildHygrometricDiagnosis, formatDiagnosisConfidence }) {
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
 const coverageValue=$('coverageValue'), coverageDescription=$('coverageDescription'), coverageMethod=$('coverageMethod');
 const available=result.status==='analysis-available';
 if(result.observedCoveragePercent!=null){
  coverageValue.textContent=fmt(result.observedCoveragePercent)+' %';
  coverageDescription.textContent='Part de la période entre le premier et le dernier relevé couverte par des intervalles exploitables.';
  coverageMethod.textContent='Durée exploitable : '+fmt(result.observedHours)+' h sur '+fmt(result.coverageSpanHours)+' h. Les intervalles de plus de '+result.maxGapHours+' h sont exclus. Cette estimation dépend de la fréquence des relevés et ne représente pas une mesure continue.';
 }else{
  coverageValue.textContent='–';
  coverageDescription.textContent='Pas assez de relevés datés pour calculer une couverture temporelle.';
  coverageMethod.textContent='Il faut au moins deux horodatages valides distincts. Les intervalles de plus de '+result.maxGapHours+' h sont exclus.';
 }
 const confidence=formatDiagnosisConfidence(result,fmt);
 const quality=result.inputQuality;
 const inputSummary='Entrée : '+quality.inputSampleCount+' lignes · '+quality.acceptedSampleCount+' retenues après contrôle et dédoublonnage · '+quality.excludedSampleCount+' écartées ou regroupées ('+quality.missingTimestampCount+' sans horodatage, '+quality.incompleteSensorRecordCount+' incomplètes, '+quality.implausibleSensorRecordCount+' avec valeurs aberrantes, '+quality.duplicateTimestampCount+' doublons). Les catégories peuvent se chevaucher.';
 box.className=available?'advice good':'advice warn';
 box.textContent=(available?'Analyse possible avec les données disponibles. ':'Diagnostic non concluant pour le moment. ')+confidence+'. '+inputSummary;
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
     candidateWindowCount:'Tranches horaires exploitables',
     candidatePairCount:'Paires de tranches examinées',
     pairsWithTwoCommonDays:'Paires avec au moins deux jours communs',
     pairsMeetingDailyMinimum:'Paires respectant le minimum quotidien',
     minimumSamplesPerWindow:'Minimum de relevés par tranche',
     minimumDistinctDaysPerWindow:'Minimum de jours par tranche',
     minimumSharedDays:'Minimum de jours communs',
     minimumSamplesPerWindowAndDay:'Minimum de relevés par tranche et par jour',
     validSamples:'Relevés valides',requiredSamples:'Minimum de relevés requis',
     distinctDays:'Jours distincts',requiredDays:'Minimum de jours requis',
     observedHours:'Durée exploitable',requiredObservedHours:'Durée minimale requise',
     medianIndoorMinusIncomingHA:'Écart médian salon − air entrant',
     threshold:'Seuil appliqué',durationShare:'Part des durées observées',
     requiredDurationShare:'Part minimale requise',dryDurationShare:'Air entrant plus sec',
     humidDurationShare:'Air entrant plus humide',dominanceThreshold:'Seuil de dominance',
     firstDate:'Première date comparée',lastDate:'Dernière date comparée',
     baselineWindowStartDate:'Début de la fenêtre initiale',baselineWindowEndDate:'Fin de la fenêtre initiale',
     baselineDailyValues:'Relevés journaliers — fenêtre initiale',recentDailyValues:'Relevés journaliers — fenêtre récente',
     recentWindowStartDate:'Début de la fenêtre récente',recentWindowEndDate:'Fin de la fenêtre récente',
     baselineWindowSpanDays:'Étendue de la fenêtre initiale (jours)',recentWindowSpanDays:'Étendue de la fenêtre récente (jours)',totalComparisonSpanDays:'Étendue totale comparée (jours)',
     firstMedianAbsoluteHumidity:'Humidité absolue médiane au départ',
     lastMedianAbsoluteHumidity:'Humidité absolue médiane à la fin',
     baselineMedianAbsoluteHumidity:'Médiane de la première fenêtre',
     recentMedianAbsoluteHumidity:'Médiane de la dernière fenêtre',
     baselineMedianRelativeHumidity:'Humidité relative médiane — fenêtre initiale',recentMedianRelativeHumidity:'Humidité relative médiane — fenêtre récente',
     baselineMedianTemperature:'Température intérieure médiane — fenêtre initiale',recentMedianTemperature:'Température intérieure médiane — fenêtre récente',
     baselineIncomingMedianAbsoluteHumidity:'Humidité absolue médiane de l’air entrant — fenêtre initiale',
     recentIncomingMedianAbsoluteHumidity:'Humidité absolue médiane de l’air entrant — fenêtre récente',
     incomingAbsoluteHumidityChange:'Évolution de l’humidité absolue entrante',indoorMinusIncomingChange:'Évolution de l’écart salon − air entrant',
     baselineIndoorMinusIncomingMedian:'Écart salon − air entrant — fenêtre initiale',
     recentIndoorMinusIncomingMedian:'Écart salon − air entrant — fenêtre récente',
     eligibleDays:'Jours suffisamment échantillonnés',requiredDays:'Jours minimum requis',
     minimumDailySamples:'Relevés minimum par jour',daysPerWindow:'Jours par fenêtre',
     risingDays:'Jours orientés à la hausse',fallingDays:'Jours orientés à la baisse',minimumDirectionalDays:'Jours directionnels minimum',
     change:'Évolution mesurée',timeWindow:'Tranche horaire retenue',
     aggregationMethod:'Méthode d’agrégation',
     medianDelta:'Écart médian observé',sampleCount:'Nombre de relevés',
     dayCount:'Nombre de jours'
    };
    const percentKeys=new Set(['durationShare','requiredDurationShare','dryDurationShare','humidDurationShare','dominanceThreshold']);
    const hourKeys=new Set(['observedHours','requiredObservedHours']);
    const humidityKeys=new Set(['medianIndoorMinusIncomingHA','firstMedianAbsoluteHumidity','lastMedianAbsoluteHumidity','baselineMedianAbsoluteHumidity','recentMedianAbsoluteHumidity','baselineIncomingMedianAbsoluteHumidity','recentIncomingMedianAbsoluteHumidity','incomingAbsoluteHumidityChange','baselineIndoorMinusIncomingMedian','recentIndoorMinusIncomingMedian','indoorMinusIncomingChange','change','medianDelta','threshold']);
    const relativeHumidityKeys=new Set(['baselineMedianRelativeHumidity','recentMedianRelativeHumidity']);
    const temperatureKeys=new Set(['baselineMedianTemperature','recentMedianTemperature']);
    Object.entries(item.basis).forEach(([key,value])=>{
     if(key==='unit'||value==null||!labels[key])return;
     const term=document.createElement('dt');
     const description=document.createElement('dd');
     term.textContent=labels[key];
     let shown;
     if(typeof value==='number'){
      if(percentKeys.has(key))shown=(value*100).toLocaleString('fr-FR',{maximumFractionDigits:1})+' %';
      else if(hourKeys.has(key))shown=value.toLocaleString('fr-FR',{maximumFractionDigits:1})+' h';
      else if(relativeHumidityKeys.has(key))shown=value.toLocaleString('fr-FR',{maximumFractionDigits:1})+' %';
      else if(temperatureKeys.has(key))shown=value.toLocaleString('fr-FR',{maximumFractionDigits:1})+' °C';
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
 methodText.textContent='Version '+result.methodology.version+' · écart hygrométrique : '+fmt(result.methodology.dryDeltaThreshold)+' g/m³ · évolution intérieure : '+fmt(result.methodology.trendDeltaThreshold)+' g/m³ · tendance durable : 6 jours exploitables minimum, répartis en deux fenêtres de 3 jours ; chaque fenêtre tient en 4 jours calendaires maximum et les deux fenêtres couvrent 14 jours maximum · minimum '+result.methodology.minimumSamples+' relevés sur '+result.methodology.minimumDistinctDays+' jours et '+result.methodology.minimumObservedHours+' h exploitables · interruptions de plus de '+fmt(result.methodology.maximumGapHours)+' h exclues · dominance requise : '+Math.round(result.methodology.dominantDurationShare*100)+' % · tranches horaires de '+result.methodology.hourlyBucketHours+' h (au moins '+result.methodology.hourlyMinimumSamples+' relevés au total et '+result.methodology.hourlyMinimumDailySamples+' relevés par jour sur au moins '+result.methodology.hourlyMinimumSharedDays+' jours communs). Le niveau de robustesse tient aussi compte de la couverture temporelle (20 % pour modérée, 50 % pour élevée), de la part de lignes retenues (70 % / 90 %) et d’au moins 3 relevés sur chaque jour compté.';
 method.append(methodTitle,methodText);
 evidence.append(method);
 limits.textContent='À garder en tête : '+result.limits.join(' ');
}

 return { renderHygrometricPeriods, renderTemporalAnalysis, renderIntelligentDiagnosis };
}
