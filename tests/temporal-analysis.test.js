import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeDailyTrends, analyzeHourlyPatterns, detectRapidChanges } from '../js/modules/analysis.js';

const day = (n,h=12) => new Date(2026,10,n,h,0,0).getTime();
const row = (t,st=20,sh=60,te=10,he=40) => ({t,st,sh,te,he});

test('regroupe les relevés par jour civil local et calcule les médianes',()=>{
 const result=summarizeDailyTrends([row(day(10),20,50),row(day(10,13),22,60),row(day(11),21,70)]);
 assert.equal(result.days.length,2);
 assert.equal(result.days[0].sampleCount,2);
 assert.equal(result.days[0].medianRH,55);
 assert.equal(result.latest.date,'2026-11-11');
 assert.equal(result.changeRH,15);
});

test('ignore les journées avec moins de trois relevés pour les comparaisons',()=>{
 const result=summarizeDailyTrends([row(day(10)),row(day(11)),row(day(11,13)),row(day(11,14))]);
 assert.equal(result.sampledDays,1);
 assert.equal(result.previous,null);
 assert.equal(result.changeRH,null);
});

test('construit quatre profils horaires et exige un minimum de mesures',()=>{
 const result=analyzeHourlyPatterns([
  row(day(10,1),20,50),row(day(10,2),20,52),row(day(10,3),20,54),
  row(day(10,7),20,60),row(day(10,8),20,62),row(day(10,9),20,64)
 ]);
 assert.equal(result.buckets.length,4);
 assert.equal(result.buckets[0].sampleCount,3);
 assert.equal(result.buckets[0].medianRH,52);
 assert.equal(result.buckets[1].medianRH,62);
 assert.equal(result.buckets[2].medianRH,null);
});

test('détecte une variation rapide de HR et humidité absolue',()=>{
 const events=detectRapidChanges([row(day(10),20,40),row(day(10,1),20,65)]);
 assert.equal(events.length,1);
 assert.ok(events[0].reasons.includes('relative-humidity'));
 assert.equal(events[0].deltaRH,25);
});

test('ne signale pas les variations faibles ni les trous de plus de deux heures',()=>{
 const events=detectRapidChanges([row(day(10),20,50),row(day(10,1),20,52),row(day(10,5),20,85)]);
 assert.equal(events.length,0);
});

test('les mesures invalides et les horodatages identiques ne créent pas d’anomalies',()=>{
 const events=detectRapidChanges([row(day(10),20,50),row(day(10),20,90),row(day(10,1),20,150)]);
 assert.equal(events.length,0);
});
