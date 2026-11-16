import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateHistoryRetention } from '../js/modules/history-freshness.js';

const DAY = 24 * 60 * 60 * 1000;

test('estime la rétention à partir du rythme des 14 derniers jours au maximum', () => {
  const start = Date.UTC(2026, 0, 1);
  const records = Array.from({ length: 140 }, (_, index) => ({ t: start + index * DAY / 10 }));
  const result = estimateHistoryRetention(records, { now: start + 15 * DAY, minValid: 0 });
  assert.equal(result.newest, records.at(-1).t);
  assert.equal(result.recentCount, 140);
  assert.ok(Math.abs(result.recordsPerDay - 140 / 13.9) < 1e-10);
  assert.equal(result.capacityDays, 60);
  assert.equal(result.deadline, result.newest + 60 * DAY);
});

test('respecte les bornes minimales et maximales de la capacité estimée', () => {
  const start = Date.UTC(2026, 0, 1);
  const sparse = estimateHistoryRetention([{ t: start }], { now: start, capacity: 800 });
  assert.equal(sparse.capacityDays, 60);
  const dense = Array.from({ length: 2000 }, (_, index) => ({ t: start + index * 1000 }));
  const saturated = estimateHistoryRetention(dense, { now: dense.at(-1).t });
  assert.equal(saturated.capacityDays, 7);
});

test('ignore les horodatages antérieurs au seuil et retourne null si aucun relevé ne reste', () => {
  const result = estimateHistoryRetention(
    [{ t: 99 }, { t: 100 }, { t: 200 }],
    { now: 300, minValid: 100, dayMs: 100 }
  );
  assert.equal(result.newest, 200);
  assert.equal(result.recentCount, 2);
  assert.equal(estimateHistoryRetention([{ t: 99 }], { minValid: 100 }), null);
});

test('ne modifie pas les relevés source', () => {
  const records = [{ t: 100 }, { t: 200 }];
  const before = structuredClone(records);
  estimateHistoryRetention(records, { now: 300, dayMs: 1 });
  assert.deepEqual(records, before);
});

test('calcule le retard et le nombre de jours restants à partir de maintenant', () => {
  const newest = Date.UTC(2026, 0, 1);
  const result = estimateHistoryRetention(
    [{ t: newest }],
    { now: newest + 10 * DAY }
  );
  assert.equal(result.ageDays, 10);
  assert.equal(result.daysRemaining, 50);
  assert.equal(result.deadline, newest + 60 * DAY);
});
