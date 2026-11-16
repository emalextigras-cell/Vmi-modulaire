import test from 'node:test';
import assert from 'node:assert/strict';
import { runBleSessionSequence } from '../js/modules/bluetooth-session.js';

test('arrête la séquence dès que la session BLE change', async () => {
  let token = 1;
  const sent = [];
  const result = await runBleSessionSequence({
    token,
    getToken: () => token,
    isActive: () => true,
    steps: [
      async () => { sent.push('horloge'); token++; return true; },
      async () => { sent.push('historique'); return true; }
    ]
  });
  assert.equal(result, false);
  assert.deepEqual(sent, ['horloge']);
});

test('exécute toutes les étapes dans la même session', async () => {
  const sent = [];
  const result = await runBleSessionSequence({
    token: 7,
    getToken: () => 7,
    isActive: () => true,
    steps: [
      async () => { sent.push(1); return true; },
      async () => { sent.push(2); return true; }
    ]
  });
  assert.equal(result, true);
  assert.deepEqual(sent, [1, 2]);
});

test('arrête la séquence après un échec d’écriture', async () => {
  const sent = [];
  const result = await runBleSessionSequence({
    token: 7,
    getToken: () => 7,
    isActive: () => true,
    steps: [
      async () => { sent.push(1); return false; },
      async () => { sent.push(2); return true; }
    ]
  });
  assert.equal(result, false);
  assert.deepEqual(sent, [1]);
});
