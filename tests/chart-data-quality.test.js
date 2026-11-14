import test from 'node:test';
import assert from 'node:assert/strict';
import { fillMissing, hasBlockedBetween } from '../js/modules/chart-renderer.js';

test('une absence reste vide et ne fabrique pas une mesure', () => {
  const points = [
    { t: 0, v: 10 },
    { t: 60_000, v: null },
    { t: 120_000, v: 20 }
  ];
  const result = fillMissing(points);
  assert.deepEqual(result.map(point => point.v), [10, null, 20]);
  assert.equal(result[1].blocked, true);
});

test('une mesure rejetée comme aberrante reste un trou dans la courbe', () => {
  const points = [
    { t: 0, v: 10 },
    { t: 60_000, v: null, blocked: true },
    { t: 120_000, v: 20 }
  ];
  const result = fillMissing(points);
  assert.deepEqual(result, [
    { t: 0, v: 10, blocked: false },
    { t: 60_000, v: null, blocked: true },
    { t: 120_000, v: 20, blocked: false }
  ]);
});

test('une absence et une anomalie restent chacune à leur position exacte', () => {
  const points = [
    { t: 0, v: 10 },
    { t: 60_000, v: null },
    { t: 120_000, v: null, blocked: true },
    { t: 180_000, v: null },
    { t: 240_000, v: 20 }
  ];
  const result = fillMissing(points);
  assert.deepEqual(result.map(point => point.v), [10, null, null, null, 20]);
  assert.equal(result[2].blocked, true);
});

test('le moteur de tracé détecte une anomalie entre deux points valides', () => {
  const points = [
    { t: 0, v: 10, blocked: false },
    { t: 60_000, v: null, blocked: true },
    { t: 120_000, v: 20, blocked: false }
  ];
  assert.equal(hasBlockedBetween(points, 0, 120_000), true);
  assert.equal(hasBlockedBetween(points, 0, 60_000), false);
  assert.equal(hasBlockedBetween(points, 60_000, 120_000), false);
});
