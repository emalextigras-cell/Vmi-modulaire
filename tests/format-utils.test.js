import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, localDateTimeValue } from '../js/modules/format-utils.js';

test('formatDuration affiche les minutes, heures et jours sans changer les arrondis', () => {
  assert.equal(formatDuration(29_000), '0 min');
  assert.equal(formatDuration(90_000), '2 min');
  assert.equal(formatDuration(3_660_000), '1 h 1 min');
  assert.equal(formatDuration(90_000_000), '1 j 1 h');
});

test('localDateTimeValue produit une date locale compatible avec input datetime-local', () => {
  const timestamp = new Date(2026, 10, 16, 8, 7, 59, 999).getTime();
  assert.equal(localDateTimeValue(timestamp), '2026-11-16T08:07');
});

test('localDateTimeValue utilise maintenant par défaut', () => {
  const before = Date.now();
  const value = localDateTimeValue();
  const after = Date.now();
  const parsed = new Date(value);
  assert.ok(Number.isFinite(parsed.getTime()));
  assert.ok(parsed.getTime() >= before - 60_000);
  assert.ok(parsed.getTime() <= after + 60_000);
});
