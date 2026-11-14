import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRawVmiSpeed } from '../js/modules/analysis.js';

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
