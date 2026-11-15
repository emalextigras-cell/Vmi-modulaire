import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeWeeklyDiagnostic } from '../js/modules/weekly-diagnostic.js';

const HOUR=3600000;
const firstDay=new Date(2026,0,1,0,0,0).getTime();
const makeDay=(index,indoorRH=50,incomingRH=40,{missingIncoming=false,count=4}={})=>
  Array.from({length:count},(_,sample)=>({
    t:firstDay+index*24*HOUR+sample*HOUR,
    debit:125,st:20,sh:indoorRH,
    te:10,he:missingIncoming?null:incomingRH
  }));

test('compare deux fenêtres calendaires avec médianes journalières équilibrées',()=>{
  const history=[
    ...Array.from({length:7},(_,day)=>makeDay(day,50,40)).flat(),
    ...Array.from({length:7},(_,day)=>makeDay(day+7,60,40)).flat()
  ];
  const result=summarizeWeeklyDiagnostic(history);
  assert.equal(result.status,'available');
  assert.equal(result.periods[0].dayCount,7);
  assert.equal(result.periods[1].dayCount,7);
  assert.ok(result.comparison.indoorHA>0.8);
  assert.equal(result.periods[0].energyCoveredDays,7);
  assert.equal(result.periods[1].energyCoveredDays,7);
  assert.ok(Math.abs(result.periods[0].estimatedFanKwh-0.21)<1e-9);
});

test('ne compare pas les fenêtres si une seule ne contient pas assez de jours',()=>{
  const history=[
    ...[0,1,2].map(day=>makeDay(day).flat()).flat(),
    ...[10,11].map(day=>makeDay(day).flat()).flat()
  ];
  const result=summarizeWeeklyDiagnostic(history);
  assert.equal(result.status,'insufficient-data');
  assert.equal(result.periods[0].dayCount,3);
  assert.equal(result.periods[1].dayCount,2);
  assert.equal(result.comparison,null);
});

test('exclut les jours sans mesures valides de l’air entrant',()=>{
  const history=[
    ...Array.from({length:7},(_,day)=>makeDay(day,50,40)).flat(),
    ...Array.from({length:7},(_,day)=>makeDay(day+7,60,40,{missingIncoming:true})).flat()
  ];
  const result=summarizeWeeklyDiagnostic(history);
  assert.equal(result.status,'insufficient-data');
  assert.equal(result.periods[1].dayCount,0);
  assert.equal(result.periods[1].medianIncomingHA,null);
});

test('les relevés anciens hors des deux fenêtres ne sont pas mélangés aux semaines récentes',()=>{
  const old={t:new Date(2018,3,12,12).getTime(),debit:125,st:20,sh:90,te:10,he:90};
  const recent=[
    ...Array.from({length:7},(_,day)=>makeDay(day,50,40)).flat(),
    ...Array.from({length:7},(_,day)=>makeDay(day+7,55,40)).flat()
  ];
  const result=summarizeWeeklyDiagnostic([old,...recent]);
  assert.equal(result.status,'available');
  assert.equal(result.periods[0].dayCount,7);
  assert.equal(result.periods[1].dayCount,7);
  assert.equal(result.periods[0].start,'2026-01-01');
  assert.equal(result.periods[1].end,'2026-01-14');
});

test('chaque journée a le même poids même si le nombre de relevés varie fortement',()=>{
  const buildDay=(index,rh,count,stepMinutes)=>Array.from({length:count},(_,sample)=>({
    t:firstDay+index*24*HOUR+sample*stepMinutes*60000,
    debit:125,st:20,sh:rh,te:10,he:40
  }));
  const previous=[
    ...Array.from({length:6},(_,day)=>buildDay(day,40,3,60)).flat(),
    ...buildDay(6,90,100,10)
  ];
  const recent=Array.from({length:7},(_,day)=>buildDay(day+7,40,3,60)).flat();
  const result=summarizeWeeklyDiagnostic([...previous,...recent]);
  assert.equal(result.status,'available');
  assert.equal(result.periods[0].medianRH,40);
  assert.equal(result.periods[1].medianRH,40);
  assert.equal(result.comparison.relativeHumidity,0);
});

test('accepte exactement le minimum de trois relevés complets par journée',()=>{
  const history=[
    ...Array.from({length:7},(_,day)=>makeDay(day,50,40,{count:3})).flat(),
    ...Array.from({length:7},(_,day)=>makeDay(day+7,52,40,{count:3})).flat()
  ];
  const result=summarizeWeeklyDiagnostic(history);
  assert.equal(result.status,'available');
  assert.equal(result.periods[0].dayCount,7);
  assert.equal(result.periods[1].dayCount,7);
  assert.equal(result.periods[0].sampleCount,21);
  assert.equal(result.periods[1].sampleCount,21);
});

test('trie les relevés et écarte l’horodatage contradictoire',()=>{
  const days=[
    ...Array.from({length:7},(_,day)=>makeDay(day,50,40,{count:4})).flat(),
    ...Array.from({length:7},(_,day)=>makeDay(day+7,50,40,{count:4})).flat()
  ];
  const duplicate={...days[0],sh:95};
  const shuffled=[...days].reverse();
  shuffled.splice(2,0,duplicate);
  const result=summarizeWeeklyDiagnostic(shuffled);
  assert.equal(result.status,'available');
  assert.equal(result.duplicateTimestampCount,1);
  assert.equal(result.conflictingTimestampCount,1);
  assert.equal(result.periods[0].sampleCount,27);
  assert.equal(result.periods[0].dayCount,7);
});

test('refuse les paramètres de fenêtre et de couverture invalides',()=>{
  const invalidOptions=[
    {windowDays:0},
    {windowDays:1.5},
    {minSamplesPerDay:0},
    {minDaysPerWindow:0},
    {minEnergyDays:0},
    {maxGapHours:0},
    {maxGapHours:Infinity},
    {changeThreshold:-0.1},
    {changeThreshold:NaN},
    {minDaysPerWindow:8},
    {minEnergyDays:8}
  ];
  for(const options of invalidOptions){
    assert.throws(
      ()=>summarizeWeeklyDiagnostic([],options),
      RangeError,
      JSON.stringify(options)
    );
  }
});

test('accepte un seuil descriptif nul et des paramètres valides',()=>{
  const history=[
    ...Array.from({length:7},(_,day)=>makeDay(day,50,40)).flat(),
    ...Array.from({length:7},(_,day)=>makeDay(day+7,50,40)).flat()
  ];
  const result=summarizeWeeklyDiagnostic(history,{changeThreshold:0});
  assert.equal(result.status,'available');
  assert.equal(result.comparison.indoorHA,0);
  assert.ok(result.findings.some(item=>item.title==='Humidité absolue intérieure relativement stable'));
});


test('écarte les horodatages dupliqués contradictoires sans dépendre de l’ordre des lignes',()=>{
  const days=[
    ...Array.from({length:7},(_,day)=>makeDay(day,50,40,{count:4})).flat(),
    ...Array.from({length:7},(_,day)=>makeDay(day+7,50,40,{count:4})).flat()
  ];
  const duplicate={...days[0],sh:95};
  const first=summarizeWeeklyDiagnostic([...days,duplicate]);
  const second=summarizeWeeklyDiagnostic([duplicate,...days].reverse());
  for(const result of [first,second]){
    assert.equal(result.status,'available');
    assert.equal(result.duplicateTimestampCount,1);
    assert.equal(result.conflictingTimestampCount,1);
    assert.equal(result.periods[0].sampleCount,27);
    assert.equal(result.periods[0].dayCount,7);
    assert.ok(result.periods[0].medianRH<60);
  }
  assert.equal(first.periods[0].medianRH,second.periods[0].medianRH);
  assert.equal(first.periods[0].medianIndoorHA,second.periods[0].medianIndoorHA);
});

test('compte les doublons strictement identiques sans gonfler le nombre de relevés',()=>{
  const days=[
    ...Array.from({length:7},(_,day)=>makeDay(day,50,40,{count:3})).flat(),
    ...Array.from({length:7},(_,day)=>makeDay(day+7,52,40,{count:3})).flat()
  ];
  const result=summarizeWeeklyDiagnostic([...days,{...days[0]}]);
  assert.equal(result.status,'available');
  assert.equal(result.duplicateTimestampCount,1);
  assert.equal(result.conflictingTimestampCount,0);
  assert.equal(result.periods[0].sampleCount,21);
});


test('ancre les fenêtres sur le dernier horodatage reçu même si ce relevé est conflictuel',()=>{
  const days=[
    ...Array.from({length:14},(_,day)=>makeDay(day,50,40,{count:3})).flat()
  ];
  const latestRow=makeDay(14,50,40,{count:3})[0];
  const latestConflict={...latestRow,sh:95};
  const result=summarizeWeeklyDiagnostic([...days,latestRow,latestConflict]);
  assert.equal(result.status,'available');
  assert.equal(result.duplicateTimestampCount,1);
  assert.equal(result.conflictingTimestampCount,1);
  assert.equal(result.periods[0].start,'2026-01-02');
  assert.equal(result.periods[0].end,'2026-01-08');
  assert.equal(result.periods[1].start,'2026-01-09');
  assert.equal(result.periods[1].end,'2026-01-15');
  assert.equal(result.periods[1].dayCount,6);
});
