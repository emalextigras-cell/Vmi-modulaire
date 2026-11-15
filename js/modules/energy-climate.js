import { estimateFanPowerFromFlow } from './energy-estimate.js';
import { absoluteHumidity } from './psychrometry.js';

const HOUR = 3600000;
const dayKey = timestamp => {
  const date = new Date(timestamp);
  return [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-');
};
const median = values => {
  const sorted = values.filter(Number.isFinite).sort((a,b)=>a-b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length/2);
  return sorted.length%2 ? sorted[middle] : (sorted[middle-1]+sorted[middle])/2;
};

/**
 * Vue journalière descriptive croisant l'estimation du ventilateur et le climat
 * intérieur/entrant. Les journées ne sont retenues que si les deux sources
 * sont présentes : >= minFanHours intégrées et >= minClimateSamples valides.
 * Aucun lien causal ni rendement n'est calculé.
 */
export function summarizeDailyEnergyClimateContext(history, {
  maxGapHours = 2, minFanHours = 3, minClimateSamples = 3, minDays = 3
} = {}) {
  const rows=(Array.isArray(history)?history:[])
    .filter(row=>Number.isFinite(row?.t))
    .sort((a,b)=>a.t-b.t);
  const unique=[];
  for(const row of rows){
    if(unique.length&&unique[unique.length-1].t===row.t)unique[unique.length-1]=row;
    else unique.push(row);
  }
  const days=new Map();
  const ensure=key=>{
    if(!days.has(key))days.set(key,{
      date:key,energyWh:0,fanCoveredMs:0,fanIntervals:0,
      indoorRH:[],indoorTemp:[],indoorAbsHumidity:[],
      incomingAbsHumidity:[],deltaAbsHumidity:[]
    });
    return days.get(key);
  };
  for(const row of unique){
    const temp=Number.isFinite(row.st)&&row.st>=-30&&row.st<=60;
    const rh=Number.isFinite(row.sh)&&row.sh>=0&&row.sh<=100;
    if(temp&&rh){
      const day=ensure(dayKey(row.t));
      day.indoorRH.push(row.sh);
      day.indoorTemp.push(row.st);
      day.indoorAbsHumidity.push(absoluteHumidity(row.st,row.sh));
      const incomingTemp=Number.isFinite(row.te)&&row.te>=-30&&row.te<=60;
      const incomingRH=Number.isFinite(row.he)&&row.he>=0&&row.he<=100;
      if(incomingTemp&&incomingRH){
        const incoming=absoluteHumidity(row.te,row.he);
        day.incomingAbsHumidity.push(incoming);
        day.deltaAbsHumidity.push(absoluteHumidity(row.st,row.sh)-incoming);
      }
    }
  }
  const maxGapMs=maxGapHours*HOUR;
  for(let i=1;i<unique.length;i++){
    const a=unique[i-1],b=unique[i],elapsed=b.t-a.t;
    if(!(elapsed>0)||elapsed>maxGapMs)continue;
    const powerA=estimateFanPowerFromFlow(a.debit),powerB=estimateFanPowerFromFlow(b.debit);
    if(powerA==null||powerB==null)continue;
    const midpoint=a.t+elapsed/2;
    const day=ensure(dayKey(midpoint));
    day.energyWh+=((powerA+powerB)/2)*(elapsed/HOUR);
    day.fanCoveredMs+=elapsed;
    day.fanIntervals++;
  }
  const daily=[...days.values()].map(day=>{
    const fanHours=day.fanCoveredMs/HOUR;
    const climateSampleCount=day.indoorAbsHumidity.length;
    const paired=fanHours>=minFanHours&&climateSampleCount>=minClimateSamples;
    return {
      date:day.date,paired,fanHours,fanIntervals:day.fanIntervals,
      estimatedKwh:day.fanIntervals?day.energyWh/1000:null,
      averagePowerW:fanHours>0?day.energyWh/fanHours:null,
      climateSampleCount,
      medianIndoorRH:median(day.indoorRH),
      medianIndoorTemp:median(day.indoorTemp),
      medianIndoorAbsHumidity:median(day.indoorAbsHumidity),
      medianIncomingAbsHumidity:median(day.incomingAbsHumidity),
      medianDeltaAbsHumidity:median(day.deltaAbsHumidity)
    };
  }).sort((a,b)=>a.date.localeCompare(b.date));
  const matchedDays=daily.filter(day=>day.paired);
  return {
    status:matchedDays.length>=minDays?'available':'insufficient-data',
    days:daily,matchedDays,matchedDayCount:matchedDays.length,
    maxGapHours,minFanHours,minClimateSamples,minDays,
    limits:[
      'Une journée est rapprochée uniquement si elle comporte au moins '+minFanHours+' h d’intervalles de ventilateur estimés et '+minClimateSamples+' relevés hygrométriques valides.',
      'La puissance est estimée à partir du débit et des points constructeur ; elle ne constitue pas une mesure au compteur.',
      'Les intervalles de plus de '+maxGapHours+' h et les débits hors plage constructeur sont exclus.',
      'Les valeurs décrivent des observations concomitantes ; elles ne démontrent aucune causalité ni aucun rendement énergétique.'
    ]
  };
}
