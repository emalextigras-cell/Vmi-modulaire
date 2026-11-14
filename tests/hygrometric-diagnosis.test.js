import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHygrometricDiagnosis } from '../js/modules/analysis.js';

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

test('diagnostic identifies a sustained favourable drying potential with moderate confidence',()=>{
 const result=buildHygrometricDiagnosis(makeRows());
 assert.equal(result.status,'analysis-available');
 assert.equal(result.confidence,'modérée');
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
 assert.equal(result.confidence,'faible');
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
