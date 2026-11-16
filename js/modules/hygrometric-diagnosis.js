import { median, analyzeHygrometricPeriods } from './analysis.js';
import { summarizeDailyTrends, analyzeHourlyPatterns } from './temporal-analysis.js';
import { absoluteHumidity, dewPoint } from './psychrometry.js';
import { isPlausibleHumidity, isPlausibleTemperature } from './data-quality.js';

function fmtHours(hours) {
  if (!Number.isFinite(hours)) return '0 h';
  if (hours < 1) return `${Math.round(hours*60)} min`;
  return `${hours.toFixed(1)} h`;
}

/**
 * Diagnostic hygrométrique explicable.
 * Les constats reposent sur les mesures disponibles, sans inférer le débit réel,
 * la consommation électrique, une panne ou un lien de causalité.
 */
export function buildHygrometricDiagnosis(data, {
  dryDelta = 1,
  trendDelta = 0.8,
  minSamples = 12,
  maxGapHours = 2
} = {}) {
  const inputRows = Array.isArray(data) ? data : [];
  const unique = new Map();
  let missingTimestampCount = 0;
  let incompleteSensorRecordCount = 0;
  let implausibleSensorRecordCount = 0;
  let duplicateTimestampCount = 0;
  for (const r of inputRows) {
    if (!Number.isFinite(r?.t)) {
      missingTimestampCount++;
      continue;
    }
    const missingSensor = !Number.isFinite(r.st) || !Number.isFinite(r.sh) ||
      !Number.isFinite(r.te) || !Number.isFinite(r.he);
    const implausibleSensor =
      (Number.isFinite(r.st) && !isPlausibleTemperature(r.st)) ||
      (Number.isFinite(r.sh) && !isPlausibleHumidity(r.sh)) ||
      (Number.isFinite(r.te) && !isPlausibleTemperature(r.te)) ||
      (Number.isFinite(r.he) && !isPlausibleHumidity(r.he));
    if (missingSensor) incompleteSensorRecordCount++;
    if (implausibleSensor) implausibleSensorRecordCount++;
    if (missingSensor || implausibleSensor) continue;
    const indoor = absoluteHumidity(r.st, r.sh);
    const incoming = absoluteHumidity(r.te, r.he);
    if (!Number.isFinite(indoor) || !Number.isFinite(incoming)) continue;
    if (unique.has(r.t)) duplicateTimestampCount++;
    unique.set(r.t, {
      t:r.t, st:r.st, sh:r.sh, te:r.te, he:r.he,
      indoorHA:indoor, incomingHA:incoming, delta:indoor-incoming,
      indoorDew:dewPoint(r.st,r.sh), incomingDew:dewPoint(r.te,r.he)
    });
  }
  const rows=[...unique.values()].sort((a,b)=>a.t-b.t);
  const dayKey=t=>{
    const d=new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const days=new Set(rows.map(r=>dayKey(r.t)));
  const dailySampleCounts=new Map();
  for(const row of rows){
    const key=dayKey(row.t);
    dailySampleCounts.set(key,(dailySampleCounts.get(key)||0)+1);
  }
  const daysWithAtLeastThreeSamples=[...dailySampleCounts.values()].filter(count=>count>=3).length;
  const acceptedSampleShare=inputRows.length?rows.length/inputRows.length:0;
  const periods=analyzeHygrometricPeriods(rows,{threshold:dryDelta,maxGapHours});
  const observedHours=periods.observedDurationMs/3600000;
  const intervalMs=rows.slice(1).map((r,i)=>r.t-rows[i].t).filter(gap=>gap>0);
  const maxGapMs=maxGapHours*3600000;
  const acceptedIntervals=intervalMs.filter(gap=>gap<=maxGapMs);
  const excludedIntervals=intervalMs.filter(gap=>gap>maxGapMs);
  const medianAcceptedIntervalMs=median(acceptedIntervals);
  const medianSampleIntervalMinutes=medianAcceptedIntervalMs==null?null:medianAcceptedIntervalMs/60000;
  const largestExcludedGapHours=excludedIntervals.length?Math.max(...excludedIntervals)/3600000:0;
  const coverageSpanHours=rows.length>1?(rows.at(-1).t-rows[0].t)/3600000:0;
  // Part de la période premier→dernier relevé couverte par des intervalles exploitables.
  const observedCoveragePercent=coverageSpanHours>0
    ?Math.round((observedHours/coverageSpanHours)*1000)/10:null;
  const dryShare=periods.observedDurationMs?periods.dryDurationMs/periods.observedDurationMs:null;
  const humidShare=periods.observedDurationMs?periods.humidDurationMs/periods.observedDurationMs:null;
  const daily=summarizeDailyTrends(rows);
  const dailyAirContext=new Map();
  for(const row of rows){
    const date=dayKey(row.t);
    if(!dailyAirContext.has(date))dailyAirContext.set(date,{incoming:[],indoorMinusIncoming:[]});
    const context=dailyAirContext.get(date);
    context.incoming.push(absoluteHumidity(row.te,row.he));
    context.indoorMinusIncoming.push(row.indoorHA-row.incomingHA);
  }
  const dailyAirContextStats=new Map([...dailyAirContext.entries()].map(([date,values])=>[date,{
    incoming:median(values.incoming),
    indoorMinusIncoming:median(values.indoorMinusIncoming)
  }]));
  // Une tendance durable compare deux fenêtres non chevauchantes de trois jours
  // suffisamment échantillonnés. Une journée isolée ne peut pas suffire.
  const eligibleTrendDays=daily.days.filter(day=>day.sampleCount>=3&&Number.isFinite(day.medianAbsoluteHumidity));
  const trendWindowDays=3;
  const trendMinimumDays=trendWindowDays*2;
  const firstTrendWindow=eligibleTrendDays.slice(0,trendWindowDays);
  const lastTrendWindow=eligibleTrendDays.slice(-trendWindowDays);
  const trendWindowsAreDistinct=eligibleTrendDays.length>=trendMinimumDays&&
    firstTrendWindow.at(-1).date<lastTrendWindow[0].date;
  const trendDateSpanDays=(start,end)=>(Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000;
  const trendWindowSpanDays=trendWindowsAreDistinct?[
    trendDateSpanDays(firstTrendWindow[0].date,firstTrendWindow.at(-1).date),
    trendDateSpanDays(lastTrendWindow[0].date,lastTrendWindow.at(-1).date)
  ]:null;
  const totalTrendSpanDays=trendWindowsAreDistinct
    ?trendDateSpanDays(firstTrendWindow[0].date,lastTrendWindow.at(-1).date):null;
  const maxTrendWindowSpanDays=4;
  const maxTrendComparisonSpanDays=14;
  const trendWindowsTemporallyCompact=trendWindowsAreDistinct&&
    trendWindowSpanDays.every(span=>span<=maxTrendWindowSpanDays)&&
    totalTrendSpanDays<=maxTrendComparisonSpanDays;
  const first=trendWindowsTemporallyCompact?firstTrendWindow[0]:null;
  const last=trendWindowsTemporallyCompact?lastTrendWindow.at(-1):null;
  const baselineTrendMedian=trendWindowsTemporallyCompact?median(firstTrendWindow.map(day=>day.medianAbsoluteHumidity)):null;
  const recentTrendMedian=trendWindowsTemporallyCompact?median(lastTrendWindow.map(day=>day.medianAbsoluteHumidity)):null;
  const trendSpanDays=first&&last?(Date.parse(last.date+'T00:00:00Z')-Date.parse(first.date+'T00:00:00Z'))/86400000:0;
  const trendChange=trendWindowsTemporallyCompact?recentTrendMedian-baselineTrendMedian:null;
  const trendDirectionalDays=trendWindowsTemporallyCompact?{
    rising:lastTrendWindow.filter(day=>day.medianAbsoluteHumidity>baselineTrendMedian).length,
    falling:lastTrendWindow.filter(day=>day.medianAbsoluteHumidity<baselineTrendMedian).length
  }:null;

  const hourly=analyzeHourlyPatterns(rows,5);
  const hourlyDetails=hourly.buckets.map((bucket,index)=>{
    const samples=rows.filter(r=>Math.floor(new Date(r.t).getHours()/6)===index);
    const dayKeys=[...new Set(samples.map(r=>dayKey(r.t)))];
    return {...bucket,dayCount:dayKeys.length,dayKeys};
  });
  const eligibleHours=hourlyDetails.filter(b=>b.sampleCount>=5&&b.dayCount>=2);
  const hourlyPairs=[];
  let candidatePairCount=0;
  let pairsWithTwoCommonDays=0;
  let pairsMeetingDailyMinimum=0;
  for(let i=0;i<eligibleHours.length;i++){
    for(let j=i+1;j<eligibleHours.length;j++){
      const left=eligibleHours[i],right=eligibleHours[j];
      candidatePairCount++;
      const commonDayKeys=left.dayKeys.filter(day=>right.dayKeys.includes(day));
      if(commonDayKeys.length>=2)pairsWithTwoCommonDays++;
      // Une date ne contribue à la comparaison que si chaque créneau y compte
      // au moins trois relevés : une journée isolée ne pèse pas autant qu'une
      // journée correctement échantillonnée.
      const hourlyMinimumDailySamples=3;
      const sharedDayKeys=commonDayKeys.filter(day=>[left,right].every(bucket=>
        rows.filter(r=>
          Math.floor(new Date(r.t).getHours()/6)===Math.floor(bucket.startHour/6)&&
          dayKey(r.t)===day
        ).length>=hourlyMinimumDailySamples
      ));
      if(sharedDayKeys.length<2)continue;
      pairsMeetingDailyMinimum++;
      const pairedStats=[left,right].map(bucket=>{
        const daily=sharedDayKeys.map(day=>{
          const daySamples=rows.filter(r=>
            Math.floor(new Date(r.t).getHours()/6)===Math.floor(bucket.startHour/6)&&
            dayKey(r.t)===day
          );
          return {
            day,
            sampleCount:daySamples.length,
            medianDelta:median(daySamples.map(r=>absoluteHumidity(r.st,r.sh)-absoluteHumidity(r.te,r.he)))
          };
        });
        return {
          ...bucket,
          // Chaque date pèse autant, même si le nombre de relevés diffère fortement.
          medianDelta:median(daily.map(item=>item.medianDelta)),
          sampleCount:daily.reduce((total,item)=>total+item.sampleCount,0),
          dayCount:sharedDayKeys.length
        };
      });
      if(pairedStats.some(item=>item.sampleCount<5||item.medianDelta==null))continue;
      const [a,b]=pairedStats;
      const winner=a.medianDelta>=b.medianDelta?a:b;
      const comparator=winner===a?b:a;
      hourlyPairs.push({
        ...winner,
        comparisonWindow:comparator.label,
        comparisonMedianDelta:comparator.medianDelta,
        comparisonSampleCount:comparator.sampleCount,
        sharedDayCount:sharedDayKeys.length,
        sharedDayKeys,
        aggregationMethod:'Médiane des médianes journalières, avec un poids égal par date',
        advantage:winner.medianDelta-comparator.medianDelta
      });
    }
  }
  const bestWindow=hourlyPairs.length
    ? [...hourlyPairs].sort((a,b)=>
        b.medianDelta-a.medianDelta||
        b.advantage-a.advantage||
        b.sharedDayCount-a.sharedDayCount
      )[0]
    :null;
  let hourlyComparisonReason=null;
  if(!bestWindow){
    if(eligibleHours.length<2){
      hourlyComparisonReason='Moins de deux tranches horaires disposent chacune d’au moins cinq relevés répartis sur deux jours.';
    }else if(candidatePairCount>0&&pairsWithTwoCommonDays===0){
      hourlyComparisonReason='Les tranches horaires candidates ne partagent pas au moins deux mêmes jours calendaires.';
    }else if(pairsWithTwoCommonDays>0&&pairsMeetingDailyMinimum===0){
      hourlyComparisonReason='Des jours sont communs, mais chaque paire échoue au minimum de trois relevés dans chaque tranche et pour chaque jour commun.';
    }else{
      hourlyComparisonReason='Aucune paire ne satisfait l’ensemble des critères de validité des mesures horaires.';
    }
  }
  const hourlyComparisonDiagnostics={
    candidateWindowCount:eligibleHours.length,
    candidatePairCount,
    pairsWithTwoCommonDays,
    pairsMeetingDailyMinimum,
    minimumSamplesPerWindow:5,
    minimumDistinctDaysPerWindow:2,
    minimumSharedDays:2,
    minimumSamplesPerWindowAndDay:3,
    reason:hourlyComparisonReason
  };

  // Le niveau décrit la robustesse de l'échantillonnage, pas l'état physique de la VMI.
  // Il tient compte de la couverture temporelle et de la part de lignes réellement retenues.
  const coverageRatio=observedCoveragePercent==null?0:observedCoveragePercent/100;
  const coverageLevel=rows.length>=60&&days.size>=5&&daysWithAtLeastThreeSamples>=5&&
    observedHours>=24&&coverageRatio>=0.5&&acceptedSampleShare>=0.9?'élevée'
    :rows.length>=24&&days.size>=3&&daysWithAtLeastThreeSamples>=3&&
      observedHours>=12&&coverageRatio>=0.2&&acceptedSampleShare>=0.7?'modérée':'faible';
  const sufficient=rows.length>=minSamples&&days.size>=2&&observedHours>=3;
  const observations=[];

  if(!sufficient){
    observations.push({
      code:'coverage-limited',level:'info',
      basis:{validSamples:rows.length,requiredSamples:minSamples,distinctDays:days.size,requiredDays:2,observedHours,requiredObservedHours:3},
      title:'Historique encore trop limité',
      detail:`${rows.length} relevé(s) simultanés valides sur ${days.size} jour(s), avec ${fmtHours(observedHours)} de périodes exploitables. Il faut davantage de mesures réparties sur plusieurs jours pour produire un diagnostic fiable.`,
      recommendation:'Importer un historique plus long et vérifier que les températures et humidités du salon et de l’air entrant sont présentes.'
    });
  } else if(periods.medianDelta!=null&&periods.medianDelta>dryDelta&&dryShare>=0.6){
    observations.push({
      code:'air-drying-potential',level:'positive',
      basis:{medianIndoorMinusIncomingHA:periods.medianDelta,unit:'g/m³',threshold:dryDelta,durationShare:dryShare,requiredDurationShare:0.6},
      title:'Conditions souvent favorables à l’assèchement',
      detail:`L’air entrant est plus sec que l’air du logement pendant ${Math.round(dryShare*100)} % des durées observées. L’écart médian salon − air entrant est de ${periods.medianDelta.toFixed(1)} g/m³.`,
      recommendation:'Le renouvellement d’air dispose d’un potentiel hygrométrique favorable pendant ces périodes. Cela ne mesure pas l’effet réel sans débit d’air validé.'
    });
  } else if(periods.medianDelta!=null&&periods.medianDelta< -dryDelta&&humidShare>=0.6){
    observations.push({
      code:'air-moisture-potential',level:'caution',
      basis:{medianIndoorMinusIncomingHA:periods.medianDelta,unit:'g/m³',threshold:-dryDelta,durationShare:humidShare,requiredDurationShare:0.6},
      title:'L’air entrant est souvent plus humide',
      detail:`L’air entrant est plus humide que l’air intérieur pendant ${Math.round(humidShare*100)} % des durées observées. L’écart médian salon − air entrant est de ${periods.medianDelta.toFixed(1)} g/m³.`,
      recommendation:'Une hausse de vitesse ne garantit pas un assèchement dans ces conditions. Comparer les périodes et suivre l’évolution intérieure avant toute modification manuelle.'
    });
  } else {
    observations.push({
      code:'mixed-air-conditions',level:'info',
      basis:{dryDurationShare:dryShare,humidDurationShare:humidShare,dominanceThreshold:0.6},
      title:'Conditions hygrométriques variables',
      detail:`Aucune situation dominante nette : air entrant plus sec ${Math.round((dryShare||0)*100)} % du temps observé, plus humide ${Math.round((humidShare||0)*100)} %.`,
      recommendation:'Privilégier l’analyse des périodes horaires et saisonnières plutôt qu’une conclusion basée sur un relevé isolé.'
    });
  }

  if(!bestWindow){
    observations.push({
      code:'hourly-comparison-limited',level:'info',
      basis:hourlyComparisonDiagnostics,
      title:'Comparaison horaire non concluante',
      detail:hourlyComparisonReason+' Aucun créneau n’est désigné comme plus favorable lorsque ces conditions ne sont pas réunies.',
      recommendation:'Conserver l’historique et réévaluer après plusieurs journées comportant des relevés répartis dans les différentes tranches horaires.'
    });
  }

  if(!trendWindowsAreDistinct){
    observations.push({
      code:'trend-insufficient-data',level:'info',
      basis:{eligibleDays:eligibleTrendDays.length,requiredDays:trendMinimumDays,minimumDailySamples:3,daysPerWindow:trendWindowDays},
      title:'Tendance hygrométrique à confirmer',
      detail:`Seulement ${eligibleTrendDays.length} jour(s) disposent d’au moins trois relevés valides. Il en faut au moins ${trendMinimumDays}, répartis en deux fenêtres distinctes de ${trendWindowDays} jours, pour distinguer une évolution durable d’une variation ponctuelle.`,
      recommendation:'Poursuivre l’import de l’historique sans modifier les réglages sur la base d’une journée isolée.'
    });
  } else if(!trendWindowsTemporallyCompact){
    observations.push({
      code:'trend-calendar-span-limited',level:'info',
      basis:{eligibleDays:eligibleTrendDays.length,firstWindowSpanDays:trendWindowSpanDays[0],lastWindowSpanDays:trendWindowSpanDays[1],totalSpanDays:totalTrendSpanDays,maximumWindowSpanDays:maxTrendWindowSpanDays,maximumComparisonSpanDays:maxTrendComparisonSpanDays},
      title:'Jours de mesure trop espacés pour confirmer une tendance',
      detail:`Les jours retenus couvrent ${totalTrendSpanDays} jours calendaires. Pour éviter de comparer des périodes trop éloignées, chaque fenêtre de ${trendWindowDays} jours échantillonnés doit tenir en ${maxTrendWindowSpanDays} jours calendaires et l’ensemble en ${maxTrendComparisonSpanDays} jours maximum.`,
      recommendation:'Importer des relevés sur des journées plus rapprochées avant de conclure à une tendance durable.'
    });
  } else {
    const baselineAirContext=firstTrendWindow.map(day=>dailyAirContextStats.get(day.date));
    const recentAirContext=lastTrendWindow.map(day=>dailyAirContextStats.get(day.date));
    const baselineIncomingMedian=median(baselineAirContext.map(value=>value?.incoming));
    const recentIncomingMedian=median(recentAirContext.map(value=>value?.incoming));
    const baselineIndoorMinusIncoming=median(baselineAirContext.map(value=>value?.indoorMinusIncoming));
    const recentIndoorMinusIncoming=median(recentAirContext.map(value=>value?.indoorMinusIncoming));
    const trendContextSentence=`Contexte mesuré sur les mêmes fenêtres : humidité absolue de l’air entrant ${baselineIncomingMedian.toFixed(2)} → ${recentIncomingMedian.toFixed(2)} g/m³ ; écart salon − air entrant ${baselineIndoorMinusIncoming.toFixed(2)} → ${recentIndoorMinusIncoming.toFixed(2)} g/m³. Ces évolutions concomitantes ne démontrent aucun lien causal.`;
    const trendBasis={firstDate:first.date,lastDate:last.date,baselineWindowStartDate:firstTrendWindow[0].date,baselineWindowEndDate:firstTrendWindow.at(-1).date,recentWindowStartDate:lastTrendWindow[0].date,recentWindowEndDate:lastTrendWindow.at(-1).date,baselineWindowSpanDays:trendWindowSpanDays[0],recentWindowSpanDays:trendWindowSpanDays[1],totalComparisonSpanDays:totalTrendSpanDays,baselineDailyValues:firstTrendWindow.map(day=>`${day.date} : ${day.medianAbsoluteHumidity.toFixed(2)} g/m³ (${day.sampleCount} relevés)`).join(' · '),recentDailyValues:lastTrendWindow.map(day=>`${day.date} : ${day.medianAbsoluteHumidity.toFixed(2)} g/m³ (${day.sampleCount} relevés)`).join(' · '),baselineMedianAbsoluteHumidity:baselineTrendMedian,recentMedianAbsoluteHumidity:recentTrendMedian,baselineMedianRelativeHumidity:median(firstTrendWindow.map(day=>day.medianRH)),recentMedianRelativeHumidity:median(lastTrendWindow.map(day=>day.medianRH)),baselineMedianTemperature:median(firstTrendWindow.map(day=>day.medianTemperature)),recentMedianTemperature:median(lastTrendWindow.map(day=>day.medianTemperature)),baselineIncomingMedianAbsoluteHumidity:median(baselineAirContext.map(value=>value?.incoming)),recentIncomingMedianAbsoluteHumidity:median(recentAirContext.map(value=>value?.incoming)),incomingAbsoluteHumidityChange:median(recentAirContext.map(value=>value?.incoming))-median(baselineAirContext.map(value=>value?.incoming)),baselineIndoorMinusIncomingMedian:median(baselineAirContext.map(value=>value?.indoorMinusIncoming)),recentIndoorMinusIncomingMedian:median(recentAirContext.map(value=>value?.indoorMinusIncoming)),indoorMinusIncomingChange:median(recentAirContext.map(value=>value?.indoorMinusIncoming))-median(baselineAirContext.map(value=>value?.indoorMinusIncoming)),change:trendChange,threshold:trendDelta,eligibleDays:eligibleTrendDays.length,daysPerWindow:trendWindowDays,risingDays:trendDirectionalDays.rising,fallingDays:trendDirectionalDays.falling,minimumDirectionalDays:2,unit:'g/m³'};
    if(trendChange>=trendDelta&&trendDirectionalDays.rising>=2){
      observations.push({
        code:'indoor-moisture-rising',level:'caution',
        basis:trendBasis,
        title:'Tendance durable à la hausse de l’humidité absolue',
        detail:`La médiane des ${trendWindowDays} derniers jours échantillonnés dépasse de ${trendChange.toFixed(1)} g/m³ celle des ${trendWindowDays} premiers jours. Le signal est retrouvé sur ${trendDirectionalDays.rising} des ${trendWindowDays} derniers jours. `+trendContextSentence,
        recommendation:'Examiner les apports de vapeur d’eau, les extractions et les conditions extérieures. Cette évolution ne suffit pas à identifier une cause.'
      });
    } else if(trendChange<=-trendDelta&&trendDirectionalDays.falling>=2){
      observations.push({
        code:'indoor-moisture-falling',level:'positive',
        basis:trendBasis,
        title:'Tendance durable à la baisse de l’humidité absolue',
        detail:`La médiane des ${trendWindowDays} derniers jours échantillonnés est inférieure de ${Math.abs(trendChange).toFixed(1)} g/m³ à celle des ${trendWindowDays} premiers jours. Le signal est retrouvé sur ${trendDirectionalDays.falling} des ${trendWindowDays} derniers jours. `+trendContextSentence,
        recommendation:'Poursuivre l’observation pour vérifier que cette baisse se maintient sur les prochains jours.'
      });
    } else {
      observations.push({
        code:'trend-not-sustained',level:'info',
        basis:trendBasis,
        title:'Pas de tendance durable confirmée',
        detail:`L’écart entre les deux fenêtres de ${trendWindowDays} jours est de ${trendChange>=0?'+':''}${trendChange.toFixed(1)} g/m³, mais les critères de persistance ne sont pas réunis. Une variation ponctuelle n’est donc pas interprétée comme une tendance.`,
        recommendation:'Continuer à suivre les médianes journalières ; réévaluer lorsque davantage de jours seront disponibles.'
      });
    }
  }

  if(bestWindow&&bestWindow.medianDelta>dryDelta){
    observations.push({
      code:'favorable-time-window',level:'positive',
      basis:{timeWindow:bestWindow.label,comparisonWindow:bestWindow.comparisonWindow,medianDelta:bestWindow.medianDelta,comparisonMedianDelta:bestWindow.comparisonMedianDelta,advantage:bestWindow.advantage,unit:'g/m³',sampleCount:bestWindow.sampleCount,comparisonSampleCount:bestWindow.comparisonSampleCount,dayCount:bestWindow.dayCount,sharedDayCount:bestWindow.sharedDayCount,sharedDayKeys:bestWindow.sharedDayKeys,aggregationMethod:bestWindow.aggregationMethod},
      title:'Période horaire plus favorable repérée',
      detail:`Sur les deux créneaux comparés, ${bestWindow.label} présente un écart médian plus favorable (${bestWindow.medianDelta.toFixed(1)} g/m³) que ${bestWindow.comparisonWindow} (${bestWindow.comparisonMedianDelta.toFixed(1)} g/m³). Comparaison limitée aux mêmes ${bestWindow.sharedDayCount} jours calendaires, chaque jour ayant le même poids dans les médianes, avec ${bestWindow.sampleCount} et ${bestWindow.comparisonSampleCount} relevés respectivement.`,
      recommendation:'Vérifier si ce créneau se retrouve sur d’autres semaines et saisons avant d’en tirer une règle de réglage.'
    });
  }

  return {
    methodology:{version:'hygrometric-diagnostic-v7',dryDeltaThreshold:dryDelta,trendDeltaThreshold:trendDelta,trendMinimumDailySamples:3,trendMinimumDays:6,trendWindowDays:3,trendMinimumDirectionalDays:2,trendMaximumWindowSpanDays:4,trendMaximumComparisonSpanDays:14,minimumSamples:minSamples,minimumDistinctDays:2,minimumObservedHours:3,dominantDurationShare:0.6,maximumGapHours:maxGapHours,hourlyBucketHours:6,hourlyMinimumSamples:5,hourlyMinimumDistinctDays:2,hourlyMinimumSharedDays:2,hourlyMinimumDailySamples:3,minimumDailySamplesForConfidence:3,moderateCoveragePercent:20,highCoveragePercent:50,moderateAcceptedShare:0.7,highAcceptedShare:0.9},
    status:sufficient?'analysis-available':'insufficient-data',
    inputQuality:{
      inputSampleCount:inputRows.length,
      acceptedSampleCount:rows.length,
      missingTimestampCount,
      incompleteSensorRecordCount,
      implausibleSensorRecordCount,
      duplicateTimestampCount,
      excludedSampleCount:inputRows.length-rows.length
    },
    coverageLevel,
    confidenceBasis:{
      observedCoveragePercent,
      acceptedSampleShare,
      daysWithAtLeastThreeSamples,
      minimumDailySamples:3
    },
    sampleCount:rows.length,
    dayCount:days.size,
    observedHours,
    coverageSpanHours,
    observedCoveragePercent,
    medianSampleIntervalMinutes:Number.isFinite(medianSampleIntervalMinutes)?medianSampleIntervalMinutes:null,
    excludedGapCount:excludedIntervals.length,
    largestExcludedGapHours,
    maxGapHours,
    medianIndoorRH:median(rows.map(r=>r.sh)),
    medianIndoorHA:median(rows.map(r=>r.indoorHA)),
    medianIncomingHA:median(rows.map(r=>r.incomingHA)),
    medianIndoorDewPoint:median(rows.map(r=>r.indoorDew)),
    medianIncomingDewPoint:median(rows.map(r=>r.incomingDew)),
    dryShare,humidShare,trendChange,bestWindow,hourlyComparisonDiagnostics,
    observations,
    limits:[
      `Les durées sont estimées entre deux relevés, sans extrapolation au-delà de ${maxGapHours} heure(s).`,
      'L’humidité absolue décrit la teneur en vapeur d’eau, pas le débit ni le renouvellement d’air réel.',
      'Le point de rosée calculé n’est pas une mesure de température de paroi : aucun risque de condensation n’est déduit.',
      'Les observations ne prouvent ni une panne, ni la cause d’une variation, ni une vitesse optimale.'
    ]
  };
}
