import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSpeedLevels } from '../js/modules/analysis.js';

const day = (n, vit, sh = 60) => ({
  t: new Date(2026, 10, 1 + n, 10, 0, 0).getTime(),
  vit, st: 20, sh, te: 10, he: 40, rpm: 1200 + vit * 100
});

test('compte les jours couverts et les jours communs entre niveaux manuels', () => {
  const rows = [
    day(0, 1), day(1, 1),
    day(1, 2), day(2, 2),
    day(3, 3)
  ];
  const result = analyzeSpeedLevels(rows, 1);
  assert.equal(result.status, 'comparison-ready');
  assert.equal(result.groups[0].daysCovered, 2);
  assert.equal(result.groups[1].daysCovered, 2);
  assert.equal(result.groups[2].daysCovered, 1);
  assert.equal(result.groups[0].sharedDays, 1);
  assert.equal(result.groups[1].sharedDays, 1);
  assert.equal(result.groups[2].sharedDays, 0);
  assert.equal(result.bestSpeed, null);
});

test('ne compte pas les codes vitesse bruts hors niveaux manuels 1 à 3', () => {
  const result = analyzeSpeedLevels([day(0, 0), day(1, 4), day(2, 5)], 1);
  assert.equal(result.status, 'no-speed-data');
  assert.equal(result.sampleCount, 0);
  assert.ok(result.groups.every(group => group.daysCovered === 0 && group.sharedDays === 0));
});
