import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

test('les scrutations et notifications sont liées à leur session BLE', async () => {
  const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.ok(source.includes('pollingSessionToken===token'));
  assert.ok(source.includes('token!==bleConnectionGeneration||!connected()||download.on'));
  assert.ok(source.includes('if(!sessionIsCurrent(token,device)||!connected())return;'));
  assert.ok(source.includes('if(ev.target!==characteristicT&&ev.target!==characteristicC)return;'));
  assert.ok(source.includes('if(sessionIsCurrent(token,device)&&connected())autoHistory()'));
  assert.ok(source.includes('const commandIsCurrent=()=>sessionIsCurrent(commandToken,commandDevice)&&connected()'));
  assert.ok(source.includes('if(!commandIsCurrent()){result.textContent=\'Connexion interrompue : l’état de la commande n’a pas pu être vérifié.\';return}'));
  assert.ok(source.includes('if(pollingSessionToken===token||!connected()||download.on'));
  assert.ok(source.includes('manualCommandPending=false;\n document.querySelectorAll(\'[data-r]\').forEach(control=>control.disabled=download.on)'));
  assert.ok(source.includes('if(commandToken===bleConnectionGeneration){manualCommandPending=false;controls.forEach(x=>x.disabled=download.on)}'));
  assert.ok(source.includes('removeEventListener(\'characteristicvaluechanged\',bleNotificationHandler)'));
  assert.ok(source.includes('if(connectionRequestPending)return;'));
  assert.ok(source.includes('const intent=++connectionIntentGeneration;'));
  assert.ok(source.includes('if(intent!==connectionIntentGeneration||connectionRequestPending)return;'));
  assert.ok(source.includes('if(intent===connectionIntentGeneration){\n   connectionRequestPending=false;'));
});

test('installe les écouteurs de notification avant d’activer les notifications BLE', async () => {
  const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function connectCharacteristics(');
  const end = source.indexOf('\nfunction preferredBluetoothDeviceId()', start);
  assert.ok(start >= 0 && end > start);
  const connection = source.slice(start, end);
  assert.ok(connection.indexOf("addEventListener('characteristicvaluechanged'") < connection.indexOf('await characteristicT.startNotifications()'));
  assert.ok(connection.indexOf("addEventListener('characteristicvaluechanged'") < connection.indexOf('await characteristicC.startNotifications()'));
});


test('une reconnexion automatique en attente ne démarre pas pendant le sélecteur manuel', async () => {
  const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function reconnect()');
  const end = source.indexOf("$('conn').onclick=connectBLE", start);
  const reconnect = source.slice(start, end);
  assert.match(reconnect, /if\(manualDisconnect\|\|!dev\|\|connectionRequestPending\)return/);
});


test('une reconnexion déjà engagée est invalidée par une nouvelle intention utilisateur', async () => {
  const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const connect = source.slice(source.indexOf('async function connectDevice('), source.indexOf('async function connectBLE('));
  assert.match(connect, /async function connectDevice\(device,intent=connectionIntentGeneration\)/);
  assert.match(connect, /intent===connectionIntentGeneration/);
  assert.match(connect, /if\(!connectionIsCurrent\(\)\)\{if\(sessionIsCurrent\(token,device\)\)cleanupConnection\(\);return false\}/);
  const reconnectStart = source.indexOf('async function reconnect()');
  const reconnectEnd = source.indexOf("$('conn').onclick=connectBLE", reconnectStart);
  const reconnect = source.slice(reconnectStart, reconnectEnd);
  assert.match(reconnect, /const intent=connectionIntentGeneration/);
  assert.match(reconnect, /connectDevice\(dev,intent\)/);
});
