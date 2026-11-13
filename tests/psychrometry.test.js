import test from 'node:test';
import assert from 'node:assert/strict';
import {
  saturationVaporPressure,
  absoluteHumidity,
  dewPoint,
  psychro,
  validTemp
} from '../js/modules/psychrometry.js';

test('saturationVaporPressure augmente avec la température', () => {
  assert.ok(saturationVaporPressure(20) > saturationVaporPressure(10));
});

test('absoluteHumidity donne une valeur cohérente à 20 °C et 50 %', () => {
  const value = absoluteHumidity(20, 50);
  assert.ok(Math.abs(value - 8.62) < 0.03);
});

test('absoluteHumidity calcule correctement un relevé réel VMI+ (17,7 °C, 73 %)', () => {
  const value = absoluteHumidity(17.7, 73);
  assert.ok(Math.abs(value - 10.99) < 0.02);
});

test('absoluteHumidity refuse les mesures hors limites', () => {
  assert.equal(absoluteHumidity(NaN, 50), null);
  assert.equal(absoluteHumidity(20, 101), null);
  assert.equal(absoluteHumidity(20, -1), null);
  assert.equal(absoluteHumidity(80, 50), null);
});

test('dewPoint donne une valeur cohérente à 20 °C et 50 %', () => {
  const value = dewPoint(20, 50);
  assert.ok(Math.abs(value - 9.26) < 0.03);
});

test('dewPoint refuse une humidité nulle ou invalide', () => {
  assert.equal(dewPoint(20, 0), null);
  assert.equal(dewPoint(20, 101), null);
  assert.equal(dewPoint(NaN, 50), null);
});

test('psychro calcule les valeurs intérieure et extérieure', () => {
  const result = psychro({ st: 20, sh: 50, te: 15, he: 70 });
  assert.ok(Math.abs(result.haIn - 8.6214) < 0.01);
  assert.ok(Math.abs(result.haOut - 8.9581) < 0.01);
  assert.ok(Math.abs(result.dewIn - 9.2552) < 0.01);
  assert.ok(Math.abs(result.dewOut - 9.5693) < 0.01);
});

test('psychro conserve des valeurs nulles quand les mesures manquent', () => {
  const result = psychro({ st: null, sh: null, te: 15, he: 70 });
  assert.equal(result.haIn, null);
  assert.equal(result.dewIn, null);
  assert.ok(Number.isFinite(result.haOut));
  assert.ok(Number.isFinite(result.dewOut));
});

test('validTemp applique les bornes prévues', () => {
  assert.equal(validTemp(20), true);
  assert.equal(validTemp(-40), false);
  assert.equal(validTemp(80), false);
  assert.equal(validTemp(NaN), false);
});
