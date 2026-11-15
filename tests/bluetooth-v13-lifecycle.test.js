import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');

test('la fin du téléchargement reprend la déconnexion simple de V13', () => {
  const finish = source.slice(source.indexOf('function finishDownload('), source.indexOf('async function startDownload('));
  assert.match(finish, /if\(reachedCut&&dev&&dev\.gatt&&dev\.gatt\.connected\)\s*\{[\s\S]*?dev\.gatt\.disconnect\(\);/);
  assert.match(finish, /sync:request-disconnect/);
  assert.doesNotMatch(finish, /intentionalDisconnect/);
});

test('une déconnexion non manuelle relance la reconnexion standard après 4 secondes', () => {
  const handler = source.slice(source.indexOf('function onDisconnect()'), source.indexOf('async function connectCharacteristics('));
  assert.match(handler, /cleanupConnection\(\);[\s\S]*?setStatus\('Déconnecté\.'\);[\s\S]*?if\(!manualDisconnect&&dev\)[\s\S]*?setTimeout\(reconnect,4000\)/);
  assert.doesNotMatch(handler, /intentionalDisconnect|live-reconnect-scheduled|setTimeout\(reconnect,3000\)/);
});

test('la reconnexion reprend directement le cycle GATT de V13 sans relancer l’historique', () => {
  const reconnect = source.slice(source.indexOf('async function reconnect()'), source.indexOf("$('conn').onclick"));
  assert.match(reconnect, /const server=await dev\.gatt\.connect\(\)/);
  assert.match(reconnect, /await connectCharacteristics\(server\)/);
  assert.match(reconnect, /startPolling\(\)/);
  assert.match(reconnect, /setTimeout\(reconnect,7000\)/);
  assert.doesNotMatch(reconnect, /connectDevice\(dev\)|autoHistory/);
});

test('un nouveau clic utilisateur autorise une nouvelle synchronisation initiale', () => {
  const connect = source.slice(source.indexOf('async function connectBLE('), source.indexOf('async function autoConnectAuthorizedDevice('));
  assert.match(connect, /autoDone=false/);
});
