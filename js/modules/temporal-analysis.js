import { median } from './analysis.js';
import { absoluteHumidity } from './psychrometry.js';
import { isPlausibleHumidity, isPlausibleTemperature } from './data-quality.js';

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
