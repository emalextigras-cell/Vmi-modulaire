import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const controller = await readFile(new URL('../js/modules/history-download-controller.js', import.meta.url), 'utf8');

test('la fin de synchronisation marque la déconnexion comme volontaire avant disconnect()', () => {
  assert.ok(controller.includes('if (reachedCut && connected()) disconnectIntentionally();'));
  assert.ok(source.includes('disconnectIntentionally: () => { intentionalDisconnect = true; if (dev && dev.gatt && dev.gatt.connected) dev.gatt.disconnect(); }'));
});

test('onDisconnect absorbe une déconnexion volontaire sans programmer de reconnexion', () => {
  const handler = source.slice(source.indexOf('function onDisconnect()'), source.indexOf('async function connectCharacteristics('));
  assert.ok(handler.includes('const wasIntentional=intentionalDisconnect;'));
  assert.ok(handler.includes('intentionalDisconnect=false;'));
  assert.ok(handler.includes("if(wasIntentional){setStatus('Synchronisation terminée. Bluetooth déconnecté.');return}"));
  assert.ok(handler.indexOf('if(wasIntentional)') < handler.indexOf('setTimeout(reconnect,4000)'));
});

test('une reconnexion ne réinitialise pas la synchronisation automatique', () => {
  const connect = source.slice(source.indexOf('async function connectDevice('), source.indexOf('async function connectBLE('));
  assert.ok(!connect.includes('autoDone=false'));
  assert.ok(connect.includes('setTimeout(autoHistory,3000)'));
});

test('un nouveau clic utilisateur autorise une nouvelle synchronisation initiale', () => {
  const connect = source.slice(source.indexOf('async function connectBLE('), source.indexOf('async function autoConnectAuthorizedDevice('));
  assert.ok(connect.includes('autoDone=false'));
});
