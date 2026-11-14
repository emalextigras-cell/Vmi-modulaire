import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSpeedLevels, analyzeSpeedTimeContext } from '../js/modules/analysis.js';
import { absoluteHumidity } from '../js/modules/psychrometry.js';

function makeSpeedRows(speed, days, {
  hour=7,
  count=3,
  indoorRH=60,
  incomingRH=40,
  indoorTemp=20,
  incomingTemp=10
}={}) {
  const rows=[];
  for(const day of days){
    const config=typeof day==='number'?{day}:day;
    const sampleCount=config.count??count;
    for(let i=0;i<sampleCount;i++){
      rows.push({
        t:new Date(2026,10,10+config.day,hour,i*10,0).getTime(),
        vmiModeRaw:speed,
        st:indoorTemp,
        sh:config.indoorRH??indoorRH,
        te:incomingTemp,
        he:config.incomingRH??incomingRH,
        rpm:1000+speed
      });
    }
  }
  return rows;
}

test('speed comparison recalculates medians on exactly the shared dates',()=>{
  const rows=[
    ...makeSpeedRows(1,[0,1],{incomingRH:40}),
    ...makeSpeedRows(1,[{day:2,incomingRH:5}]),
    ...makeSpeedRows(2,[0,1],{incomingRH:50})
  ];
  const result=analyzeSpeedTimeContext(rows,{minSamples:5,minDays:2});
  const comparison=result.comparisons.find(item=>item.bucket===1&&item.speeds.join('-')==='1-2');
  assert.ok(comparison);
  assert.equal(comparison.ready,true);
  assert.equal(comparison.sharedDayCount,2);
  assert.equal(comparison.sampleCountFirst,6);
  assert.equal(comparison.sampleCountSecond,6);
  const expectedFirst=absoluteHumidity(20,60)-absoluteHumidity(10,40);
  const expectedSecond=absoluteHumidity(20,60)-absoluteHumidity(10,50);
  assert.ok(Math.abs(comparison.first.medianDeltaHA-expectedFirst)<0.001);
  assert.ok(Math.abs(comparison.second.medianDeltaHA-expectedSecond)<0.001);
  assert.ok(Math.abs(comparison.first.medianIncomingHA-absoluteHumidity(10,40))<0.001);
});

test('speed comparison rejects overlap spread across different mode pairs',()=>{
  const rows=[
    ...makeSpeedRows(1,[0,1]),
    ...makeSpeedRows(2,[0,2]),
    ...makeSpeedRows(3,[1,2])
  ];
  const result=analyzeSpeedTimeContext(rows,{minSamples:5,minDays:2});
  assert.equal(result.comparableBuckets.length,0);
  assert.ok(result.comparisons.every(item=>!item.ready));
  assert.ok(result.comparisons.filter(item=>item.sharedDayCount>0).every(item=>item.sharedDayCount===1));
});

test('speed comparison requires the same six-hour bucket',()=>{
  const rows=[
    ...makeSpeedRows(1,[0,1],{hour:7}),
    ...makeSpeedRows(2,[0,1],{hour:13})
  ];
  const result=analyzeSpeedTimeContext(rows,{minSamples:5,minDays:2});
  assert.equal(result.comparableBuckets.length,0);
  assert.ok(result.comparisons.every(item=>item.sharedDayCount===0));
});

test('raw VMI+ speed codes are never treated as manual mode levels',()=>{
  const rows=[
    ...makeSpeedRows(1,[0,1]).map(row=>({...row,vmiModeRaw:undefined,vmiSpeedRaw:1})),
    ...makeSpeedRows(2,[0,1]).map(row=>({...row,vmiModeRaw:undefined,vmiSpeedRaw:2}))
  ];
  const result=analyzeSpeedTimeContext(rows,{minSamples:5,minDays:2});
  assert.equal(result.comparableBuckets.length,0);
  assert.ok(result.comparisons.every(item=>item.sharedDayCount===0));
});

test('overall speed summary reports the maximum overlap with one other mode, not a union',()=>{
  const rows=[
    ...makeSpeedRows(1,[0,1]),
    ...makeSpeedRows(2,[0,2]),
    ...makeSpeedRows(3,[1,2])
  ];
  const result=analyzeSpeedLevels(rows,1);
  assert.equal(result.groups.find(group=>group.v===1).sharedDays,1);
  assert.equal(result.groups.find(group=>group.v===2).sharedDays,1);
  assert.equal(result.groups.find(group=>group.v===3).sharedDays,1);
});


test('les jours ont le même poids même si les nombres de relevés diffèrent fortement',()=>{
  const rows=[
    ...makeSpeedRows(1,[{day:0,count:9,indoorRH:60},{day:1,count:1,indoorRH:80}]),
    ...makeSpeedRows(2,[{day:0,count:1,indoorRH:60},{day:1,count:9,indoorRH:60}])
  ];
  const result=analyzeSpeedTimeContext(rows,{minSamples:5,minDays:2});
  const comparison=result.comparisons.find(item=>item.bucket===1&&item.speeds.join('-')==='1-2');
  assert.equal(comparison.ready,true);
  assert.equal(comparison.sampleCountFirst,10);
  assert.equal(comparison.sampleCountSecond,10);
  const expectedFirst=(absoluteHumidity(20,60)+absoluteHumidity(20,80))/2;
  const expectedSecond=absoluteHumidity(20,60);
  assert.ok(Math.abs(comparison.first.medianIndoorHA-expectedFirst)<0.001);
  assert.ok(Math.abs(comparison.second.medianIndoorHA-expectedSecond)<0.001);
  assert.equal(comparison.first.dayCount,2);
  assert.ok(Number.isFinite(comparison.medianIncomingHADifference));
  assert.ok(Number.isFinite(comparison.medianDeltaHADifference));
});
