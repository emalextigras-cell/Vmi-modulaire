import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');

test('le diagnostic GATT journalise un instantané sans identifiant Bluetooth', () => {
  const helper = source.slice(source.indexOf('function logGattState('), source.indexOf('function onDisconnect()'));
  for (const field of ['transport=', 'chC=', 'chT=', 'download=', 'intentional=', 'manual=', 'autoDone=', 'polling=']) {
    assert.ok(helper.includes(field), 'état manquant : ' + field);
  }
  assert.doesNotMatch(helper, /dev\.id|device\.id|address/i);
});

test('la déconnexion est journalisée avant le nettoyage et la consommation du drapeau', () => {
  const handler = source.slice(source.indexOf('function onDisconnect()'), source.indexOf('async function connectCharacteristics('));
  assert.ok(handler.indexOf("logGattState('event:gattserverdisconnected')") < handler.indexOf('intentionalDisconnect=false;'));
  assert.ok(handler.indexOf("logGattState('event:gattserverdisconnected')") < handler.indexOf('cleanupConnection()'));
});

test('les étapes de découverte et notifications GATT distinguent succès et échec', () => {
  const discovery = source.slice(source.indexOf('async function connectCharacteristics('), source.indexOf('function preferredBluetoothDeviceId('));
  for (const stage of [
    'discovery:service-command:ok',
    'discovery:service-command:failed',
    'discovery:characteristic-command:ok',
    'discovery:service-telemetry:ok',
    'discovery:service-telemetry:failed',
    'discovery:characteristic-telemetry:ok',
    'notifications:telemetry:started',
    'notifications:command:started',
    'notifications:command:failed'
  ]) assert.ok(discovery.includes(stage), 'étape non journalisée : ' + stage);
});

test('la coupure volontaire est journalisée après le drapeau et avant disconnect()', () => {
  const finish = source.slice(source.indexOf('function finishDownload('), source.indexOf('async function startDownload('));
  assert.match(finish, /intentionalDisconnect=true;\s*logGattState\('sync:request-intentional-disconnect'\);\s*dev\.gatt\.disconnect\(\)/);
  assert.ok(finish.includes('sync:cut-reached-but-transport-already-disconnected'));
});

test('chaque tentative de reconnexion journalise son résultat sans changer sa stratégie', () => {
  const reconnect = source.slice(source.indexOf('async function reconnect()'), source.indexOf("$('conn').onclick"));
  assert.match(reconnect, /reconnect:attempt/);
  assert.match(reconnect, /reconnect:success/);
  assert.match(reconnect, /reconnect:failed/);
  assert.match(reconnect, /setTimeout\(reconnect,7000\)/);
});
