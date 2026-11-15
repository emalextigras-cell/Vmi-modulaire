import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('une ancienne base non vérifiable ne valide pas la migration', async () => {
  const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(source, /if\(typeof indexedDB==='undefined'\|\|typeof indexedDB\.databases!=='function'\)return \{status:'unavailable'\}/);
  assert.match(source, /if\(old\.status==='unavailable'\)[\s\S]*?migrationCompleted=false/);
  assert.match(source, /if\(migrationPending&&migrationCompleted\)[\s\S]*?\['migrated',true\]/);
});

test('une migration interrompue est retentée même si un historique existe déjà', async () => {
  const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(source, /const migrationPending=migrated!==true/);
  assert.doesNotMatch(source, /const migrationPending=!migrated&&!hist\.length&&!live\.length/);
});

test('la reprise fusionne les relevés et ne remplace pas l’historique local', async () => {
  const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(source, /hist=mergeImportedHistory\(hist,oldHist\)/);
  assert.match(source, /live=mergeImportedHistory\(live,oldLive\)/);
  assert.match(source, /oldHist=old\.hist\.map\(fromOldRow\)\.filter\(Boolean\)/);
});
