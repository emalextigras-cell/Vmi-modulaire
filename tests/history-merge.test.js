import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeImportedHistory } from '../js/modules/history.js';

test('mergeImportedHistory trie les relevés par date', () => {
  const result = mergeImportedHistory([{ t: 30 }, { t: 10 }], [{ t: 20 }]);
  assert.deepEqual(result.map(row => row.t), [10, 20, 30]);
});

test('mergeImportedHistory remplace un relevé existant au même timestamp', () => {
  const existing = { t: 100, sh: 48 };
  const imported = { t: 100, sh: 52 };
  const result = mergeImportedHistory([existing], [imported]);
  assert.equal(result.length, 1);
  assert.equal(result[0], imported);
  assert.equal(result[0].sh, 52);
});

test('mergeImportedHistory ne modifie pas les tableaux sources', () => {
  const current = [{ t: 20 }];
  const imported = [{ t: 10 }];
  mergeImportedHistory(current, imported);
  assert.deepEqual(current.map(row => row.t), [20]);
  assert.deepEqual(imported.map(row => row.t), [10]);
});

test('mergeImportedHistory accepte des entrées absentes ou invalides', () => {
  assert.deepEqual(mergeImportedHistory(null, [{ t: 1 }]), [{ t: 1 }]);
  assert.deepEqual(mergeImportedHistory([{ t: 2 }], null), [{ t: 2 }]);
});
