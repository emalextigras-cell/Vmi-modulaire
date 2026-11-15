import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnectionGate, shouldReconnectAfterDisconnect } from '../js/modules/ble-connection.js';

test('une déconnexion volontaire de fin de synchronisation ne relance pas la reconnexion', () => {
  assert.equal(shouldReconnectAfterDisconnect({
    manualDisconnect: false,
    intentionalDisconnect: true,
    hasDevice: true
  }), false);
});

test('une perte de liaison inattendue conserve la reconnexion automatique', () => {
  assert.equal(shouldReconnectAfterDisconnect({
    manualDisconnect: false,
    intentionalDisconnect: false,
    hasDevice: true
  }), true);
});

test('une déconnexion manuelle ou sans appareil ne déclenche pas de reconnexion', () => {
  assert.equal(shouldReconnectAfterDisconnect({
    manualDisconnect: true,
    intentionalDisconnect: false,
    hasDevice: true
  }), false);
  assert.equal(shouldReconnectAfterDisconnect({
    manualDisconnect: false,
    intentionalDisconnect: false,
    hasDevice: false
  }), false);
});

test('les demandes simultanées partagent une seule tentative de connexion', async () => {
  const run = createConnectionGate();
  let calls = 0;
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const task = async () => { calls++; await wait; return 'connected'; };
  const first = run(task);
  const second = run(task);
  await Promise.resolve();
  assert.equal(calls, 1);
  release();
  assert.deepEqual(await Promise.all([first, second]), ['connected', 'connected']);
  assert.equal(calls, 1);
});
