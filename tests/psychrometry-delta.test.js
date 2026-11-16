import test from 'node:test';
import assert from 'node:assert/strict';
import { absoluteHumidity, absoluteHumidityDelta } from '../js/modules/psychrometry.js';

test('écart positif : air entrant plus sec que le salon',()=>{
  const record={st:20,sh:60,te:10,he:50};
  const expected=absoluteHumidity(record.st,record.sh)-absoluteHumidity(record.te,record.he);
  assert.ok(absoluteHumidityDelta(record)>0);
  assert.ok(Math.abs(absoluteHumidityDelta(record)-expected)<1e-10);
});

test('écart négatif : air entrant plus humide que le salon',()=>{
  assert.ok(absoluteHumidityDelta({st:10,sh:50,te:20,he:60})<0);
});

test('écart nul : conditions hygrométriques identiques',()=>{
  assert.equal(absoluteHumidityDelta({st:20,sh:50,te:20,he:50}),0);
});

test('données manquantes ou invalides : aucun écart inventé',()=>{
  assert.equal(absoluteHumidityDelta(null),null);
  assert.equal(absoluteHumidityDelta({st:20,sh:50,te:20,he:null}),null);
  assert.equal(absoluteHumidityDelta({st:20,sh:120,te:10,he:50}),null);
});
