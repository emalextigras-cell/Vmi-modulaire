import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeHygrometricPeriods } from '../js/modules/analysis.js';

const HOUR = 60 * 60 * 1000;
const dry = t => ({ t, st: 20, sh: 60, te: 10, he: 40 });
const humid = t => ({ t, st: 20, sh: 40, te: 20, he: 70 });
const neutral = t => ({ t, st: 20, sh: 50, te: 20, he: 50 });

test('mesure la durée estimée pendant laquelle l’air entrant est plus sec', () => {
  const result = analyzeHygrometricPeriods([dry(0), dry(HOUR), dry(2 * HOUR)]);
  assert.equal(result.sampleCount, 3);
  assert.equal(result.intervalCount, 2);
  assert.equal(result.observedDurationMs, 2 * HOUR);
  assert.equal(result.dryDurationMs, 2 * HOUR);
  assert.equal(result.humidDurationMs, 0);
  assert.equal(result.longestDryMs, 2 * HOUR);
  assert.ok(result.medianDelta > 1);
});

test('distingue les périodes où l’air entrant est plus humide', () => {
  const result = analyzeHygrometricPeriods([humid(0), humid(HOUR), humid(2 * HOUR)]);
  assert.equal(result.humidDurationMs, 2 * HOUR);
  assert.equal(result.dryDurationMs, 0);
  assert.equal(result.longestHumidMs, 2 * HOUR);
  assert.ok(result.medianDelta < -1);
});

test('classe les écarts faibles dans la zone neutre', () => {
  const result = analyzeHygrometricPeriods([neutral(0), neutral(HOUR)]);
  assert.equal(result.neutralDurationMs, HOUR);
  assert.equal(result.dryDurationMs, 0);
  assert.equal(result.humidDurationMs, 0);
});

test('ne comble pas un trou de mesure supérieur à deux heures', () => {
  const result = analyzeHygrometricPeriods([dry(0), dry(HOUR), dry(5 * HOUR), dry(6 * HOUR)]);
  assert.equal(result.gapCount, 1);
  assert.equal(result.observedDurationMs, 2 * HOUR);
  assert.equal(result.dryDurationMs, 2 * HOUR);
  assert.equal(result.longestDryMs, HOUR);
});

test('ignore les mesures invalides et ne modifie pas les relevés sources', () => {
  const rows = [dry(0), { ...dry(HOUR), sh: 150 }, dry(3 * HOUR)];
  const before = JSON.stringify(rows);
  const result = analyzeHygrometricPeriods(rows);
  assert.equal(result.sampleCount, 2);
  assert.equal(result.gapCount, 1);
  assert.equal(result.observedDurationMs, 0);
  assert.equal(JSON.stringify(rows), before);
});

test('renvoie un résultat exploitable avec moins de deux mesures', () => {
  const result = analyzeHygrometricPeriods([dry(0)]);
  assert.equal(result.sampleCount, 1);
  assert.equal(result.intervalCount, 0);
  assert.equal(result.medianDelta > 1, true);
  assert.equal(result.observedDurationMs, 0);
});
