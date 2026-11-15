import { absoluteHumidity } from './psychrometry.js';
import { isPlausibleHumidity, isPlausibleTemperature } from './data-quality.js';
import { summarizeDailyEnergyClimateContext } from './energy-climate.js';

const assertPositiveInteger = (name,value) => {
  if(!Number.isInteger(value)||value<1) {
    throw new RangeError(name+' doit être un entier supérieur ou égal à 1.');
  }
};
const assertPositiveFinite = (name,value) => {
  if(!Number.isFinite(value)||value<=0) {
    throw new RangeError(name+' doit être un nombre fini strictement positif.');
  }
};
const assertNonNegativeFinite = (name,value) => {
  if(!Number.isFinite(value)||value<0) {
    throw new RangeError(name+' doit être un nombre fini positif ou nul.');
  }
};
const median = values => {
  const sorted = values.filter(Number.isFinite).sort((a,b)=>a-b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length/2);
  return sorted.length%2 ? sorted[middle] : (sorted[middle-1]+sorted[middle])/2;
};
const dayKey = timestamp => {
  const date = new Date(timestamp);
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
};
const dateKey = date => [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
const shiftDate = (date,days) => new Date(date.getFullYear(),date.getMonth(),date.getDate()+days);

/**
 * Compare deux fenêtres calendaires hebdomadaires à partir des médianes
 * journalières. Les jours ont le même poids ; les données hors fenêtre ne
 * peuvent pas relier des historiques éloignés. L'énergie reste estimée.
 */
export function summarizeWeeklyDiagnostic(history,{
  windowDays=7,
  minSamplesPerDay=3,
  minDaysPerWindow=3,
  minEnergyDays=3,
  maxGapHours=2,
  changeThreshold=0.8
}={}) {
  assertPositiveInteger('windowDays',windowDays);
  assertPositiveInteger('minSamplesPerDay',minSamplesPerDay);
  assertPositiveInteger('minDaysPerWindow',minDaysPerWindow);
  assertPositiveInteger('minEnergyDays',minEnergyDays);
  assertPositiveFinite('maxGapHours',maxGapHours);
  assertNonNegativeFinite('changeThreshold',changeThreshold);
  if(minDaysPerWindow>windowDays) {
    throw new RangeError('minDaysPerWindow ne peut pas dépasser windowDays.');
  }
  if(minEnergyDays>windowDays) {
    throw new RangeError('minEnergyDays ne peut pas dépasser windowDays.');
  }
  const rows=(Array.isArray(history)?history:[])
    .filter(row=>Number.isFinite(row?.t))
    .sort((a,b)=>a.t-b.t);
  // Un même horodatage ne doit jamais être arbitrairement représenté par
  // la dernière ligne rencontrée : en cas de valeurs contradictoires,
  // l'instant est écarté pour éviter de biaiser les médianes et l'énergie.
  const groups=[];
  for(const row of rows){
    const last=groups[groups.length-1];
    if(last&&last.timestamp===row.t)last.rows.push(row);
    else groups.push({timestamp:row.t,rows:[row]});
  }
  const unique=[];
  let duplicateTimestampCount=0;
  let conflictingTimestampCount=0;
  for(const group of groups){
    if(group.rows.length>1)duplicateTimestampCount++;
    // Seules les valeurs réellement utilisées par ce bilan définissent
    // un conflit : hygrométrie, températures, horodatage et débit estimé.
    // Les métadonnées brutes sans effet sur ce calcul ne doivent pas écarter
    // un relevé autrement identique.
    const fingerprints=new Set(group.rows.map(row=>JSON.stringify(
      [row.t,row.debit,row.st,row.sh,row.te,row.he]
    )));
    if(fingerprints.size>1){
      conflictingTimestampCount++;
      continue;
    }
    unique.push(group.rows[0]);
  }
  if(!unique.length){
    return {status:'no-data',periods:[],comparison:null,minSamplesPerDay,minDaysPerWindow,windowDays,duplicateTimestampCount,conflictingTimestampCount};
  }

  // L'ancrage temporel doit suivre le dernier horodatage reçu, même si
  // ce relevé est écarté pour conflit : sinon un conflit récent ferait
  // reculer artificiellement les fenêtres et pourrait masquer la fraîcheur.
  const latest=new Date(rows[rows.length-1].t);
  const recentEnd=shiftDate(latest,1);
  const recentStart=shiftDate(recentEnd,-windowDays);
  const previousStart=shiftDate(recentStart,-windowDays);
  const periods=[
    {id:'previous',start:dateKey(previousStart),end:dateKey(shiftDate(recentStart,-1))},
    {id:'recent',start:dateKey(recentStart),end:dateKey(shiftDate(recentEnd,-1))}
  ];

  const dailyMap=new Map();
  for(const row of unique){
    if(!Number.isFinite(row.st)||!isPlausibleTemperature(row.st)||
       !Number.isFinite(row.sh)||!isPlausibleHumidity(row.sh)||
       !Number.isFinite(row.te)||!isPlausibleTemperature(row.te)||
       !Number.isFinite(row.he)||!isPlausibleHumidity(row.he)) continue;
    const key=dayKey(row.t);
    if(!dailyMap.has(key))dailyMap.set(key,{indoor:[],incoming:[],delta:[],rh:[],temperature:[]});
    const day=dailyMap.get(key);
    const indoor=absoluteHumidity(row.st,row.sh);
    const incoming=absoluteHumidity(row.te,row.he);
    if(!Number.isFinite(indoor)||!Number.isFinite(incoming))continue;
    day.indoor.push(indoor);
    day.incoming.push(incoming);
    day.delta.push(indoor-incoming);
    day.rh.push(row.sh);
    day.temperature.push(row.st);
  }

  const daily=[...dailyMap.entries()].map(([date,values])=>({
    date,sampleCount:values.indoor.length,
    medianIndoorHA:median(values.indoor),
    medianIncomingHA:median(values.incoming),
    medianDeltaHA:median(values.delta),
    medianRH:median(values.rh),
    medianTemperature:median(values.temperature)
  })).filter(day=>day.sampleCount>=minSamplesPerDay).sort((a,b)=>a.date.localeCompare(b.date));

  const energy=summarizeDailyEnergyClimateContext(unique,{
    maxGapHours,minFanHours:3,minClimateSamples:minSamplesPerDay,minDays:0
  });
  const summarizePeriod=period=>{
    const selected=daily.filter(day=>day.date>=period.start&&day.date<=period.end);
    const energyDays=energy.matchedDays.filter(day=>day.date>=period.start&&day.date<=period.end);
    const energyCoveredDays=energyDays.length;
    return {
      ...period,
      dayCount:selected.length,
      sampleCount:selected.reduce((sum,day)=>sum+day.sampleCount,0),
      medianIndoorHA:median(selected.map(day=>day.medianIndoorHA)),
      medianIncomingHA:median(selected.map(day=>day.medianIncomingHA)),
      medianDeltaHA:median(selected.map(day=>day.medianDeltaHA)),
      medianRH:median(selected.map(day=>day.medianRH)),
      medianTemperature:median(selected.map(day=>day.medianTemperature)),
      energyCoveredDays,
      estimatedFanKwh:energyCoveredDays>=minEnergyDays
        ?energyDays.reduce((sum,day)=>sum+day.estimatedKwh,0):null,
      fanHours:energyCoveredDays
        ?energyDays.reduce((sum,day)=>sum+day.fanHours,0):null
    };
  };
  const summaries=periods.map(summarizePeriod);
  const [previous,recent]=summaries;
  const enough=previous.dayCount>=minDaysPerWindow&&recent.dayCount>=minDaysPerWindow;
  const difference=key=>enough&&Number.isFinite(previous[key])&&Number.isFinite(recent[key])
    ?recent[key]-previous[key]:null;
  const comparison=enough?{
    indoorHA:difference('medianIndoorHA'),
    incomingHA:difference('medianIncomingHA'),
    deltaHA:difference('medianDeltaHA'),
    relativeHumidity:difference('medianRH'),
    temperature:difference('medianTemperature')
  }:null;

  const findings=[];
  if(enough&&comparison.indoorHA!=null){
    if(comparison.indoorHA>changeThreshold){
      findings.push({type:'observation',title:'Humidité absolue intérieure en hausse',
        text:'La médiane journalière équilibrée est plus élevée de '+comparison.indoorHA.toFixed(1)+' g/m³ sur la fenêtre récente.'});
    }else if(comparison.indoorHA<-changeThreshold){
      findings.push({type:'observation',title:'Humidité absolue intérieure en baisse',
        text:'La médiane journalière équilibrée est plus basse de '+Math.abs(comparison.indoorHA).toFixed(1)+' g/m³ sur la fenêtre récente.'});
    }else{
      findings.push({type:'observation',title:'Humidité absolue intérieure relativement stable',
        text:'La différence entre les deux fenêtres reste inférieure au seuil descriptif de '+changeThreshold+' g/m³.'});
    }
    if(comparison.incomingHA!=null){
      findings.push({type:'context',title:'Contexte de l’air entrant',
        text:'La médiane de l’humidité absolue entrante a varié de '+(comparison.incomingHA>0?'+':'')+comparison.incomingHA.toFixed(1)+' g/m³ entre les deux fenêtres.'});
    }
    if(comparison.deltaHA!=null){
      findings.push({type:'context',title:'Écart intérieur − air entrant',
        text:'Cet écart médian a varié de '+(comparison.deltaHA>0?'+':'')+comparison.deltaHA.toFixed(1)+' g/m³. Il décrit les conditions mesurées et ne démontre pas un effet causal de la ventilation.'});
    }
  }

  return {
    status:enough?'available':'insufficient-data',
    periods:summaries,comparison,findings,
    windowDays,minSamplesPerDay,minDaysPerWindow,minEnergyDays,maxGapHours,changeThreshold,
    duplicateTimestampCount,conflictingTimestampCount,
    limits:[
      'Les deux fenêtres couvrent chacune '+windowDays+' jours calendaires et sont ancrées sur la date du dernier relevé.',
      'Une journée est retenue si elle contient au moins '+minSamplesPerDay+' relevés complets et plausibles pour les capteurs intérieur et air entrant.',
      'Chaque journée reçoit le même poids : médiane des médianes journalières, sans pondération par le nombre de relevés.',
      'Il faut au moins '+minDaysPerWindow+' jours exploitables dans chacune des deux fenêtres ; sinon aucune comparaison n’est produite.',
      'L’énergie du ventilateur est une estimation par débit et courbe constructeur, affichée uniquement si au moins '+minEnergyDays+' jours disposent chacun de 3 h intégrées.',
      'Les variations concomitantes ne démontrent aucune causalité, aucun rendement énergétique ni aucune vitesse optimale.'
    ]
  };
}
