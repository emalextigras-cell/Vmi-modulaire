import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPlausibleHumidity,
  isPlausibleTemperature,
  summarizeDataQuality,
  normalizeTemperatureRecord
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

test('analyseSpeedLevels ignore les humidités et températures aberrantes', async () => {
  const { analyzeSpeedLevels } = await import('../js/modules/analysis.js');
  const rows = [
    { vit: 1, sh: 50, st: 20, te: 10, he: 60 },
    { vit: 1, sh: 589.4, st: 20, te: 10, he: 60 },
    { vit: 1, sh: 50, st: 269.4, te: 10, he: 60 }
  ];
  const result = analyzeSpeedLevels(rows, 1, 55);
  assert.equal(result.sampleCount, 1);
  assert.equal(result.groups[0].n, 1);
});

test('les valeurs extrêmes compatibles avec un défaut de capteur sont rejetées', () => {
  // Les exports fournis restent entre 1,4 et 28,4 °C.
  // La plage élargie garde une marge pour l'air extérieur froid et chaud.
  assert.equal(isPlausibleTemperature(28.4), true);
  assert.equal(isPlausibleTemperature(0), true);
  assert.equal(isPlausibleTemperature(-15), true);
  assert.equal(isPlausibleTemperature(79), false);
  assert.equal(isPlausibleTemperature(-35), false);
});

test('un pic de température à 79 °C est compté comme anomalie', () => {
  const result = summarizeDataQuality([
    { st: 19.7, sh: 62 },
    { st: 79, sh: 62 },
    { st: 17.6, sh: 63 }
  ]);
  assert.equal(result.affectedRecords, 1);
  assert.deepEqual(result.fields.map(field => field.key), ['st']);
});


test('corrige les températures historiques stockées en dixièmes sans toucher aux autres champs', () => {
  const original = { st: 196, t1: 154, te: 252, sh: 62, h1: 73, he: 74, rpm: 1376 };
  const corrected = normalizeTemperatureRecord(original);
  assert.deepEqual([corrected.st, corrected.t1, corrected.te], [19.6, 15.4, 25.2]);
  assert.deepEqual([corrected.sh, corrected.h1, corrected.he, corrected.rpm], [62, 73, 74, 1376]);
  assert.deepEqual([original.st, original.t1, original.te], [196, 154, 252]);
});

test('ne modifie pas les températures déjà dans une plage plausible', () => {
  const original = { st: 19.6, t1: -5, te: 28.4 };
  assert.equal(normalizeTemperatureRecord(original), original);
});
