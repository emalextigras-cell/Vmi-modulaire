import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHygrometricDiagnosis, analyzeHygrometricPeriods } from '../js/modules/analysis.js';
import { absoluteHumidity } from '../js/modules/psychrometry.js';

function makeRows({days=3,perDay=10,indoorRH=65,incomingRH=40,indoorTemp=20,incomingTemp=10}={}) {
  const rows=[];
  for(let d=0;d<days;d++){
    for(let i=0;i<perDay;i++){
      rows.push({
        t:new Date(2026,10,10+d,7, i*30,0).getTime(),
        st:indoorTemp,sh:indoorRH,te:incomingTemp,he:incomingRH
      });
    }
  }
  return rows;
}


test('diagnostic exposes its thresholds and the measured basis of each finding',()=>{
 const result=buildHygrometricDiagnosis(makeRows());
 assert.deepEqual(result.methodology,{
  version:'hygrometric-diagnostic-v1',
  dryDeltaThreshold:1,
  trendDeltaThreshold:0.8,
  minimumSamples:12,
  minimumDistinctDays:2,
  minimumObservedHours:3,
  dominantDurationShare:0.6,
  maximumGapHours:2,
  hourlyBucketHours:6,
  hourlyMinimumSamples:5,
  hourlyMinimumDistinctDays:2
 });
 const finding=result.observations.find(x=>x.code==='air-drying-potential');
 assert.ok(finding);
 assert.equal(finding.basis.unit,'g/m³');
 assert.equal(finding.basis.threshold,1);
 assert.ok(finding.basis.medianIndoorMinusIncomingHA>1);
 assert.ok(finding.basis.durationShare>=finding.basis.requiredDurationShare);
});

test('diagnostic reports the actual custom thresholds used',()=>{
 const result=buildHygrometricDiagnosis(makeRows(),{
  dryDelta:1.5,trendDelta:1.1,minSamples:15,maxGapHours:1.5
 });
 assert.equal(result.methodology.dryDeltaThreshold,1.5);
 assert.equal(result.methodology.trendDeltaThreshold,1.1);
 assert.equal(result.methodology.minimumSamples,15);
 assert.equal(result.methodology.maximumGapHours,1.5);
 const finding=result.observations.find(x=>x.code==='air-drying-potential');
 assert.equal(finding.basis.threshold,1.5);
});

test('diagnostic identifies a sustained favourable drying potential with moderate confidence',()=>{
 const result=buildHygrometricDiagnosis(makeRows());
 assert.equal(result.status,'analysis-available');
 assert.equal(result.coverageLevel,'modérée');
 assert.equal(result.sampleCount,30);
 assert.equal(result.dayCount,3);
 assert.ok(result.dryShare>0.9);
 assert.ok(result.observations.some(x=>x.code==='air-drying-potential'));
 assert.ok(result.medianIndoorDewPoint>0);
 assert.ok(result.limits.some(x=>x.includes('température de paroi')));
});

test('diagnostic warns when incoming air is consistently wetter in absolute humidity',()=>{
 const result=buildHygrometricDiagnosis(makeRows({
  indoorRH:40,incomingRH:90,indoorTemp:20,incomingTemp:25
 }));
 assert.equal(result.status,'analysis-available');
 assert.ok(result.humidShare>0.9);
 assert.ok(result.observations.some(x=>x.code==='air-moisture-potential'));
});

test('diagnostic marks short histories as insufficient and does not invent conclusions',()=>{
 const result=buildHygrometricDiagnosis(makeRows({days:1,perDay:4}));
 assert.equal(result.status,'insufficient-data');
 assert.equal(result.coverageLevel,'faible');
 assert.ok(result.observations.some(x=>x.code==='coverage-limited'));
});

test('diagnostic deduplicates timestamps and ignores invalid sensor rows',()=>{
 const rows=makeRows({days:3,perDay:10});
 rows.push({...rows[0],sh:99});
 rows.push({...rows[1],t:rows[1].t+1,he:140});
 const result=buildHygrometricDiagnosis(rows);
 assert.equal(result.sampleCount,30);
});

test('diagnostic does not infer condensation risk or a best fan speed',()=>{
 const result=buildHygrometricDiagnosis(makeRows());
 assert.equal(result.bestSpeed,undefined);
 assert.ok(result.limits.some(x=>x.includes('aucun risque de condensation')));
 assert.ok(!result.observations.some(x=>/condensation|vitesse optimale/i.test(x.title)));
});

test('diagnostic quantifies sampling intervals and excludes long data gaps',()=>{
 const result=buildHygrometricDiagnosis(makeRows({days:3,perDay:10}));
 assert.equal(result.medianSampleIntervalMinutes,30);
 assert.equal(result.excludedGapCount,2);
 assert.ok(result.largestExcludedGapHours>2);
 assert.ok(result.coverageSpanHours>24);
 assert.equal(result.maxGapHours,2);
});

test('les durées sont découpées au franchissement des seuils hygrométriques',()=>{
 const base=absoluteHumidity(20,50);
 const rows=[3,-3].map((delta,index)=>({
  t:index*3600000,st:20,sh:50+delta*50/base,te:20,he:50
 }));
 const result=analyzeHygrometricPeriods(rows,{threshold:1,maxGapHours:2});
 assert.equal(result.observedDurationMs,3600000);
 assert.ok(Math.abs(result.dryDurationMs-1200000)<1);
 assert.ok(Math.abs(result.neutralDurationMs-1200000)<1);
 assert.ok(Math.abs(result.humidDurationMs-1200000)<1);
 assert.ok(Math.abs(result.dryDurationMs+result.neutralDurationMs+result.humidDurationMs-result.observedDurationMs)<1);
});


test('diagnostic quantifies missing, implausible and duplicate input rows',()=>{
 const rows=[
  {t:0,st:20,sh:55,te:12,he:60},
  {t:1,st:20,sh:55,te:12},
  {t:2,st:20,sh:150,te:12,he:60},
  {t:0,st:21,sh:56,te:13,he:61},
  {st:20,sh:55,te:12,he:60}
 ];
 const before=JSON.stringify(rows);
 const result=buildHygrometricDiagnosis(rows);
 assert.deepEqual(result.inputQuality,{
  inputSampleCount:5,
  acceptedSampleCount:1,
  missingTimestampCount:1,
  incompleteSensorRecordCount:1,
  implausibleSensorRecordCount:1,
  duplicateTimestampCount:1,
  excludedSampleCount:4
 });
 assert.equal(result.sampleCount,1);
 assert.equal(JSON.stringify(rows),before);
});

test('diagnostic reports empty input quality without inventing excluded rows',()=>{
 const result=buildHygrometricDiagnosis([]);
 assert.deepEqual(result.inputQuality,{
  inputSampleCount:0,
  acceptedSampleCount:0,
  missingTimestampCount:0,
  incompleteSensorRecordCount:0,
  implausibleSensorRecordCount:0,
  duplicateTimestampCount:0,
  excludedSampleCount:0
 });
});
