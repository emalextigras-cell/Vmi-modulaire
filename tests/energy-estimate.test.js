import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateFanPowerFromFlow, summarizeFanEnergyEstimate } from '../js/modules/energy-estimate.js';

const HOUR = 3600000;
const row = (hours, debit) => ({ t: hours * HOUR, debit });

test('interpole les points constructeur sans extrapoler', () => {
  assert.equal(estimateFanPowerFromFlow(50), 4);
  assert.equal(estimateFanPowerFromFlow(125), 10);
  assert.equal(estimateFanPowerFromFlow(87.5), 7);
  assert.equal(estimateFanPowerFromFlow(49), null);
  assert.equal(estimateFanPowerFromFlow(351), null);
  assert.equal(estimateFanPowerFromFlow(null), null);
});

test('intègre la puissance estimée sur un intervalle valide', () => {
  const result = summarizeFanEnergyEstimate([row(0, 50), row(1, 125)]);
  assert.equal(result.status, 'estimated');
  assert.equal(result.coveredHours, 1);
  assert.equal(result.coveragePercent, 100);
  assert.equal(result.estimatedWh, 7);
  assert.equal(result.averagePowerW, 7);
});

test('exclut les trous de plus de deux heures sans extrapoler', () => {
  const result = summarizeFanEnergyEstimate([row(0, 50), row(1, 50), row(5, 125)]);
  assert.equal(result.acceptedIntervalCount, 1);
  assert.equal(result.longGapCount, 1);
  assert.equal(result.coveredHours, 1);
  assert.equal(result.coveragePercent, 20);
  assert.equal(result.estimatedWh, 4);
});

test('exclut les débits hors plage constructeur', () => {
  const result = summarizeFanEnergyEstimate([row(0, 40), row(1, 125)]);
  assert.equal(result.status, 'insufficient-data');
  assert.equal(result.invalidFlowIntervalCount, 1);
  assert.equal(result.estimatedKwh, null);
});

test('retourne une estimation vide avec un seul relevé', () => {
  const result = summarizeFanEnergyEstimate([row(0, 100)]);
  assert.equal(result.status, 'insufficient-data');
  assert.equal(result.sampleCount, 1);
  assert.equal(result.estimatedWh, null);
});

test('remplace les doublons d’horodatage par le dernier relevé', () => {
  const result = summarizeFanEnergyEstimate([row(0, 50), row(0, 125), row(1, 125)]);
  assert.equal(result.sampleCount, 2);
  assert.equal(result.estimatedWh, 10);
});
