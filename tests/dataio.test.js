import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCell, recFrom } from '../js/modules/dataio.js';

test('parseCell lit une date CSV VMI+ au format français', () => {
  const parsed = parseCell('10/11/2026 16:45:35', null);
  assert.ok(parsed);
  assert.equal(parsed.rk, '10/11/2026 16:45:35');
  const date = new Date(parsed.t);
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 10);
  assert.equal(date.getDate(), 10);
});

test('recFrom conserve la vitesse de la colonne Vitesse (index 22)', () => {
  const row = Array(124).fill('');
  row[0] = '10/11/2026 16:45:35';
  row[11] = '186';
  row[20] = '90';
  row[22] = '3';
  row[25] = '1376';
  row[40] = '17,7';
  row[41] = '73';
  row[43] = '17,6';
  row[44] = '74';
  row[117] = '19,7';
  row[118] = '62,0';

  const record = recFrom(row, null);
  assert.ok(record);
  assert.equal(record.vit, 3);
  assert.equal(record.rpm, 1376);
  assert.equal(record.st, 19.7);
  assert.equal(record.sh, 62);
  assert.equal(record.te, 17.6);
  assert.equal(record.he, 74);
});

test('recFrom laisse la vitesse inconnue si la colonne est vide', () => {
  const row = Array(124).fill('');
  row[0] = '10/11/2026 16:45:35';
  row[117] = '19,7';
  row[118] = '62,0';
  const record = recFrom(row, null);
  assert.ok(record);
  assert.equal(record.vit, null);
});
