import test from 'node:test';
import assert from 'node:assert/strict';
import { getColumnMapping, recFrom } from '../js/modules/dataio.js';
import { calendarSeason, analyzeSeasonalVentilation } from '../js/modules/seasonal-advice.js';

test('importe et conserve la colonne Saison du CSV VMI+ sans la confondre avec Mode', () => {
  const headers = ['Date', 'Mode', 'Saison', 'Vitesse', 'Debit'];
  const values = ['10/11/2026 16:45:35', '2', '1', '5', '151'];
  const row = recFrom(values, null, getColumnMapping(headers));
  assert.ok(row);
  assert.equal(row.vmiModeRaw, 2);
  assert.equal(row.seasonRaw, 1);
  assert.equal(row.vmiSpeedRaw, 5);
  assert.equal(row.debit, 151);
});

test('classe les saisons à partir de la date locale', () => {
  assert.equal(calendarSeason(new Date(2026, 6, 15).getTime()), 'été');
  assert.equal(calendarSeason(new Date(2026, 0, 15).getTime()), 'hiver');
  assert.equal(calendarSeason(new Date(2026, 3, 15).getTime()), 'intersaison');
  assert.equal(calendarSeason(NaN), null);
});

test('détecte les nuits d’été où l’air extérieur est nettement plus frais', () => {
  const rows = [];
  for (const day of [10, 11]) {
    for (const minute of [0, 20, 40]) {
      rows.push({
        t: new Date(2026, 6, day, 23, minute).getTime(),
        st: 25, tExt: 18, seasonRaw: 1
      });
    }
  }
  const result = analyzeSeasonalVentilation(rows);
  const summer = result.seasons.find(item => item.season === 'été');
  assert.equal(result.currentSeason, 'été');
  assert.equal(summer.thermalSampleCount, 6);
  assert.equal(summer.opportunityDayCount, 2);
  assert.match(result.advice, /surventilation nocturne/);
  assert.deepEqual(summer.codeCounts, { 1: 6 });
});

test('détecte les périodes diurnes d’hiver où l’air extérieur est plus chaud', () => {
  const rows = [];
  for (const day of [10, 11]) {
    for (const minute of [0, 20, 40]) {
      rows.push({
        t: new Date(2026, 0, day, 12, minute).getTime(),
        st: 16, tExt: 20, seasonRaw: 2
      });
    }
  }
  const result = analyzeSeasonalVentilation(rows);
  const winter = result.seasons.find(item => item.season === 'hiver');
  assert.equal(result.currentSeason, 'hiver');
  assert.equal(winter.opportunityDayCount, 2);
  assert.match(result.advice, /surventilation peut alors apporter de l’air plus chaud/);
});

test('ne fabrique aucun conseil thermique lorsque les températures extérieures manquent', () => {
  const result = analyzeSeasonalVentilation([{ t: Date.now(), st: 20, tExt: null }]);
  assert.equal(result.status, 'insufficient-data');
  assert.match(result.advice, /insuffisantes/);
});
