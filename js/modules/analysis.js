/** Analyses statistiques communes (sans effet sur les commandes VMI). */
import { absoluteHumidity } from './psychrometry.js';
import { isPlausibleHumidity, isPlausibleTemperature } from './data-quality.js';

export function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a,b)=>a-b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle-1] + sorted[middle]) / 2;
}

/**
 * Compare uniquement les niveaux manuels 1/2/3 déjà identifiés dans les relevés.
 * Les valeurs brutes importées de VMI+ ne sont pas assimilées à ces niveaux.
 */
export function analyzeSpeedLevels(data, minSamples = 10, targetRH = 50) {
  const rows = (Array.isArray(data) ? data : []).filter(r =>
    Number.isFinite(r?.vmiModeRaw) && [1,2,3].includes(r.vmiModeRaw) &&
    Number.isFinite(r.sh) && isPlausibleHumidity(r.sh) &&
    Number.isFinite(r.st) && isPlausibleTemperature(r.st)
  );
  const groups = [1,2,3].map(v => {
    const samples = rows.filter(r => r.vmiModeRaw === v).sort((a,b)=>a.t-b.t);
    const deltas = samples.map(r => {
      const inside = absoluteHumidity(r.st,r.sh);
      const incoming = Number.isFinite(r.te) && isPlausibleTemperature(r.te) &&
        Number.isFinite(r.he) && isPlausibleHumidity(r.he)
        ? absoluteHumidity(r.te,r.he) : null;
      return inside != null && incoming != null ? inside-incoming : null;
    }).filter(Number.isFinite);
    const times=samples.map(r=>r.t).filter(Number.isFinite);
    const coveredDays=new Set(times.map(t=>{
      const d=new Date(t);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }));
    const rpms=samples.map(r=>r.rpm).filter(v=>Number.isFinite(v)&&v>0&&v<10000);
    return {
      v,n:samples.length,
      daysCovered:coveredDays.size,
      coveredDayKeys:[...coveredDays],
      rh:median(samples.map(r=>r.sh)),
      ha:median(samples.map(r=>absoluteHumidity(r.st,r.sh))),
      delta:median(deltas),
      dryingShare:deltas.length?deltas.filter(v=>v>1).length/deltas.length:null,
      rpm:median(rpms),
      rpmSamples:rpms.length,
      deltaSamples:deltas.length,
      firstAt:times.length?Math.min(...times):null,
      lastAt:times.length?Math.max(...times):null,
      spanHours:times.length>1?(Math.max(...times)-Math.min(...times))/3600000:0
    };
  });
  const sufficient=groups.filter(g=>g.n>=minSamples);
  const dayKeysBySpeed=new Map(groups.map(group=>[group.v,new Set(group.coveredDayKeys)]));
  for(const group of groups){
    const ownDays=dayKeysBySpeed.get(group.v);
    group.sharedDays=Math.max(0,...sufficient.filter(other=>other.v!==group.v).map(other=>
      [...ownDays].filter(day=>dayKeysBySpeed.get(other.v).has(day)).length
    ));
    delete group.coveredDayKeys;
  }
  const status=rows.length===0?'no-speed-data':sufficient.length?'comparison-ready':'insufficient';
  return {groups,status,bestSpeed:null,minSamples,targetRH,sampleCount:rows.length,
    comparableGroups:sufficient.length};
}

/**
 * Décrit les mesures par niveau manuel et tranche horaire locale de 6 h.
 * Une médiane n'est affichée que si l'effectif et le nombre de jours suffisent.
 * Les tranches ne sont pas considérées comme des essais contrôlés.
 */
export function analyzeSpeedTimeContext(data, { minSamples = 5, minDays = 2 } = {}) {
  const rows=(Array.isArray(data)?data:[]).filter(r=>
    Number.isFinite(r?.t) && Number.isFinite(r?.vmiModeRaw) && [1,2,3].includes(r.vmiModeRaw) &&
    Number.isFinite(r.st) && isPlausibleTemperature(r.st) &&
    Number.isFinite(r.sh) && isPlausibleHumidity(r.sh)
  );
  const buckets=['00–05 h','06–11 h','12–17 h','18–23 h'];
  const bySpeedBucketDay=new Map();
  const dayKey=t=>{
    const d=new Date(t);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  };
  for(const row of rows){
    const bucket=Math.floor(new Date(row.t).getHours()/6);
    const key=row.vmiModeRaw+':'+bucket;
    if(!bySpeedBucketDay.has(key))bySpeedBucketDay.set(key,new Map());
    const days=bySpeedBucketDay.get(key),day=dayKey(row.t);
    if(!days.has(day))days.set(day,[]);
    days.get(day).push(row);
  }
  const summarizeDay=samples=>{
    const incoming=samples.filter(r=>Number.isFinite(r.te)&&isPlausibleTemperature(r.te)&&
      Number.isFinite(r.he)&&isPlausibleHumidity(r.he));
    const deltas=incoming.map(r=>absoluteHumidity(r.st,r.sh)-absoluteHumidity(r.te,r.he));
    const rpms=samples.map(r=>r.rpm).filter(v=>Number.isFinite(v)&&v>0&&v<10000);
    return {
      medianRH:median(samples.map(r=>r.sh)),
      medianIndoorHA:median(samples.map(r=>absoluteHumidity(r.st,r.sh))),
      medianIncomingHA:median(incoming.map(r=>absoluteHumidity(r.te,r.he))),
      medianDeltaHA:median(deltas),
      deltaSamples:deltas.length,
      medianRPM:median(rpms),
      rpmSamples:rpms.length
    };
  };
  // Chaque date pèse autant : on calcule d'abord une médiane par jour,
  // puis la médiane de ces valeurs journalières (et non une médiane globale pondérée par le volume).
  const summarize=daySamples=>{
    const daily=daySamples.map(samples=>summarizeDay(samples));
    const sum=key=>daily.reduce((total,item)=>total+item[key+'Samples'],0);
    return {
      medianRH:median(daily.map(day=>day.medianRH)),
      medianIndoorHA:median(daily.map(day=>day.medianIndoorHA)),
      medianIncomingHA:median(daily.map(day=>day.medianIncomingHA)),
      medianDeltaHA:median(daily.map(day=>day.medianDeltaHA)),
      deltaSamples:sum('delta'),
      medianRPM:median(daily.map(day=>day.medianRPM)),
      rpmSamples:sum('rpm'),
      dayCount:daily.length,
      daily
    };
  };
  const comparisons=[];
  const groupCandidates=new Map();
  for(let bucket=0;bucket<4;bucket++){
    for(const pair of [[1,2],[1,3],[2,3]]){
      const firstDays=bySpeedBucketDay.get(pair[0]+':'+bucket)||new Map();
      const secondDays=bySpeedBucketDay.get(pair[1]+':'+bucket)||new Map();
      const sharedDayKeys=[...firstDays.keys()].filter(day=>secondDays.has(day)).sort();
      const firstDaySamples=sharedDayKeys.map(day=>firstDays.get(day));
      const secondDaySamples=sharedDayKeys.map(day=>secondDays.get(day));
      const firstSamples=firstDaySamples.flat();
      const secondSamples=secondDaySamples.flat();
      const ready=sharedDayKeys.length>=minDays&&firstSamples.length>=minSamples&&secondSamples.length>=minSamples;
      const firstStats=ready?summarize(firstDaySamples):null;
      const secondStats=ready?summarize(secondDaySamples):null;
      const comparison={
        bucket,label:buckets[bucket],speeds:pair,
        sharedDayCount:sharedDayKeys.length,
        sampleCountFirst:firstSamples.length,
        sampleCountSecond:secondSamples.length,
        ready,
        reason:ready?null:sharedDayKeys.length<minDays
          ? 'Pas assez de dates communes'
          : 'Pas assez de relevés sur les dates communes',
        first:firstStats,
        second:secondStats,
        medianIncomingHADifference:ready?median(firstStats.daily.map((day,index)=>
          (secondStats.daily[index].medianIncomingHA??NaN)-(day.medianIncomingHA??NaN)
        )):null,
        medianDeltaHADifference:ready?median(firstStats.daily.map((day,index)=>
          (secondStats.daily[index].medianDeltaHA??NaN)-(day.medianDeltaHA??NaN)
        )):null,
        sharedDayKeys
      };
      comparisons.push(comparison);
      for(const [speed,samples,stats,otherSpeed,sampleCount] of [
        [pair[0],firstSamples,comparison.first,pair[1],firstSamples.length],
        [pair[1],secondSamples,comparison.second,pair[0],secondSamples.length]
      ]){
        const key=speed+':'+bucket;
        const candidate={
          speed,bucket,label:buckets[bucket],otherSpeed,
          sampleCount,dayCount:sharedDayKeys.length,sharedDays:sharedDayKeys.length,
          ready,stats
        };
        const current=groupCandidates.get(key);
        if(!current||candidate.sharedDays>current.sharedDays||
          (candidate.sharedDays===current.sharedDays&&candidate.ready&&!current.ready)||
          (candidate.sharedDays===current.sharedDays&&candidate.ready===current.ready&&candidate.sampleCount>current.sampleCount)){
          groupCandidates.set(key,candidate);
        }
      }
    }
  }
  const groups=[];
  for(let bucket=0;bucket<4;bucket++){
    for(const speed of [1,2,3]){
      const candidate=groupCandidates.get(speed+':'+bucket);
      groups.push(candidate?{
        ...candidate,
        medianRH:candidate.stats?.medianRH??null,
        medianIndoorHA:candidate.stats?.medianIndoorHA??null,
        medianIncomingHA:candidate.stats?.medianIncomingHA??null,
        medianDeltaHA:candidate.stats?.medianDeltaHA??null,
        deltaSamples:candidate.stats?.deltaSamples??0,
        medianRPM:candidate.stats?.medianRPM??null,
        rpmSamples:candidate.stats?.rpmSamples??0
      }:{
        speed,bucket,label:buckets[bucket],otherSpeed:null,
        sampleCount:0,dayCount:0,sharedDays:0,ready:false,
        medianRH:null,medianIndoorHA:null,medianIncomingHA:null,
        medianDeltaHA:null,deltaSamples:0,medianRPM:null,rpmSamples:0
      });
    }
  }
  return {
    groups,
    comparisons,
    minSamples,
    minDays,
    comparableBuckets:[...new Set(comparisons.filter(c=>c.ready).map(c=>c.bucket))]
  };
}

/**
 * Compare deux périodes calendaires successives à mode et tranche horaire identiques.
 * Les valeurs brutes restent brutes ; aucune variation n'est qualifiée de panne ou d'encrassement.
 */
export function compareOperatingPeriods(data, {
  periodDays = 7, minSamples = 12, minDays = 3
} = {}) {
  const rows = (Array.isArray(data) ? data : []).filter(row =>
    Number.isFinite(row?.t) &&
    Number.isFinite(row?.vmiModeRaw) && [1, 2, 3].includes(row.vmiModeRaw)
  );
  if (!rows.length) {
    return { status: 'no-mode-data', periodDays, minSamples, minDays, periods: [], comparisons: [] };
  }

  const latestTimestamp = rows.reduce((latest, row) => Math.max(latest, row.t), -Infinity);
  const latest = new Date(latestTimestamp);
  const currentEnd = new Date(latest.getFullYear(), latest.getMonth(), latest.getDate() + 1);
  const currentStart = new Date(currentEnd);
  currentStart.setDate(currentStart.getDate() - periodDays);
  const previousStart = new Date(currentStart);
  previousStart.setDate(previousStart.getDate() - periodDays);
  const key = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const periods = [
    { id: 'previous', start: previousStart, end: currentStart },
    { id: 'current', start: currentStart, end: currentEnd }
  ].map(period => ({
    id: period.id,
    start: key(period.start),
    end: key(new Date(period.end.getFullYear(), period.end.getMonth(), period.end.getDate()-1)),
    startMs: period.start.getTime(),
    endMs: period.end.getTime()
  }));

  const metrics = [
    { key: 'debit', label: 'Débit', unit: 'm³/h', verified: true },
    { key: 'rpm', label: 'Régime moteur', unit: 'tr/min' },
    { key: 'vmiPwmRaw', label: 'PWM', unit: 'valeur brute' },
    { key: 'motorPressureRaw', label: 'Pression moteur', unit: 'valeur brute, unité inconnue' }
  ];
  const comparisons = [];
  for (const mode of [1, 2, 3]) {
    for (let bucket = 0; bucket < 4; bucket++) {
      const periodStats = periods.map(period => {
        const samples = rows.filter(row =>
          row.vmiModeRaw === mode &&
          row.t >= period.startMs && row.t < period.endMs &&
          new Date(row.t).getHours() >= bucket * 6 &&
          new Date(row.t).getHours() < (bucket + 1) * 6
        );
        const days = new Set(samples.map(row => key(new Date(row.t))));
        const values = Object.fromEntries(metrics.map(metric => {
          const valid = samples.map(row => row[metric.key]).filter(value =>
            Number.isFinite(value) &&
            (metric.key !== 'rpm' || (value > 0 && value < 10000)) &&
            (metric.key !== 'debit' || value >= 0)
          );
          return [metric.key, { median: median(valid), count: valid.length }];
        }));
        return {
          id: period.id, sampleCount: samples.length, dayCount: days.size,
          ready: samples.length >= minSamples && days.size >= minDays,
          values
        };
      });
      const [previous, current] = periodStats;
      const deltas = {};
      if (previous.ready && current.ready) {
        for (const metric of metrics) {
          const before = previous.values[metric.key].median;
          const after = current.values[metric.key].median;
          deltas[metric.key] = before == null || after == null ? null : {
            previous: before,
            current: after,
            absolute: after - before,
            relativePercent: before !== 0 ? ((after - before) / Math.abs(before)) * 100 : null,
            unit: metric.unit
          };
        }
      }
      comparisons.push({
        mode, bucket, label: ['00–05 h','06–11 h','12–17 h','18–23 h'][bucket],
        previous, current,
        comparable: previous.ready && current.ready,
        deltas
      });
    }
  }
  for (const item of comparisons) {
    item.comparable = item.comparable && metrics.some(metric =>
      item.previous.values[metric.key].median != null && item.current.values[metric.key].median != null
    );
  }
  const comparableCount = comparisons.filter(item => item.comparable).length;
  return {
    status: comparableCount ? 'comparison-available' : 'insufficient-data',
    periodDays, minSamples, minDays, periods, comparisons,
    comparableCount,
    limits: [
      'Comparaison descriptive de deux périodes calendaires successives, à Mode et tranche horaire identiques.',
      'Chaque période doit contenir au moins le nombre minimal de relevés et de jours distincts.',
      'Les médianes ne neutralisent pas les différences de météo, d’occupation, d’ouvertures, ni les changements de réglage non consignés.',
      'Une variation de débit ou de régime moteur ne prouve pas un encrassement du filtre ni une panne.',
      'PWM et Pression moteur restent des valeurs brutes sans unité physique confirmée.'
    ]
  };
}

/** Inventaire des champs VMI+ disponibles ; aucune unité ni consommation n'est déduite. */
export function summarizeEnergyReadiness(data) {
  const rows=Array.isArray(data)?data:[];
  const fields=[
    {key:'rpm',label:'Régime moteur',unit:'tr/min (confirmé)',verified:true},
    {key:'debit',label:'Débit',unit:'m³/h',verified:true},
    {key:'vmiSpeedRaw',label:'Code vitesse VMI+',unit:'code brut',verified:false},
    {key:'vmiPwmRaw',label:'PWM VMI+',unit:'valeur brute (échelle à confirmer)',verified:false},
    {key:'consDpRaw',label:'Cons DP',unit:'signification et unité à confirmer',verified:false},
    {key:'consResRaw',label:'Cons Res',unit:'signification et unité à confirmer',verified:false},
    {key:'consHydroRRaw',label:'Cons HydroR',unit:'signification et unité à confirmer',verified:false},
    {key:'consTmaxRaw',label:'Seuil température extérieure (Cons TMax)',unit:'consigne en °C (sens confirmé)',verified:true},
    {key:'kmoteurRaw',label:'Kmoteur',unit:'signification et unité à confirmer',verified:false},
    {key:'jmoteurRaw',label:'Jmoteur',unit:'signification et unité à confirmer',verified:false},
    {key:'kreseauRaw',label:'Kreseau',unit:'signification et unité à confirmer',verified:false},
    {key:'jreseauRaw',label:'Jreseau',unit:'signification et unité à confirmer',verified:false},
    {key:'motorPressureRaw',label:'Pression Moteur',unit:'unité à confirmer',verified:false},
    {key:'offsetPressureRaw',label:'Offset Press',unit:'valeur brute',verified:false},
    {key:'operatingPctRaw',label:'% fonct',unit:'échelle à confirmer',verified:false},
    {key:'operatingPct2Raw',label:'% fonct.1',unit:'échelle à confirmer',verified:false},
    {key:'dcintRaw',label:'Dcint',unit:'signification et unité à confirmer',verified:false}
  ].map(field=>{
    const values=rows.map(r=>r?.[field.key]).filter(Number.isFinite);
    return {...field,count:values.length,
      zeroCount:values.filter(value=>value===0).length,
      nonZeroCount:values.filter(value=>value!==0).length,
      missingCount:rows.length-values.length,
      min:values.length?Math.min(...values):null,
      max:values.length?Math.max(...values):null,
      distinct:[...new Set(values)].sort((a,b)=>a-b)};
  });
  return {
    total:rows.length,fields,
    hasVerifiedElectricalEnergy:false,
    message:'Aucune mesure électrique vérifiée en watts ou kWh n’est disponible : la consommation et le rendement énergétique ne peuvent pas encore être calculés.'
  };
}

/**
 * Analyse les relevés autour de la consigne de température extérieure Cons TMax.
 * Les comparaisons restent descriptives et sont séparées par mode manuel déclaré.
 */
export function summarizeTemperatureLimit(data, {
  minimumGroupSamples = 5, minimumGroupDays = 2
} = {}) {
  const rows = Array.isArray(data) ? data : [];
  const eligible = rows.filter(row =>
    Number.isFinite(row?.consTmaxRaw) && isPlausibleTemperature(row.consTmaxRaw) &&
    Number.isFinite(row?.tExt) && isPlausibleTemperature(row.tExt)
  );
  const settings = new Map();
  const dayKey = timestamp => {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  };
  for (const row of eligible) {
    const threshold = row.consTmaxRaw;
    if (!settings.has(threshold)) settings.set(threshold, []);
    settings.get(threshold).push(row);
  }
  const summarize = samples => {
    const timestamps = samples.map(row => row.t).filter(Number.isFinite);
    const outdoor = samples.map(row => row.tExt).filter(Number.isFinite);
    return {
      sampleCount: samples.length,
      dayCount: new Set(timestamps.map(dayKey)).size,
      medianOutdoorTemp: median(outdoor)
    };
  };
  const pairedDailySummary = (dailyMap, sharedDays) => {
    const daily = sharedDays.map(day => {
      const samples = dailyMap.get(day) || [];
      return {
        sampleCount: samples.length,
        debit: median(samples.map(row => row.debit).filter(value => Number.isFinite(value) && value >= 0)),
        rpm: median(samples.map(row => row.rpm).filter(value => Number.isFinite(value) && value > 0 && value < 10000))
      };
    });
    return {
      sampleCount: daily.reduce((sum, item) => sum + item.sampleCount, 0),
      dayCount: daily.length,
      medianDebit: median(daily.map(item => item.debit)),
      medianRPM: median(daily.map(item => item.rpm))
    };
  };
  const thresholds = [...settings.entries()].sort((a,b) => a[0]-b[0]).map(([threshold, samples]) => {
    const aboveRows = samples.filter(row => row.tExt > threshold);
    const atOrBelowRows = samples.filter(row => row.tExt <= threshold);
    const modes = [1,2,3].map(mode => {
      const aboveModeRows = aboveRows.filter(row => row.vmiModeRaw === mode);
      const belowModeRows = atOrBelowRows.filter(row => row.vmiModeRaw === mode);
      const aboveDays = new Map(), belowDays = new Map();
      for (const row of aboveModeRows) {
        if (!Number.isFinite(row.t)) continue;
        const key = dayKey(row.t);
        if (!aboveDays.has(key)) aboveDays.set(key, []);
        aboveDays.get(key).push(row);
      }
      for (const row of belowModeRows) {
        if (!Number.isFinite(row.t)) continue;
        const key = dayKey(row.t);
        if (!belowDays.has(key)) belowDays.set(key, []);
        belowDays.get(key).push(row);
      }
      const sharedDays = [...aboveDays.keys()].filter(day => belowDays.has(day)).sort();
      const pairedAbove = pairedDailySummary(aboveDays, sharedDays);
      const pairedAtOrBelow = pairedDailySummary(belowDays, sharedDays);
      return {
        mode,
        above: summarize(aboveModeRows),
        atOrBelow: summarize(belowModeRows),
        sharedDayCount: sharedDays.length,
        pairedAbove,
        pairedAtOrBelow,
        comparable: sharedDays.length >= minimumGroupDays &&
          pairedAbove.sampleCount >= minimumGroupSamples &&
          pairedAtOrBelow.sampleCount >= minimumGroupSamples
      };
    }).filter(group => group.above.sampleCount || group.atOrBelow.sampleCount);
    return {
      threshold, sampleCount: samples.length,
      aboveThresholdCount: aboveRows.length,
      atOrBelowThresholdCount: atOrBelowRows.length,
      above: summarize(aboveRows),
      atOrBelow: summarize(atOrBelowRows),
      modes
    };
  });
  return {
    status: thresholds.length ? 'available' : 'no-comparable-data',
    minimumGroupSamples, minimumGroupDays,
    inputSampleCount: rows.length,
    eligibleSampleCount: eligible.length,
    missingOutdoorTemperatureCount: rows.filter(row =>
      Number.isFinite(row?.consTmaxRaw) && isPlausibleTemperature(row.consTmaxRaw) &&
      (!Number.isFinite(row?.tExt) || !isPlausibleTemperature(row.tExt))
    ).length,
    thresholds,
    limits: [
      'Cons TMax est interprété comme une consigne de température extérieure en °C, selon la confirmation de l’utilisateur.',
      'Un relevé au-dessus du seuil indique une condition où la réduction de ventilation peut s’appliquer ; il ne prouve pas à lui seul que la régulation a effectivement réduit le débit.',
      'Les médianes comparatives sont calculées par jour puis équilibrées sur les mêmes dates présentes au-dessus et au seuil ou en dessous, séparément par Mode manuel déclaré.',
      'La comparaison ne neutralise pas l’heure, la saison, les autres réglages ni les conditions d’installation.'
    ]
  };
}

/**
 * Analyse la différence d'humidité absolue salon - air entrant dans le temps.
 * Les durées sont estimées entre deux mesures successives par interpolation
 * du delta. Les intervalles supérieurs à maxGapHours ne sont jamais extrapolés.
 */
export function analyzeHygrometricPeriods(data, { threshold = 1, maxGapHours = 2 } = {}) {
  const rows=(Array.isArray(data)?data:[])
    .filter(r=>Number.isFinite(r?.t)&&Number.isFinite(r.st)&&isPlausibleTemperature(r.st)&&
      Number.isFinite(r.sh)&&isPlausibleHumidity(r.sh)&&Number.isFinite(r.te)&&
      isPlausibleTemperature(r.te)&&Number.isFinite(r.he)&&isPlausibleHumidity(r.he))
    .map(r=>({t:r.t,delta:absoluteHumidity(r.st,r.sh)-absoluteHumidity(r.te,r.he)}))
    .filter(r=>Number.isFinite(r.delta)).sort((a,b)=>a.t-b.t);
  const result={sampleCount:rows.length,intervalCount:0,gapCount:0,medianDelta:median(rows.map(r=>r.delta)),
    threshold,maxGapHours,observedDurationMs:0,dryDurationMs:0,humidDurationMs:0,
    neutralDurationMs:0,longestDryMs:0,longestHumidMs:0};
  if(rows.length<2)return result;
  const maxGapMs=maxGapHours*3600000;
  let streak=null;
  const closeStreak=()=>{
    if(!streak)return;
    if(streak.category==='dry')result.longestDryMs=Math.max(result.longestDryMs,streak.duration);
    if(streak.category==='humid')result.longestHumidMs=Math.max(result.longestHumidMs,streak.duration);
    streak=null;
  };
  for(let i=1;i<rows.length;i++){
    const a=rows[i-1],b=rows[i],duration=b.t-a.t;
    if(!(duration>0))continue;
    if(duration>maxGapMs){result.gapCount++;closeStreak();continue}
    result.intervalCount++;result.observedDurationMs+=duration;
    const cuts=[0,1];
    for(const boundary of [threshold,-threshold]){
      if((a.delta<boundary&&b.delta>boundary)||(a.delta>boundary&&b.delta<boundary)){
        cuts.push((boundary-a.delta)/(b.delta-a.delta));
      }
    }
    cuts.sort((x,y)=>x-y);
    for(let j=1;j<cuts.length;j++){
      const from=cuts[j-1],to=cuts[j],part=(to-from)*duration;
      if(part<=0)continue;
      const midpoint=(from+to)/2;
      const delta=a.delta+(b.delta-a.delta)*midpoint;
      const category=delta>threshold?'dry':delta< -threshold?'humid':'neutral';
      if(category==='dry')result.dryDurationMs+=part;
      else if(category==='humid')result.humidDurationMs+=part;
      else result.neutralDurationMs+=part;
      const start=a.t+from*duration,end=a.t+to*duration;
      if(streak&&streak.category===category&&Math.abs(streak.end-start)<1){
        streak.duration+=part;streak.end=end;
      }else{
        closeStreak();streak={category,duration:part,end};
      }
    }
  }
  closeStreak();
  return result;
}



/**
 * Décrit le débit Debit (m³/h) selon le code Vitesse brut exporté par VMI+.
 * Aucun code Vitesse n'est converti en niveau manuel ; l'unité du débit est confirmée en m³/h.
 */
/** Regroupe le débit d'air Debit (m³/h) par mode VMI+ ; Mode et Vitesse restent distincts. */
/**
 * Référence descriptive du fonctionnement par mode VMI+.
 * Mode et code Vitesse brut restent distincts ; les unités non confirmées restent brutes.
 */
export function summarizeOperatingReference(data, { minSamples = 10 } = {}) {
  const rows = Array.isArray(data) ? data : [];
  const modes = new Map();
  for (const row of rows) {
    if (!Number.isFinite(row?.vmiModeRaw)) continue;
    if (!modes.has(row.vmiModeRaw)) modes.set(row.vmiModeRaw, []);
    modes.get(row.vmiModeRaw).push(row);
  }
  const metrics = [
    { key: 'debit', label: 'Débit', unit: 'm³/h', verified: true },
    { key: 'rpm', label: 'Régime moteur', unit: 'tr/min confirmé', verified: true },
    { key: 'vmiPwmRaw', label: 'PWM', unit: 'valeur brute', verified: false },
    { key: 'motorPressureRaw', label: 'Pression moteur', unit: 'unité à confirmer', verified: false },
    { key: 'consDpRaw', label: 'Cons DP', unit: 'sens et unité à confirmer', verified: false }
  ];
  const groups = [...modes.entries()].sort((a, b) => a[0] - b[0]).map(([mode, samples]) => {
    const fields = metrics.map(metric => {
      const values = samples.map(row => row?.[metric.key]).filter(Number.isFinite);
      const center = median(values);
      return {
        ...metric, count: values.length, median: center,
        min: values.length ? Math.min(...values) : null,
        max: values.length ? Math.max(...values) : null,
        medianAbsoluteDeviation: center == null ? null : median(values.map(value => Math.abs(value - center)))
      };
    });
    const timestamps = samples.map(row => row?.t).filter(Number.isFinite);
    const days = new Set(timestamps.map(timestamp => {
      const date = new Date(timestamp);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }));
    return {
      mode, sampleCount: samples.length, dayCount: days.size,
      firstAt: timestamps.length ? Math.min(...timestamps) : null,
      lastAt: timestamps.length ? Math.max(...timestamps) : null,
      ready: samples.length >= minSamples && days.size >= 2,
      fields
    };
  });
  return {
    status: groups.some(group => group.ready) ? 'reference-available' : groups.length ? 'provisional' : 'no-mode-data',
    minSamples, groups,
    limits: [
      'Référence descriptive calculée sur les données importées actuellement, séparément pour chaque mode VMI+.',
      'Le champ Mode est distinct du champ Vitesse brut ; aucun code brut n’est converti en niveau manuel.',
      'Les médianes et plages ne prouvent ni un fonctionnement normal, ni une panne, ni une cause.',
      'PWM, Pression moteur et Cons DP restent des valeurs brutes : aucune unité physique ni consommation n’est déduite.',
      'Une comparaison temporelle fiable nécessitera plusieurs exports couvrant des périodes distinctes et comparables.'
    ]
  };
}

export function summarizeRawVmiMode(data) {
  const groups = new Map();
  for (const row of Array.isArray(data) ? data : []) {
    if (!Number.isFinite(row?.vmiModeRaw)) continue;
    const mode = row.vmiModeRaw;
    if (!groups.has(mode)) groups.set(mode, []);
    if (Number.isFinite(row.debit) && row.debit >= 0) {
      const volume = Number.isFinite(row.volumeRaw) && row.volumeRaw > 0 ? row.volumeRaw : null;
      groups.get(mode).push({ debit: row.debit, renewalRate: volume ? row.debit / volume : null });
    }
  }
  // Référence communiquée par l'utilisateur : mode 3 = 184 m³/h.
  // Elle reste distincte des débits Debit (m³/h) réellement présents dans l'historique.
  if (!groups.has(3)) groups.set(3, []);
  return [...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([mode, rows]) => ({
    mode, sampleCount: rows.length,
    medianDebit: median(rows.map(r=>r.debit)),
    minDebit: rows.length ? Math.min(...rows.map(r=>r.debit)) : null,
    maxDebit: rows.length ? Math.max(...rows.map(r=>r.debit)) : null,
    medianRenewalRate: median(rows.map(r=>r.renewalRate).filter(Number.isFinite)),
    referenceDebit: mode === 3 ? 184 : null,
    referenceRenewalRate: mode === 3 ? 184 / 337 : null
  }));
}

export function summarizeRawVmiSpeed(data) {
  const groups = new Map();
  for (const row of Array.isArray(data) ? data : []) {
    if (!Number.isFinite(row?.vmiSpeedRaw)) continue;
    const code = row.vmiSpeedRaw;
    if (!groups.has(code)) groups.set(code, []);
    if (Number.isFinite(row.debit)) groups.get(code).push(row.debit);
  }
  return [...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([code, values]) => ({
    code,
    sampleCount: values.length,
    medianDebit: median(values),
    minDebit: values.length ? Math.min(...values) : null,
    maxDebit: values.length ? Math.max(...values) : null
  }));
}

function fmtHours(hours) {
  if (!Number.isFinite(hours)) return '0 h';
  if (hours < 1) return `${Math.round(hours*60)} min`;
  return `${hours.toFixed(1)} h`;
}
