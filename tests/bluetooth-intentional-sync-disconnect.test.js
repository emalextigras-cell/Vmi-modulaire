import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const controller = await readFile(new URL('../js/modules/history-download-controller.js', import.meta.url), 'utf8');

test('la fin de synchronisation marque la déconnexion comme volontaire avant disconnect()', () => {
  assert.match(controller, /if \\(reachedCut && connected\\(\\)\\) disconnectIntentionally\\(\\);/);
  assert.match(source, /disconnectIntentionally: \\(\\) => \\{ intentionalDisconnect = true; if \\(dev && dev\\.gatt && dev\\.gatt\\.connected\\) dev\\.gatt\\.disconnect\\(\\); \\}/);
});

test('onDisconnect absorbe une déconnexion volontaire sans programmer de reconnexion', () => {
  const handler = source.slice(source.indexOf('function onDisconnect()'), source.indexOf('async function connectCharacteristics('));
  assert.match(handler, /const wasIntentional=intentionalDisconnect;/);
  assert.match(handler, /intentionalDisconnect=false;/);
  assert.match(handler, /if\\(wasIntentional\\)\\{setStatus\\('Synchronisation terminée\\. Bluetooth déconnecté\\.'\\);return\\}/);
  assert.ok(handler.indexOf('if(wasIntentional)') < handler.indexOf('setTimeout(reconnect,4000)'));
});

test('une reconnexion ne réinitialise pas la synchronisation automatique', () => {
  const connect = source.slice(source.indexOf('async function connectDevice('), source.indexOf('async function connectBLE('));
  assert.doesNotMatch(connect, /autoDone=false/);
  assert.match(connect, /setTimeout\\(autoHistory,3000\\)/);
});

test('un nouveau clic utilisateur autorise une nouvelle synchronisation initiale', () => {
  const connect = source.slice(source.indexOf('async function connectBLE('), source.indexOf('async function autoConnectAuthorizedDevice('));
  assert.match(connect, /autoDone=false/);
});
