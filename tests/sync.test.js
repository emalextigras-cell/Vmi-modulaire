import test from 'node:test';
import assert from 'node:assert/strict';
import { armDownloadTimeout } from '../js/modules/sync.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('le délai expire une synchronisation active une seule fois', async () => {
  const download = { on: true, timeout: null };
  const calls = [];
  armDownloadTimeout(download, (...args) => calls.push(args), 8);
  await wait(25);
  assert.deepEqual(calls, [[false, true]]);
});

test('le délai ne termine pas une synchronisation déjà arrêtée', async () => {
  const download = { on: true, timeout: null };
  let calls = 0;
  armDownloadTimeout(download, () => calls++, 8);
  download.on = false;
  await wait(25);
  assert.equal(calls, 0);
});

test('réarmer le délai annule le précédent minuteur', async () => {
  const download = { on: true, timeout: null };
  const calls = [];
  armDownloadTimeout(download, (...args) => calls.push(args), 8);
  armDownloadTimeout(download, (...args) => calls.push(args), 20);
  await wait(35);
  assert.deepEqual(calls, [[false, true]]);
});
