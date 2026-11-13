import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPlausibleHumidity,
  isPlausibleTemperature,
  summarizeDataQuality
} from '../js/modules/data-quality.js';

test('les humidités hors de 0 à 100 % sont signalées', () => {
  assert.equal(isPlausibleHumidity(58), true);
  assert.equal(isPlausibleHumidity(589.4), false);
  assert.equal(isPlausibleHumidity(-1), false);
  assert.equal(isPlausibleHumidity(null), true);
});

test('les températures hors des bornes de capteur sont signalées', () => {
  assert.equal(isPlausibleTemperature(20), true);
  assert.equal(isPlausibleTemperature(269.4), false);
  assert.equal(isPlausibleTemperature(-45), false);
  assert.equal(isPlausibleTemperature(null), true);
});

test('le bilan compte les relevés anormaux sans modifier les données', () => {
  const rows = [
    { sh: 55, st: 20, he: 60, te: 12 },
    { sh: 589.4, st: 269.4, he: 50, te: 10 },
    { sh: 48, st: 19, he: 52, te: 11 }
  ];
  const before = JSON.stringify(rows);
  const result = summarizeDataQuality(rows);
  assert.equal(result.total, 3);
  assert.equal(result.affectedRecords, 1);
  assert.equal(result.hasAnomalies, true);
  assert.deepEqual(result.fields.map(field => field.key), ['sh', 'st']);
  assert.equal(JSON.stringify(rows), before);
});

test('aucune anomalie pour un historique sans valeur aberrante', () => {
  const result = summarizeDataQuality([{ sh: 55, st: 20, he: 60, te: 12 }]);
  assert.equal(result.hasAnomalies, false);
  assert.equal(result.affectedRecords, 0);
  assert.deepEqual(result.fields, []);
});
