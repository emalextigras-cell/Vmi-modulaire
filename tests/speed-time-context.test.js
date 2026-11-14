import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSpeedTimeContext } from '../js/modules/analysis.js';

function sample(day, hour, speed, index=0) {
  return {
    t:new Date(2026,10,1+day,hour,index*5,0).getTime(),
    vit:speed, st:20, sh:60-speed, te:12, he:55, rpm:1100+speed*100
  };
}

test('compare les niveaux manuels dans une même tranche horaire sur plusieurs jours',()=>{
  const rows=[];
  for(const day of [0,1]){
    for(const speed of [1,2,3]){
      for(let i=0;i<3;i++) rows.push(sample(day,8,speed,i));
    }
  }
  const result=analyzeSpeedTimeContext(rows,{minSamples:5,minDays:2});
  assert.deepEqual(result.comparableBuckets,[1]);
  const ready=result.groups.filter(g=>g.bucket===1&&g.ready);
  assert.equal(ready.length,3);
  assert.ok(ready.every(g=>g.sampleCount===6&&g.dayCount===2));
  assert.ok(ready.every(g=>Number.isFinite(g.medianRH)&&Number.isFinite(g.medianIndoorHA)));
  assert.equal(ready[0].medianRPM,1200);
});

test('ne transforme pas les codes vitesse bruts en niveaux manuels',()=>{
  const rows=[sample(0,8,0),sample(1,8,4),sample(2,8,5)];
  const result=analyzeSpeedTimeContext(rows,{minSamples:1,minDays:1});
  assert.deepEqual(result.comparableBuckets,[]);
  assert.ok(result.groups.every(g=>g.sampleCount===0&&!g.ready));
});

test('refuse une comparaison lorsque les niveaux ont deux jours chacun mais aucun jour commun',()=>{
  const rows=[];
  for(let i=0;i<6;i++)rows.push(sample(0,8,1,i),sample(1,8,1,i));
  for(let i=0;i<6;i++)rows.push(sample(2,8,2,i),sample(3,8,2,i));
  const result=analyzeSpeedTimeContext(rows,{minSamples:5,minDays:2});
  assert.deepEqual(result.comparableBuckets,[]);
  assert.ok(result.groups.filter(g=>g.bucket===1).every(g=>!g.ready&&g.sharedDays===0));
});

test('affiche le nombre de jours communs entre niveaux réellement comparables',()=>{
  const rows=[];
  for(const day of [0,1,2]){
    for(const speed of [1,2])for(let i=0;i<3;i++)rows.push(sample(day,8,speed,i));
  }
  const result=analyzeSpeedTimeContext(rows,{minSamples:5,minDays:2});
  const ready=result.groups.filter(g=>g.bucket===1&&g.ready);
  assert.equal(ready.length,2);
  assert.ok(ready.every(g=>g.sharedDays===3));
});
