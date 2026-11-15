import test from 'node:test';
import assert from 'node:assert/strict';
import { fromOldRow, wallUtcToLocal } from '../js/modules/legacy-migration.js';

test('wallUtcToLocal conserve l’heure murale historique de la VMI', () => {
  const source = new Date(Date.UTC(2026, 10, 10, 16, 55, 30)).getTime();
  const converted = new Date(wallUtcToLocal(source));
  assert.equal(converted.getFullYear(), 2026);
  assert.equal(converted.getMonth(), 10);
  assert.equal(converted.getDate(), 10);
  assert.equal(converted.getHours(), 16);
  assert.equal(converted.getMinutes(), 55);
  assert.equal(converted.getSeconds(), 30);
});

test('wallUtcToLocal refuse les horodatages non finis ou hors plage Date', () => {
  for (const timestamp of [undefined, null, NaN, Infinity, -Infinity, '123', 8.64e15 + 1]) {
    assert.equal(wallUtcToLocal(timestamp), null);
  }
});

test('fromOldRow convertit une ligne historique complète sans inventer une vitesse', () => {
  const timestamp = new Date(Date.UTC(2026, 10, 10, 16, 55, 30)).getTime();
  const row = [timestamp, 19.7, 62, 17.7, 73, 17.6, 74, 1376, 90];
  const record = fromOldRow(row);
  assert.equal(record.t, wallUtcToLocal(timestamp));
  assert.equal(record.st, 19.7);
  assert.equal(record.sh, 62);
  assert.equal(record.t1, 17.7);
  assert.equal(record.h1, 73);
  assert.equal(record.te, 17.6);
  assert.equal(record.he, 74);
  assert.equal(record.rpm, 1376);
  assert.equal(record.fil, 90);
  assert.equal(record.vit, null);
});

test('fromOldRow ignore les lignes absentes, mal formées ou à date invalide', () => {
  assert.equal(fromOldRow(null), null);
  assert.equal(fromOldRow(undefined), null);
  assert.equal(fromOldRow({ 0: 123 }), null);
  assert.equal(fromOldRow([]), null);
  assert.equal(fromOldRow([NaN, 19.7, 62]), null);
  assert.equal(fromOldRow([Infinity, 19.7, 62]), null);
});
