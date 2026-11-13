import test from 'node:test';
import assert from 'node:assert/strict';
import { fillMissing } from '../js/modules/chart-renderer.js';

test('une absence isolée ordinaire reste interpolable', () => {
  const points = [
    { t: 0, v: 10 },
    { t: 60_000, v: null },
    { t: 120_000, v: 20 }
  ];
  const result = fillMissing(points);
  assert.equal(result.length, 3);
  assert.equal(result[1].v, 15);
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
    { t: 120_000, v: 20, blocked: false }
  ]);
});

test('une mesure aberrante au milieu de plusieurs absences bloque toute interpolation', () => {
  const points = [
    { t: 0, v: 10 },
    { t: 60_000, v: null },
    { t: 120_000, v: null, blocked: true },
    { t: 180_000, v: null },
    { t: 240_000, v: 20 }
  ];
  const result = fillMissing(points);
  assert.deepEqual(result.map(point => point.v), [10, 20]);
});
