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

import { summarizeFanEnergyByManualMode } from '../js/modules/energy-estimate.js';

test('attribue uniquement les intervalles dont les deux relevés ont le même mode manuel', () => {
  const rows = [
    { ...row(0, 50), vmiModeRaw: 1 },
    { ...row(1, 50), vmiModeRaw: 1 },
    { ...row(2, 125), vmiModeRaw: 2 },
    { ...row(3, 125), vmiModeRaw: 2 }
  ];
  const result = summarizeFanEnergyByManualMode(rows, { minDays: 1 });
  const mode1 = result.groups[0], mode2 = result.groups[1];
  assert.equal(mode1.intervalCount, 1);
  assert.equal(mode1.estimatedKwh, 0.004);
  assert.equal(mode2.intervalCount, 1);
  assert.equal(mode2.estimatedKwh, 0.01);
  assert.equal(result.transitionIntervalCount, 1);
});

test('pondère les journées équitablement dans la puissance moyenne par mode', () => {
  const day1 = new Date(2026, 0, 1, 8).getTime();
  const day2 = new Date(2026, 0, 2, 8).getTime();
  const rows = [
    { t: day1, debit: 50, vmiModeRaw: 1 },
    { t: day1 + HOUR, debit: 50, vmiModeRaw: 1 },
    { t: day1 + 2 * HOUR, debit: 50, vmiModeRaw: 1 },
    { t: day2, debit: 125, vmiModeRaw: 1 },
    { t: day2 + HOUR, debit: 125, vmiModeRaw: 1 }
  ];
  const result = summarizeFanEnergyByManualMode(rows);
  const mode1 = result.groups[0];
  assert.equal(mode1.dayCount, 2);
  assert.equal(mode1.medianDailyAveragePowerW, 7);
  assert.equal(mode1.status, 'comparable');
});

test('ne remplace jamais un niveau manuel absent par le code vitesse brut', () => {
  const rows = [
    { ...row(0, 50), vmiSpeedRaw: 1 },
    { ...row(1, 50), vmiSpeedRaw: 1 }
  ];
  const result = summarizeFanEnergyByManualMode(rows);
  assert.equal(result.hasManualModeData, false);
  assert.ok(result.groups.every(group => group.estimatedKwh === null));
});

test('exclut les grands trous et les débits hors plage dans la comparaison par mode', () => {
  const rows = [
    { ...row(0, 50), vmiModeRaw: 1 },
    { ...row(1, 50), vmiModeRaw: 1 },
    { ...row(5, 50), vmiModeRaw: 1 },
    { ...row(6, 400), vmiModeRaw: 1 }
  ];
  const result = summarizeFanEnergyByManualMode(rows);
  const mode1 = result.groups[0];
  assert.equal(mode1.intervalCount, 1);
  assert.equal(mode1.longGapCount, 1);
  assert.equal(mode1.invalidFlowIntervalCount, 1);
  assert.equal(mode1.coveragePercent, 16.666666666666664);
});
