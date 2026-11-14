/** Analyses statistiques communes (sans effet sur les commandes VMI). */
import { absoluteHumidity, dewPoint } from './psychrometry.js';
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
    Number.isFinite(r?.manualLevel) && [1,2,3].includes(r.manualLevel) &&
    Number.isFinite(r.sh) && isPlausibleHumidity(r.sh) &&
    Number.isFinite(r.st) && isPlausibleTemperature(r.st)
  );
  const groups = [1,2,3].map(v => {
    const samples = rows.filter(r => r.manualLevel === v).sort((a,b)=>a.t-b.t);
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
    const otherDays=new Set(sufficient.filter(other=>other.v!==group.v)
      .flatMap(other=>[...dayKeysBySpeed.get(other.v)]));
    group.sharedDays=[...ownDays].filter(day=>otherDays.has(day)).length;
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
    Number.isFinite(r?.t) && Number.isFinite(r?.manualLevel) && [1,2,3].includes(r.manualLevel) &&
    Number.isFinite(r.st) && isPlausibleTemperature(r.st) &&
    Number.isFinite(r.sh) && isPlausibleHumidity(r.sh)
  );
  const groups=[];
  for(const speed of [1,2,3]){
    for(let bucket=0;bucket<4;bucket++){
      const samples=rows.filter(r=>r.manualLevel===speed&&Math.floor(new Date(r.t).getHours()/6)===bucket);
      const dayKeys=new Set(samples.map(r=>{
        const d=new Date(r.t);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      }));
      const deltas=samples.map(r=>{
        if(!Number.isFinite(r.te)||!isPlausibleTemperature(r.te)||!Number.isFinite(r.he)||!isPlausibleHumidity(r.he))return null;
        return absoluteHumidity(r.st,r.sh)-absoluteHumidity(r.te,r.he);
      }).filter(Number.isFinite);
      groups.push({
        speed,bucket,label:['00–05 h','06–11 h','12–17 h','18–23 h'][bucket],
        sampleCount:samples.length,dayCount:dayKeys.size,dayKeys:[...dayKeys],
        ready:samples.length>=minSamples&&dayKeys.size>=minDays,
        medianRH:median(samples.map(r=>r.sh)),
        medianIndoorHA:median(samples.map(r=>absoluteHumidity(r.st,r.sh))),
        medianDeltaHA:deltas.length?median(deltas):null,
        deltaSamples:deltas.length,
        medianRPM:median(samples.map(r=>r.rpm).filter(v=>Number.isFinite(v)&&v>0&&v<10000))
      });
    }
  }
  const comparableBuckets=[];
  for(let bucket=0;bucket<4;bucket++){
    const candidates=groups.filter(g=>g.bucket===bucket&&g.ready);
    const sharedBySpeed=new Map(candidates.map(g=>[g.speed,candidates
      .filter(other=>other.speed!==g.speed)
      .reduce((all,other)=>{for(const day of other.dayKeys)if(g.dayKeys.includes(day))all.add(day);return all},new Set()).size
    ]));
    for(const group of groups.filter(g=>g.bucket===bucket)){
      group.sharedDays=sharedBySpeed.get(group.speed)||0;
      group.ready=group.ready&&group.sharedDays>=minDays;
      if(!group.ready){group.medianRH=null;group.medianIndoorHA=null;group.medianDeltaHA=null;group.medianRPM=null}
      delete group.dayKeys;
    }
    if(groups.filter(g=>g.bucket===bucket&&g.ready).length>=2)comparableBuckets.push(bucket);
  }
  return {groups,minSamples,minDays,comparableBuckets};
}

/** Inventaire des champs VMI+ disponibles ; aucune unité ni consommation n'est déduite. */
export function summarizeEnergyReadiness(data) {
  const rows=Array.isArray(data)?data:[];
  const fields=[
    {key:'rpm',label:'Régime moteur',unit:'tr/min (confirmé)',verified:true},
    {key:'debit',label:'Débit exporté',unit:'m³/h (confirmé)',verified:true},
    {key:'vmiSpeedRaw',label:'Code vitesse VMI+',unit:'code brut',verified:false},
    {key:'vmiPwmRaw',label:'PWM VMI+',unit:'valeur brute (échelle à confirmer)',verified:false},
    {key:'consDpRaw',label:'Cons DP',unit:'signification et unité à confirmer',verified:false},
    {key:'consResRaw',label:'Cons Res',unit:'signification et unité à confirmer',verified:false},
    {key:'consHydroRRaw',label:'Cons HydroR',unit:'signification et unité à confirmer',verified:false},
    {key:'consTmaxRaw',label:'Cons TMax',unit:'signification et unité à confirmer',verified:false},
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

function validHygroRow(r) {
  if (!Number.isFinite(r?.t) || !Number.isFinite(r.st) || !isPlausibleTemperature(r.st) ||
      !Number.isFinite(r.sh) || !isPlausibleHumidity(r.sh)) return false;
  const ha = absoluteHumidity(r.st, r.sh);
  return Number.isFinite(ha);
}

/** Médianes journalières locales : aucune interpolation entre les jours. */
export function summarizeDailyTrends(data) {
  const days = new Map();
  for (const r of Array.isArray(data) ? data : []) {
    if (!validHygroRow(r)) continue;
    const date = new Date(r.t);
    const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(r);
  }
  const daily = [...days.entries()].map(([date, rows]) => ({
    date,
    sampleCount: rows.length,
    medianRH: median(rows.map(r => r.sh)),
    medianTemperature: median(rows.map(r => r.st)),
    medianAbsoluteHumidity: median(rows.map(r => absoluteHumidity(r.st, r.sh)))
  })).sort((a,b) => a.date.localeCompare(b.date));
  const sufficientlySampled = daily.filter(d => d.sampleCount >= 3);
  const last = sufficientlySampled.at(-1) || null;
  const previous = sufficientlySampled.length > 1 ? sufficientlySampled.at(-2) : null;
  return {
    days: daily,
    sampledDays: sufficientlySampled.length,
    latest: last,
    previous,
    changeRH: last && previous ? last.medianRH - previous.medianRH : null,
    changeAbsoluteHumidity: last && previous ? last.medianAbsoluteHumidity - previous.medianAbsoluteHumidity : null
  };
}

/** Profils horaires locaux. Une tranche n'est interprétée qu'à partir de 3 relevés. */
export function analyzeHourlyPatterns(data, minSamples = 3) {
  const buckets = Array.from({length:4}, (_,i) => ({
    label: ['00–05 h','06–11 h','12–17 h','18–23 h'][i],
    startHour: i*6,
    sampleCount: 0,
    medianRH: null,
    medianDelta: null
  }));
  const values = buckets.map(() => ({rh:[], delta:[]}));
  for (const r of Array.isArray(data) ? data : []) {
    if (!validHygroRow(r) || !Number.isFinite(r.te) || !isPlausibleTemperature(r.te) ||
        !Number.isFinite(r.he) || !isPlausibleHumidity(r.he)) continue;
    const bucket = Math.floor(new Date(r.t).getHours()/6);
    values[bucket].rh.push(r.sh);
    values[bucket].delta.push(absoluteHumidity(r.st,r.sh)-absoluteHumidity(r.te,r.he));
  }
  for (let i=0;i<buckets.length;i++) {
    const v=values[i];
    buckets[i].sampleCount=v.rh.length;
    if(v.rh.length>=minSamples) {
      buckets[i].medianRH=median(v.rh);
      buckets[i].medianDelta=median(v.delta);
    }
  }
  return { buckets, minSamples };
}

/**
 * Repère des variations rapides à examiner, sans les qualifier de panne.
 * Seules les mesures successives espacées de 2 h maximum sont comparées.
 */
export function detectRapidChanges(data, { maxGapHours = 2, rhJump = 15, absoluteHumidityJump = 3 } = {}) {
  const rows=(Array.isArray(data)?data:[])
    .filter(validHygroRow)
    .map(r=>({t:r.t,rh:r.sh,ha:absoluteHumidity(r.st,r.sh)}))
    .sort((a,b)=>a.t-b.t);
  const events=[];
  const maxGap=maxGapHours*60*60*1000;
  for(let i=1;i<rows.length;i++){
    const a=rows[i-1],b=rows[i],gap=b.t-a.t;
    if(gap<=0||gap>maxGap)continue;
    const deltaRH=b.rh-a.rh,deltaHA=b.ha-a.ha;
    if(Math.abs(deltaRH)>=rhJump||Math.abs(deltaHA)>=absoluteHumidityJump){
      events.push({
        start:a.t,end:b.t,gapMs:gap,
        deltaRH,deltaAbsoluteHumidity:deltaHA,
        reasons:[
          ...(Math.abs(deltaRH)>=rhJump?['relative-humidity']:[]),
          ...(Math.abs(deltaHA)>=absoluteHumidityJump?['absolute-humidity']:[ ])
        ]
      });
    }
  }
  return events;
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
  const unique = new Map();
  for (const r of Array.isArray(data) ? data : []) {
    if (!Number.isFinite(r?.t) ||
        !Number.isFinite(r.st) || !isPlausibleTemperature(r.st) ||
        !Number.isFinite(r.sh) || !isPlausibleHumidity(r.sh) ||
        !Number.isFinite(r.te) || !isPlausibleTemperature(r.te) ||
        !Number.isFinite(r.he) || !isPlausibleHumidity(r.he)) continue;
    const indoor = absoluteHumidity(r.st, r.sh);
    const incoming = absoluteHumidity(r.te, r.he);
    if (!Number.isFinite(indoor) || !Number.isFinite(incoming)) continue;
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
  const dryShare=periods.observedDurationMs?periods.dryDurationMs/periods.observedDurationMs:null;
  const humidShare=periods.observedDurationMs?periods.humidDurationMs/periods.observedDurationMs:null;
  const daily=summarizeDailyTrends(rows);
  const first=daily.days.filter(d=>d.sampleCount>=3)[0]||null;
  const last=[...daily.days].reverse().find(d=>d.sampleCount>=3)||null;
  const trendSpanDays=first&&last?(Date.parse(last.date+'T00:00:00Z')-Date.parse(first.date+'T00:00:00Z'))/86400000:0;
  const trendChange=first&&last&&trendSpanDays>=2?last.medianAbsoluteHumidity-first.medianAbsoluteHumidity:null;

  const hourly=analyzeHourlyPatterns(rows,5);
  const hourlyDetails=hourly.buckets.map((bucket,index)=>{
    const samples=rows.filter(r=>Math.floor(new Date(r.t).getHours()/6)===index);
    return {...bucket,dayCount:new Set(samples.map(r=>dayKey(r.t))).size};
  });
  const comparableHours=hourlyDetails.filter(b=>b.sampleCount>=5&&b.dayCount>=2);
  const bestWindow=comparableHours.length>=2
    ? [...comparableHours].sort((a,b)=>b.medianDelta-a.medianDelta)[0]
    : null;

  const coverageLevel=rows.length>=60&&days.size>=5&&observedHours>=24?'élevée'
    :rows.length>=24&&days.size>=3&&observedHours>=12?'modérée':'faible';
  const sufficient=rows.length>=minSamples&&days.size>=2&&observedHours>=3;
  const observations=[];

  if(!sufficient){
    observations.push({
      code:'coverage-limited',level:'info',
      title:'Historique encore trop limité',
      detail:`${rows.length} relevé(s) simultanés valides sur ${days.size} jour(s), avec ${fmtHours(observedHours)} de périodes exploitables. Il faut davantage de mesures réparties sur plusieurs jours pour produire un diagnostic fiable.`,
      recommendation:'Importer un historique plus long et vérifier que les températures et humidités du salon et de l’air entrant sont présentes.'
    });
  } else if(periods.medianDelta!=null&&periods.medianDelta>dryDelta&&dryShare>=0.6){
    observations.push({
      code:'air-drying-potential',level:'positive',
      title:'Conditions souvent favorables à l’assèchement',
      detail:`L’air entrant est plus sec que l’air du logement pendant ${Math.round(dryShare*100)} % des durées observées. L’écart médian salon − air entrant est de ${periods.medianDelta.toFixed(1)} g/m³.`,
      recommendation:'Le renouvellement d’air dispose d’un potentiel hygrométrique favorable pendant ces périodes. Cela ne mesure pas l’effet réel sans débit d’air validé.'
    });
  } else if(periods.medianDelta!=null&&periods.medianDelta< -dryDelta&&humidShare>=0.6){
    observations.push({
      code:'air-moisture-potential',level:'caution',
      title:'L’air entrant est souvent plus humide',
      detail:`L’air entrant est plus humide que l’air intérieur pendant ${Math.round(humidShare*100)} % des durées observées. L’écart médian salon − air entrant est de ${periods.medianDelta.toFixed(1)} g/m³.`,
      recommendation:'Une hausse de vitesse ne garantit pas un assèchement dans ces conditions. Comparer les périodes et suivre l’évolution intérieure avant toute modification manuelle.'
    });
  } else {
    observations.push({
      code:'mixed-air-conditions',level:'info',
      title:'Conditions hygrométriques variables',
      detail:`Aucune situation dominante nette : air entrant plus sec ${Math.round((dryShare||0)*100)} % du temps observé, plus humide ${Math.round((humidShare||0)*100)} %.`,
      recommendation:'Privilégier l’analyse des périodes horaires et saisonnières plutôt qu’une conclusion basée sur un relevé isolé.'
    });
  }

  if(trendChange!=null&&trendChange>=trendDelta){
    observations.push({
      code:'indoor-moisture-rising',level:'caution',
      title:'Humidité absolue intérieure en hausse',
      detail:`L’humidité absolue médiane du logement a augmenté de ${trendChange.toFixed(1)} g/m³ entre le ${first.date} et le ${last.date}.`,
      recommendation:'Examiner les apports de vapeur d’eau (douches, cuisson, séchage du linge, occupation), les extractions et les conditions extérieures. Cette tendance ne suffit pas à identifier une cause.'
    });
  } else if(trendChange!=null&&trendChange<=-trendDelta){
    observations.push({
      code:'indoor-moisture-falling',level:'positive',
      title:'Humidité absolue intérieure en baisse',
      detail:`L’humidité absolue médiane du logement a diminué de ${Math.abs(trendChange).toFixed(1)} g/m³ entre le ${first.date} et le ${last.date}.`,
      recommendation:'Poursuivre l’observation pour vérifier que cette baisse se maintient sur les prochains jours.'
    });
  }

  if(bestWindow&&bestWindow.medianDelta>dryDelta){
    observations.push({
      code:'favorable-time-window',level:'positive',
      title:'Période horaire plus favorable repérée',
      detail:`Sur les tranches comparables, ${bestWindow.label} présente l’écart médian le plus favorable (${bestWindow.medianDelta.toFixed(1)} g/m³), sur ${bestWindow.sampleCount} relevés répartis sur ${bestWindow.dayCount} jours.`,
      recommendation:'Vérifier si ce créneau se retrouve sur d’autres semaines et saisons avant d’en tirer une règle de réglage.'
    });
  }

  return {
    status:sufficient?'analysis-available':'insufficient-data',
    coverageLevel,
    sampleCount:rows.length,
    dayCount:days.size,
    observedHours,
    coverageSpanHours,
    medianSampleIntervalMinutes:Number.isFinite(medianSampleIntervalMinutes)?medianSampleIntervalMinutes:null,
    excludedGapCount:excludedIntervals.length,
    largestExcludedGapHours,
    maxGapHours,
    medianIndoorRH:median(rows.map(r=>r.sh)),
    medianIndoorHA:median(rows.map(r=>r.indoorHA)),
    medianIncomingHA:median(rows.map(r=>r.incomingHA)),
    medianIndoorDewPoint:median(rows.map(r=>r.indoorDew)),
    medianIncomingDewPoint:median(rows.map(r=>r.incomingDew)),
    dryShare,humidShare,trendChange,bestWindow,
    observations,
    limits:[
      'Les durées sont estimées entre deux relevés, sans extrapolation au-delà de 2 heures.',
      'L’humidité absolue décrit la teneur en vapeur d’eau, pas le débit ni le renouvellement d’air réel.',
      'Le point de rosée calculé n’est pas une mesure de température de paroi : aucun risque de condensation n’est déduit.',
      'Les observations ne prouvent ni une panne, ni la cause d’une variation, ni une vitesse optimale.'
    ]
  };
}

/**
 * Décrit les valeurs Debit brutes selon le code Vitesse brut exporté par VMI+.
 * Aucun code n'est converti en niveau manuel et aucune unité n'est attribuée au débit.
 */
/** Regroupe le débit confirmé en m³/h par mode VMI+ distinct du code vitesse. */
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
    { key: 'debit', label: 'Débit', unit: 'm³/h confirmé', verified: true },
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
  // Référence confirmée par l'utilisateur : mode 3 = 184 m³/h.
  // Elle reste distincte des débits réellement présents dans l'historique.
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
