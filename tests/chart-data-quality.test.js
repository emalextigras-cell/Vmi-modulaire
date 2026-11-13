import test from 'node:test';
import assert from 'node:assert/strict';
import { fillMissing, hasBlockedBetween } from '../js/modules/chart-renderer.js';

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
    { t: 60_000, v: null, blocked: true },
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
  assert.deepEqual(result.map(point => point.v), [10, null, 20]);
  assert.equal(result[1].blocked, true);
});

test('le moteur de tracé détecte une anomalie entre deux points valides', () => {\n  const points = [\n    { t: 0, v: 10, blocked: false },\n    { t: 60_000, v: null, blocked: true },\n    { t: 120_000, v: 20, blocked: false }\n  ];\n  assert.equal(hasBlockedBetween(points, 0, 120_000), true);\n  assert.equal(hasBlockedBetween(points, 0, 60_000), false);\n  assert.equal(hasBlockedBetween(points, 60_000, 120_000), false);\n});\n