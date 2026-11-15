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
