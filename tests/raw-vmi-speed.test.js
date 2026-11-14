import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRawVmiSpeed, summarizeRawVmiMode } from '../js/modules/analysis.js';

test('summarizeRawVmiSpeed décrit le débit brut par code sans convertir les vitesses', () => {
  const result = summarizeRawVmiSpeed([
    { vmiSpeedRaw: 3, debit: 121, vit: null },
    { vmiSpeedRaw: 3, debit: 130, vit: null },
    { vmiSpeedRaw: 3, debit: 110, vit: null },
    { vmiSpeedRaw: 1, debit: 50, vit: null },
    { vmiSpeedRaw: 1, debit: null, vit: null },
    { vmiSpeedRaw: 5, debit: 193, vit: null },
    { vmiSpeedRaw: null, debit: 999, vit: null }
  ]);
  assert.deepEqual(result, [
    { code: 1, sampleCount: 1, medianDebit: 50, minDebit: 50, maxDebit: 50 },
    { code: 3, sampleCount: 3, medianDebit: 121, minDebit: 110, maxDebit: 130 },
    { code: 5, sampleCount: 1, medianDebit: 193, minDebit: 193, maxDebit: 193 }
  ]);
});

test('summarizeRawVmiSpeed conserve un code même sans valeur de débit', () => {
  assert.deepEqual(summarizeRawVmiSpeed([{ vmiSpeedRaw: 0, debit: null }]), [
    { code: 0, sampleCount: 0, medianDebit: null, minDebit: null, maxDebit: null }
  ]);
});

test('summarizeRawVmiSpeed ignore les valeurs non numériques', () => {
  assert.deepEqual(summarizeRawVmiSpeed([
    { vmiSpeedRaw: '3', debit: '121' },
    { vmiSpeedRaw: NaN, debit: 80 }
  ]), []);
});

test('summarizeRawVmiMode distingue le mode et calcule le renouvellement théorique', () => {
  const result = summarizeRawVmiMode([
    { vmiModeRaw: 1, vmiSpeedRaw: 3, debit: 120, volumeRaw: 300 },
    { vmiModeRaw: 1, vmiSpeedRaw: 4, debit: 150, volumeRaw: 300 },
    { vmiModeRaw: 2, vmiSpeedRaw: 3, debit: 180, volumeRaw: 300 },
    { vmiModeRaw: 3, vmiSpeedRaw: 5, debit: null, volumeRaw: 300 }
  ]);
  assert.deepEqual(result, [
    { mode: 1, sampleCount: 2, medianDebit: 135, minDebit: 120, maxDebit: 150, medianRenewalRate: 0.45 },
    { mode: 2, sampleCount: 1, medianDebit: 180, minDebit: 180, maxDebit: 180, medianRenewalRate: 0.6 },
    { mode: 3, sampleCount: 0, medianDebit: null, minDebit: null, maxDebit: null, medianRenewalRate: null }
  ]);
});
