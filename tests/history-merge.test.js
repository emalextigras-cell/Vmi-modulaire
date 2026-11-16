import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeImportedHistory } from '../js/modules/history.js';

test('mergeImportedHistory trie les relevés par date', () => {
  const result = mergeImportedHistory([{ t: 30 }, { t: 10 }], [{ t: 20 }]);
  assert.deepEqual(result.map(row => row.t), [10, 20, 30]);
});

test('mergeImportedHistory complète un relevé existant sans perdre ses champs', () => {
  const existing = { t: 100, sh: 48, st: 19.2, te: null };
  const imported = { t: 100, sh: 52, st: null, te: 16.4 };
  const result = mergeImportedHistory([existing], [imported]);
  assert.deepEqual(result[0], { t: 100, sh: 52, st: 19.2, te: 16.4 });
});

test('mergeImportedHistory conserve les valeurs existantes si l’import ne les fournit pas', () => {
  const result = mergeImportedHistory([{ t: 100, sh: 48, st: 19.2 }], [{ t: 100, sh: null, st: undefined }]);
  assert.deepEqual(result[0], { t: 100, sh: 48, st: 19.2 });
});

test('mergeImportedHistory ne modifie pas les tableaux sources', () => {
  const current = [{ t: 20 }], imported = [{ t: 10 }];
  mergeImportedHistory(current, imported);
  assert.deepEqual(current.map(row => row.t), [20]);
  assert.deepEqual(imported.map(row => row.t), [10]);
});

test('mergeImportedHistory accepte des entrées absentes ou invalides', () => {
  assert.deepEqual(mergeImportedHistory(null, [{ t: 1 }]), [{ t: 1 }]);
  assert.deepEqual(mergeImportedHistory([{ t: 2 }], null), [{ t: 2 }]);
});
