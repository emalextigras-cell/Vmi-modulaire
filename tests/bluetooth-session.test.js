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
  assert.ok(source.includes('if(ev.target!==chT&&ev.target!==chC)return;'));
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
