import test from 'node:test';
import assert from 'node:assert/strict';
import { createBleWriteQueue } from '../js/modules/bluetooth-write-queue.js';

const immediate = async () => {};

test('sérialise les écritures et respecte leur ordre', async () => {
  const order = [];
  const characteristic = {
    properties: { write: true },
    async writeValueWithResponse(bytes) { order.push(bytes[0]); }
  };
  const queue = createBleWriteQueue({
    isConnected: () => true,
    getCharacteristic: () => characteristic,
    sleep: immediate
  });
  const results = await Promise.all([queue.write(new Uint8Array([1])), queue.write(new Uint8Array([2]))]);
  assert.deepEqual(results, [true, true]);
  assert.deepEqual(order, [1, 2]);
});

test('utilise write sans réponse uniquement si la caractéristique le permet', async () => {
  let called = false;
  const queue = createBleWriteQueue({
    isConnected: () => true,
    getCharacteristic: () => ({
      properties: { writeWithoutResponse: true },
      async writeValueWithoutResponse() { called = true; }
    }),
    sleep: immediate
  });
  assert.equal(await queue.write(new Uint8Array([1])), true);
  assert.equal(called, true);
});

test('refuse une écriture hors connexion sans appeler la caractéristique', async () => {
  let called = false;
  const queue = createBleWriteQueue({
    isConnected: () => false,
    getCharacteristic: () => ({ properties: { write: true }, async writeValueWithResponse() { called = true; } }),
    sleep: immediate
  });
  assert.equal(await queue.write(new Uint8Array([1])), false);
  assert.equal(called, false);
});

test('un échec ne bloque pas les écritures suivantes', async () => {
  let calls = 0;
  let errors = 0;
  const queue = createBleWriteQueue({
    isConnected: () => true,
    getCharacteristic: () => ({
      properties: { write: true },
      async writeValueWithResponse() { calls++; if (calls === 1) throw new Error('radio indisponible'); }
    }),
    sleep: immediate,
    onError: () => errors++
  });
  assert.equal(await queue.write(new Uint8Array([1])), false);
  assert.equal(await queue.write(new Uint8Array([2])), true);
  assert.equal(calls, 2);
  assert.equal(errors, 1);
});


test('annule les commandes en attente après un changement de session Bluetooth', async () => {
  let generation = 1;
  let releaseFirstWrite;
  let firstSleepStarted;
  const sleeping = new Promise(resolve => { firstSleepStarted = resolve; });
  const blockedSleep = () => new Promise(resolve => {
    releaseFirstWrite = resolve;
    firstSleepStarted();
  });
  const sent = [];
  const queue = createBleWriteQueue({
    isConnected: () => true,
    getConnectionToken: () => generation,
    getCharacteristic: () => ({
      properties: { write: true },
      async writeValueWithResponse(bytes) { sent.push(bytes[0]); }
    }),
    sleep: blockedSleep
  });

  const first = queue.write(new Uint8Array([1]));
  const second = queue.write(new Uint8Array([2]));
  await sleeping;
  generation++;
  releaseFirstWrite();

  assert.equal(await first, true);
  assert.equal(await second, false);
  assert.deepEqual(sent, [1]);
});
