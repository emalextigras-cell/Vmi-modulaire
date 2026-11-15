import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDiagnosisConfidence } from '../js/modules/diagnostic-confidence.js';

test('explique les critères quotidiens de robustesse sans les confondre avec l’état de la VMI', () => {
  const result = {
    coverageLevel: 'modérée',
    sampleCount: 48,
    dayCount: 6,
    observedHours: 18.5,
    confidenceBasis: {
      observedCoveragePercent: 32.4,
      acceptedSampleShare: 0.875,
      daysWithAtLeastThreeSamples: 4,
      minimumDailySamples: 3
    }
  };
  const text = formatDiagnosisConfidence(result, value => String(value));
  assert.match(text, /4 jour\(s\) avec au moins 3 relevé\(s\)/);
  assert.ok(text.includes('couverture temporelle 32.4 %'));
  assert.ok(text.includes('87.5 % des lignes retenues'));
  assert.ok(text.includes('pas l’état physique de la VMI'));
});

test('signale une couverture indisponible lorsque les données ne permettent pas son calcul', () => {
  const text = formatDiagnosisConfidence({
    coverageLevel: 'faible',
    sampleCount: 1,
    dayCount: 1,
    observedHours: 0,
    confidenceBasis: { observedCoveragePercent: null, acceptedSampleShare: 1 }
  });
  assert.ok(text.includes('couverture temporelle indisponible'));
  assert.match(text, /1 jour\(s) avec au moins 3 relevé\(s\)/);
});
