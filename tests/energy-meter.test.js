import test from 'node:test';
import assert from 'node:assert/strict';
import { upsertEnergyReading, summarizeEnergyReadings } from '../js/modules/energy-meter.js';

const HOUR = 60 * 60 * 1000;
const reading = (meterType, t, kwh, id = meterType + ':' + t) => ({ id, meterType, t, kwh });

test('calcule les kWh et la puissance moyenne entre deux index du même compteur', () => {
  const result = summarizeEnergyReadings([
    reading('ventilation', 0 + 1, 10),
    reading('ventilation', HOUR + 1, 10.25)
  ]);
  const meter = result.meters[0];
  assert.equal(meter.meterType, 'ventilation');
  assert.equal(meter.totalKwh, 0.25);
  assert.equal(meter.intervals[0].averagePowerW, 250);
  assert.equal(meter.intervals[0].status, 'measured');
});

test('ne mélange jamais ventilation, préchauffage et compteur global', () => {
  const result = summarizeEnergyReadings([
    reading('ventilation', 1, 10), reading('ventilation', HOUR + 1, 11),
    reading('preheating', 1, 100), reading('preheating', HOUR + 1, 102),
    reading('total', 1, 500), reading('total', HOUR + 1, 503)
  ]);
  assert.deepEqual(result.meters.map(meter => meter.meterType), ['ventilation', 'preheating', 'total']);
  assert.deepEqual(result.meters.map(meter => meter.totalKwh), [1, 2, 3]);
});

test('signale une baisse d’index sans calculer de consommation négative', () => {
  const result = summarizeEnergyReadings([
    reading('total', 1, 20), reading('total', HOUR + 1, 2),
    reading('total', 2 * HOUR + 1, 2.5)
  ]);
  const meter = result.meters[0];
  assert.equal(meter.intervals[0].status, 'counter-decreased');
  assert.equal(meter.intervals[0].deltaKwh, null);
  assert.equal(meter.intervals[1].deltaKwh, 0.5);
  assert.equal(meter.totalKwh, 0.5);
});

test('ne calcule rien avec un seul relevé ou des données invalides', () => {
  const result = summarizeEnergyReadings([
    reading('total', 1, 12),
    reading('unknown', 2, 13),
    reading('total', 3, -1)
  ]);
  assert.equal(result.readingCount, 1);
  assert.equal(result.meters[0].intervals.length, 0);
});

test('un index au même instant et pour le même compteur corrige le relevé existant', () => {
  const first = reading('ventilation', 100, 8);
  const next = upsertEnergyReading([first], reading('ventilation', 100, 8.4, 'corrected'));
  assert.equal(next.length, 1);
  assert.equal(next[0].kwh, 8.4);
  assert.equal(next[0].id, 'corrected');
});

test('refuse un index négatif, une date invalide ou un type inconnu', () => {
  assert.throws(() => upsertEnergyReading([], reading('total', 1, -1)), /Relevé invalide/);
  assert.throws(() => upsertEnergyReading([], reading('total', NaN, 1)), /Relevé invalide/);
  assert.throws(() => upsertEnergyReading([], reading('other', 1, 1)), /Relevé invalide/);
});
