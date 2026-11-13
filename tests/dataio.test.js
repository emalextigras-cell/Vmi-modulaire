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

test('recFrom conserve la valeur brute de la colonne Vitesse sans inventer une correspondance manuelle', () => {
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
  assert.equal(record.vit, null);
  assert.equal(record.vmiSpeedRaw, 3);
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

import { analyzeSpeedLevels } from '../js/modules/analysis.js';

test('analyzeSpeedLevels compare les vitesses manuelles identifiées et ignore les valeurs brutes VMI+', () => {
  const data = [
    { vit: 1, sh: 48, st: 20, te: 15, he: 60 },
    { vit: 1, sh: 52, st: 20, te: 15, he: 60 },
    { vit: 2, sh: 55, st: 20, te: 15, he: 60 },
    { vit: 2, sh: 57, st: 20, te: 15, he: 60 },
    { vit: 3, sh: 65, st: 20, te: 15, he: 60 },
    { vit: null, vmiSpeedRaw: 3, sh: 40, st: 20, te: 15, he: 60 }
  ];
  const result = analyzeSpeedLevels(data, 2, 55);
  assert.equal(result.sampleCount, 5);
  assert.equal(result.status, 'best-found');
  assert.equal(result.bestSpeed, 1);
  assert.deepEqual(result.groups.map(g => g.n), [2, 2, 1]);
});

test('analyzeSpeedLevels signale un échantillon insuffisant', () => {
  const result = analyzeSpeedLevels([{ vit: 1, sh: 50, st: 20 }], 5, 50);
  assert.equal(result.status, 'insufficient');
});
