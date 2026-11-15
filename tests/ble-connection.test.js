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

import { readFile } from 'node:fs/promises';

test('la synchronisation automatique ne redémarre pas à chaque reconnexion', async () => {
  const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(source, /if\(reachedCut&&dev&&dev\.gatt&&dev\.gatt\.connected\)\{intentionalDisconnect=true;dev\.gatt\.disconnect\(\);\}/);
  assert.equal((source.match(/autoDone=false/g) || []).length, 1);
  assert.match(source, /shouldReconnectAfterDisconnect\(\{manualDisconnect,intentionalDisconnect:expected,hasDevice:!!dev\}\)/);
});
