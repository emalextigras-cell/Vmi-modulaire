import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');

test('les écritures BLE sont sérialisées dans une file unique', () => {
  const start = source.indexOf('function writeFrame(bytes)');
  const end = source.indexOf('const send=', start);
  assert.ok(start >= 0 && end > start, 'writeFrame doit être présent');
  const writeFrame = source.slice(start, end);
  assert.match(writeFrame, /commandQueue\.then\(async\(\)=>/);
  assert.match(writeFrame, /if\(!connected\(\)\)throw new Error/);
  assert.match(writeFrame, /commandQueue=result\.then\(\(\)=>\{\},\(\)=>\{\}\)/);
});

test('un échec d’écriture BLE est signalé et ne bloque pas la file suivante', () => {
  const start = source.indexOf('function writeFrame(bytes)');
  const end = source.indexOf('const send=', start);
  const writeFrame = source.slice(start, end);
  assert.match(writeFrame, /const result=task\.catch\(e=>/);
  assert.match(writeFrame, /showError\('Échec de l’envoi Bluetooth/);
  assert.match(writeFrame, /return false/);
  assert.match(writeFrame, /commandQueue=result\.then\(\(\)=>\{\},\(\)=>\{\}\)/);
});

test('la commande distingue écriture acceptée et état confirmé par notification', () => {
  const start = source.indexOf("document.querySelectorAll('[data-r]')");
  const end = source.indexOf('const setCommandsDisabled', start);
  const handler = source.slice(start, end);
  assert.match(handler, /Commande envoyée, vérification de l’état/);
  assert.match(handler, /lastSeen\.state\|\|0\)>t0/);
  assert.match(handler, /cur\[key\]===expected/);
  assert.match(handler, /aucune réponse de la VMI : l’état n’a pas pu être vérifié/);
});

test('une commande manuelle est bloquée pendant une autre commande ou un téléchargement', () => {
  const start = source.indexOf("document.querySelectorAll('[data-r]')");
  const end = source.indexOf('const setCommandsDisabled', start);
  const handler = source.slice(start, end);
  assert.match(handler, /if\(manualCommandPending\|\|download\.on\)return/);
  assert.match(handler, /manualCommandPending=true/);
  assert.match(handler, /manualCommandPending=false/);
});
