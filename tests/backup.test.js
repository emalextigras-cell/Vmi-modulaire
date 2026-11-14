import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackupSnapshot, mergeBackupData } from '../js/modules/backup.js';

const MIN_VALID = new Date(2025, 0, 1).getTime();

test('createBackupSnapshot conserve le format JSON v13', () => {
  const snapshot = createBackupSnapshot({hist:[{t:MIN_VALID,sh:50}],live:[{t:MIN_VALID+1,sh:51}],meta:{lastSync:123},exportedAt:'2026-11-13T12:00:00.000Z'});
  assert.deepEqual(snapshot,{app:'vmi-purevent',version:1,exportedAt:'2026-11-13T12:00:00.000Z',hist:[{t:MIN_VALID,sh:50}],live:[{t:MIN_VALID+1,sh:51}],meta:{lastSync:123}});
});

test('mergeBackupData ajoute et enrichit sans perdre les champs existants', () => {
  const result=mergeBackupData({backup:{app:'vmi-purevent',hist:[{t:MIN_VALID,sh:99,st:null,te:16.4},{t:MIN_VALID+1,sh:52},{t:MIN_VALID-1,sh:30}]},currentHist:[{t:MIN_VALID,sh:48,st:19.2,te:null}],minValid:MIN_VALID});
  assert.equal(result.hist.length,2);
  assert.deepEqual(result.hist[0],{t:MIN_VALID,sh:99,st:19.2,te:16.4});
  assert.equal(result.hist[1].sh,52);
  assert.equal(result.addedHistory,1);
  assert.equal(result.enrichedHistory,1);
});

test('mergeBackupData fusionne les relevés directs sans doublons et limite à 10000', () => {
  const result=mergeBackupData({backup:{app:'vmi-purevent',hist:[],live:[{t:1,sh:99},{t:2,sh:41}]},currentLive:[{t:1,sh:40}],minValid:MIN_VALID});
  assert.deepEqual(result.live,[{t:1,sh:99},{t:2,sh:41}]);
  assert.equal(result.addedLive,1);
  const capped=mergeBackupData({backup:{app:'vmi-purevent',hist:[],live:Array.from({length:5},(_,i)=>({t:i+3}))},currentLive:[{t:1}],minValid:MIN_VALID,maxLive:3});
  assert.deepEqual(capped.live.map(r=>r.t),[5,6,7]);
});

test('mergeBackupData conserve la dernière synchronisation la plus récente', () => {
  const result=mergeBackupData({backup:{app:'vmi-purevent',hist:[],meta:{lastSync:200}},currentMeta:{lastSync:300,other:'kept'},minValid:MIN_VALID});
  assert.deepEqual(result.meta,{lastSync:300,other:'kept'});
});

test('mergeBackupData refuse une sauvegarde au mauvais format', () => {
  assert.throws(()=>mergeBackupData({backup:{app:'autre',hist:[]},minValid:MIN_VALID}),/non reconnu/);
  assert.throws(()=>mergeBackupData({backup:{app:'vmi-purevent',hist:{}},minValid:MIN_VALID}),/non reconnu/);
});

test('mergeBackupData laisse les relevés directs inchangés si le champ live est absent', () => {
  const currentLive=[{t:9,sh:49},{t:3,sh:51}];
  const result=mergeBackupData({backup:{app:'vmi-purevent',hist:[]},currentLive,minValid:MIN_VALID});
  assert.deepEqual(result.live,currentLive);
});

test('la sauvegarde conserve les champs historiques et les nouveaux champs bruts', () => {
  const row={t:MIN_VALID,rk:'09/04/2018 00:31:04',d:155,st:17.9,sh:61,t1:10.8,h1:88,te:10.7,he:89,rpm:1372,fil:141,vit:null,boost:null,hol:null,fixed:true,vmiSpeedRaw:3,debit:121};
  const snapshot=createBackupSnapshot({hist:[row],live:[],meta:{lastSync:123},exportedAt:'2026-11-13T05:11:52.511Z'});
  assert.equal(snapshot.version,1);
  assert.deepEqual(snapshot.hist[0],row);
  assert.deepEqual(Object.keys(snapshot),['app','version','exportedAt','hist','live','meta']);
});
