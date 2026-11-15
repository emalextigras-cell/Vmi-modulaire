import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeEnergyClimateContext } from '../js/modules/energy-meter.js';

const HOUR = 3600000;
const reading = (t, kwh) => ({ id: 'total:' + t, meterType: 'total', t, kwh });
const climate = (t, overrides = {}) => ({
  t, st: 20, sh: 60, te: 10, he: 40, tExt: 8, ...overrides
});

test('associe un intervalle électrique aux moyennes climatiques sur son recouvrement', () => {
  const result = summarizeEnergyClimateContext(
    [reading(1, 10), reading(6 * HOUR + 1, 11)],
    [climate(1), climate(2 * HOUR + 1), climate(4 * HOUR + 1), climate(6 * HOUR + 1)]
  );
  const interval = result.meters[0].intervals[0];
  assert.equal(interval.deltaKwh, 1);
  assert.equal(interval.averagePowerW, 1000 / 6);
  assert.equal(interval.context.ready, true);
  assert.equal(interval.context.coveragePercent, 100);
  assert.equal(interval.context.indoorTemp, 20);
  assert.ok(interval.context.deltaAbsHumidity > 0);
});

test('ne comble pas les trous de mesures supérieurs à deux heures', () => {
  const result = summarizeEnergyClimateContext(
    [reading(1, 10), reading(8 * HOUR + 1, 11)],
    [climate(1), climate(1 * HOUR + 1), climate(7 * HOUR + 1), climate(8 * HOUR + 1)]
  );
  const context = result.meters[0].intervals[0].context;
  assert.equal(context.coverageHours, 2);
  assert.equal(context.coveragePercent, 25);
  assert.equal(context.ready, false);
});

test('refuse de conclure si les mesures ne recouvrent pas l’intervalle du compteur', () => {
  const result = summarizeEnergyClimateContext(
    [reading(1, 10), reading(6 * HOUR + 1, 11)],
    [climate(7 * HOUR + 1), climate(8 * HOUR + 1)]
  );
  assert.equal(result.matchedIntervalCount, 0);
  assert.equal(result.meters[0].intervals[0].context.coverageHours, 0);
  assert.equal(result.meters[0].intervals[0].context.deltaAbsHumidity, null);
});

test('écarte les valeurs hygrométriques invalides sans les remplacer', () => {
  const result = summarizeEnergyClimateContext(
    [reading(1, 10), reading(6 * HOUR + 1, 11)],
    [climate(0, { sh: 150 }), climate(2 * HOUR + 1), climate(4 * HOUR + 1), climate(6 * HOUR + 1)]
  );
  const context = result.meters[0].intervals[0].context;
  assert.equal(context.ready, true);
  assert.equal(context.coverageHours, 4);
  assert.ok(context.coveragePercent < 100);
  assert.ok(context.metricCoverageHours.indoorTemp > 0);
});

test('sépare les compteurs et ignore les intervalles électriques non mesurés', () => {
  const result = summarizeEnergyClimateContext(
    [
      { id: 'vent:0', meterType: 'ventilation', t: 1, kwh: 5 },
      { id: 'vent:1', meterType: 'ventilation', t: 6 * HOUR, kwh: 6 },
      { id: 'pre:0', meterType: 'preheating', t: 1, kwh: 9 },
      { id: 'pre:1', meterType: 'preheating', t: 6 * HOUR, kwh: 2 }
    ],
    [climate(1), climate(2 * HOUR + 1), climate(4 * HOUR + 1), climate(6 * HOUR + 1)]
  );
  assert.deepEqual(result.meters.map(meter => meter.meterType), ['ventilation', 'preheating']);
  assert.equal(result.meters[0].intervals.length, 1);
  assert.equal(result.meters[1].intervals.length, 0);
});
