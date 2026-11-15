import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');

test('une seule tentative de connexion GATT peut être active', () => {
  assert.match(source, /let manualDisconnect=false,intentionalDisconnect=false,connectionPromise=null/);
  assert.match(source, /if\(connectionPromise\)return connectionPromise/);
  assert.match(source, /finally\{connectionPromise=null\}/);
});

test('une déconnexion volontaire ne déclenche pas de reconnexion automatique', () => {
  assert.match(source, /const expected=intentionalDisconnect;[\s\S]*?intentionalDisconnect=false/);
  assert.match(source, /if\(!expected&&!manualDisconnect&&dev\)/);
  assert.match(source, /manualDisconnect=true;intentionalDisconnect=true;clearTimeout\(reconnectTimer\)/);
});

test('la coupure volontaire à la fin du téléchargement est identifiée', () => {
  assert.match(source, /if\(reachedCut&&dev&&dev\.gatt&&dev\.gatt\.connected\)\{intentionalDisconnect=true;dev\.gatt\.disconnect\(\);\}/);
});

test('la reconnexion ne relance pas le téléchargement automatique à chaque connexion', () => {
  assert.match(source, /if\(!autoDone\)setTimeout\(autoHistory,3000\)/);
  assert.doesNotMatch(source, /startPolling\(\);\s*autoDone=false/);
});

test('un échec de connexion nettoie les références avant une nouvelle tentative', () => {
  assert.match(source, /catch\(e\)\{\s*cleanupConnection\(\);[\s\S]*?intentionalDisconnect=true;[\s\S]*?throw e;/);
});
