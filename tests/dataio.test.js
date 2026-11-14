import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCell, recFrom, getColumnMapping, findVmiHeaderRowIndex } from '../js/modules/dataio.js';

test('parseCell lit une date CSV VMI+ au format français', () => {
  const parsed = parseCell('10/11/2026 16:45:35', null);
  assert.ok(parsed);
  assert.equal(parsed.rk, '10/11/2026 16:45:35');
  const date = new Date(parsed.t);
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 10);
  assert.equal(date.getDate(), 10);
});

test('recFrom conserve vitesse brute et débit exporté sans inventer leurs unités ou correspondances', () => {
  const row = Array(124).fill('');
  row[0] = '10/11/2026 16:45:35';
  row[11] = '186';
  row[20] = '90';
  row[22] = '3';
  row[23] = '121';
  row[25] = '1376';
  row[39] = '17,6';
  row[40] = '17,7';
  row[41] = '73';
  row[42] = '09,05';
  row[43] = '17,6';
  row[44] = '74';
  row[45] = '09,12';
  row[117] = '19,7';
  row[118] = '62,0';

  const record = recFrom(row, null);
  assert.ok(record);
  assert.equal(record.vit, null);
  assert.equal(record.vmiSpeedRaw, 3);
  assert.equal(record.debit, 121);
  assert.equal(record.rpm, 1376);
  assert.equal(record.st, 19.7);
  assert.equal(record.sh, 62);
  assert.equal(record.tExt, 17.6);
  assert.equal(record.te, 17.6);
  assert.equal(record.he, 74);
});

test('recFrom conserve une ligne qui ne contient que le débit exporté', () => {
  const row = Array(124).fill('');
  row[0] = '10/11/2026 16:45:35';
  row[23] = '121';
  const record = recFrom(row, null);
  assert.ok(record);
  assert.equal(record.debit, 121);
  assert.equal(record.vit, null);
});

test('recFrom laisse la vitesse inconnue si la colonne est vide', () => {
  const row = Array(124).fill('');
  row[0] = '10/11/2026 16:45:35';
  row[117] = '19,7';
  row[118] = '62,0';
  const record = recFrom(row, null);
  assert.ok(record);
  assert.equal(record.vit, null);
});

import { analyzeSpeedLevels } from '../js/modules/analysis.js';

test('analyzeSpeedLevels compare les vitesses manuelles identifiées et ignore les valeurs brutes VMI+', () => {
  const data = [
    { vmiModeRaw: 1, vit: 99, sh: 48, st: 20, te: 15, he: 60 },
    { vmiModeRaw: 1, vit: 99, sh: 52, st: 20, te: 15, he: 60 },
    { vmiModeRaw: 2, vit: 99, sh: 55, st: 20, te: 15, he: 60 },
    { vmiModeRaw: 2, vit: 99, sh: 57, st: 20, te: 15, he: 60 },
    { vmiModeRaw: 3, vit: 99, sh: 65, st: 20, te: 15, he: 60 },
    { vit: null, vmiSpeedRaw: 3, sh: 40, st: 20, te: 15, he: 60 }
  ];
  const result = analyzeSpeedLevels(data, 2, 55);
  assert.equal(result.sampleCount, 5);
  assert.equal(result.status, 'comparison-ready');
  assert.equal(result.bestSpeed, null);
  assert.deepEqual(result.groups.map(g => g.n), [2, 2, 1]);
});

test('analyzeSpeedLevels signale un échantillon insuffisant', () => {
  const result = analyzeSpeedLevels([{ vmiModeRaw: 1, vit: 99, sh: 50, st: 20 }], 5, 50);
  assert.equal(result.status, 'insufficient');
});

import { fromOldRow, wallUtcToLocal } from '../js/modules/legacy-migration.js';

test('wallUtcToLocal conserve l’heure murale historique de la VMI', () => {
  const source = new Date(Date.UTC(2026, 10, 10, 16, 55, 30)).getTime();
  const converted = new Date(wallUtcToLocal(source));
  assert.equal(converted.getFullYear(), 2026);
  assert.equal(converted.getMonth(), 10);
  assert.equal(converted.getDate(), 10);
  assert.equal(converted.getHours(), 16);
  assert.equal(converted.getMinutes(), 55);
  assert.equal(converted.getSeconds(), 30);
});

test('fromOldRow convertit les colonnes historiques sans inventer une vitesse', () => {
  const timestamp = new Date(Date.UTC(2026, 10, 10, 16, 55, 30)).getTime();
  const row = [timestamp, 19.7, 62, 17.7, 73, 17.6, 74, 1376, 90];
  const record = fromOldRow(row);
  assert.equal(record.t, wallUtcToLocal(timestamp));
  assert.equal(record.st, 19.7);
  assert.equal(record.sh, 62);
  assert.equal(record.t1, 17.7);
  assert.equal(record.h1, 73);
  assert.equal(record.te, 17.6);
  assert.equal(record.he, 74);
  assert.equal(record.rpm, 1376);
  assert.equal(record.fil, 90);
  assert.equal(record.vit, null);
});

import { pruneHistory } from '../js/modules/history.js';

test('pruneHistory retire les lignes vides et conserve les relevés exploitables', () => {
  const rows = [
    { t: 1 },
    { t: 2, sh: 50 },
    { t: 3, te: 12 },
    { t: 4, rpm: 900 }
  ];
  const result = pruneHistory(rows, 10);
  assert.deepEqual(result.records.map(r => r.t), [2, 3, 4]);
  assert.equal(result.removed, 0);
});

test('pruneHistory conserve les relevés qui contiennent seulement le débit exporté', () => {
  const result = pruneHistory([{ t: 1, debit: 121 }, { t: 2 }], 10);
  assert.deepEqual(result.records.map(r => r.t), [1]);
});

test('pruneHistory applique la limite en gardant les relevés les plus récents', () => {
  const rows = [1, 2, 3, 4].map(t => ({ t, sh: 50 }));
  const result = pruneHistory(rows, 2);
  assert.deepEqual(result.records.map(r => r.t), [3, 4]);
  assert.equal(result.removed, 2);
});

test('pruneHistory ne modifie pas le tableau source', () => {
  const rows = [{ t: 1, sh: 50 }, { t: 2, sh: 51 }];
  const result = pruneHistory(rows, 1);
  assert.equal(rows.length, 2);
  assert.deepEqual(result.records.map(r => r.t), [2]);
});

test('recFrom lit correctement une ligne représentative de l’export VMI+ réel', () => {
  // Valeurs relevées dans l’export du 10/11/2026, colonnes VMI+ d’origine.
  const row = Array(124).fill('');
  row[0] = '10/11/2026 16:45:35';
  row[11] = '186';
  row[20] = '172';
  row[22] = '3';
  row[23] = '121';
  row[25] = '1376';
  row[39] = '17,6';
  row[40] = '17,7';
  row[41] = '73';
  row[42] = '09,05';
  row[43] = '17,6';
  row[44] = '74';
  row[45] = '09,12';
  row[117] = '019,7';
  row[118] = '062,0';

  const record = recFrom(row, null);
  assert.ok(record);
  assert.equal(record.rk, '10/11/2026 16:45:35');
  assert.equal(record.d, 186);
  assert.equal(record.fil, 172);
  assert.equal(record.vmiSpeedRaw, 3);
  assert.equal(record.debit, 121);
  assert.equal(record.rpm, 1376);
  assert.equal(record.t1, 17.7);
  assert.equal(record.h1, 73);
  assert.equal(record.vmiAbsP0, 9.05);
  assert.equal(record.te, 17.6);
  assert.equal(record.he, 74);
  assert.equal(record.vmiAbsP1, 9.12);
  assert.equal(record.st, 19.7);
  assert.equal(record.sh, 62);
  assert.equal(record.tExt, 17.6);
  assert.equal(record.vit, null);
});


test('les en-têtes VMI+ déplacent les champs nommés sans confondre les capteurs', () => {
  const headers = ['Vitesse','Date','Indice Encr (%)','Etat filtre','Debit','Tachy (rpm)','PWM (1/1000)','mode','Vol(m3)','Duree fonc (j)','Tempext'];
  const mapping = getColumnMapping(headers);
  const row = ['3','10/11/2026 16:45:35','90','172','121','1376','348','1','337','186','17,6'];
  const record = recFrom(row, null, mapping);
  assert.ok(record);
  assert.equal(record.vmiSpeedRaw, 3);
  assert.equal(record.filterIndexPct, 90);
  assert.equal(record.fil, 172);
  assert.equal(record.debit, 121);
  assert.equal(record.rpm, 1376);
  assert.equal(record.vmiPwmRaw, 348);
  assert.equal(record.vmiModeRaw, 1);
  assert.equal(record.volumeRaw, 337);
  assert.equal(record.d, 186);
  assert.equal(record.tExt, 17.6);
  assert.equal(record.vit, null);
  assert.equal(mapping.probeTemp, 40);
});

test('recFrom conserve les champs VMI+ supplémentaires du CSV réel', () => {
  const row = Array(124).fill('');
  row[0] = '10/11/2026 16:45:35'; row[1] = '35'; row[2] = '337'; row[3] = '1';
  row[11] = '186'; row[13] = '4'; row[14] = '0';
  row[20] = '172'; row[21] = '90'; row[22] = '3'; row[23] = '121';
  row[24] = '112'; row[25] = '1376'; row[26] = '348';
  row[39] = '17,6'; row[40] = '17,7'; row[41] = '73'; row[42] = '09,05';
  row[43] = '17,6'; row[44] = '74'; row[45] = '09,12';
  row[117] = '019,7'; row[118] = '062,0';
  const record = recFrom(row, null);
  assert.ok(record);
  assert.equal(record.filterIndexPct, 90);
  assert.equal(record.consDpRaw, 112);
  assert.equal(record.vmiPwmRaw, 348);
  assert.equal(record.vmiModeRaw, 1);
  assert.equal(record.volumeRaw, 337);
  assert.equal(record.systemStateRaw, 4);
  assert.equal(record.failureRaw, 0);
});

test('getColumnMapping reconnaît les en-têtes exacts du CSV VMI+ fourni', () => {
  const headers = Array(124).fill('NA');
  Object.assign(headers, {
    0: 'Date', 1: 'Event', 2: 'Vol(m3)', 3: 'mode',
    11: 'Duree fonc (j)', 13: 'Etat Systeme', 14: 'Panne',
    20: 'Etat filtre', 21: 'Indice Encr (%)', 22: 'Vitesse',
    23: 'Debit', 24: 'Cons Dp', 25: 'Tachy (rpm)',
    26: 'PWM (1/1000)', 39: 'Tempext', 40: 'Temp',
    41: 'Hum rel (%)', 42: 'Hum abs (%)',
    43: 'Temp', 44: 'Hum rel (%)', 45: 'Hum abs (%)'
  });
  const mapping = getColumnMapping(headers);
  assert.deepEqual(
    Object.fromEntries(['date','event','volume','mode','durationDays','systemState','failure','filter','filterIndexPct','speed','airflow','consDp','rpm','pwm','outdoorTemp','probeTemp','probeHumidity','probeAbsHumidity','incomingTemp','incomingHumidity','incomingAbsHumidity','salonTemp','salonHumidity'].map(key => [key, mapping[key]])),
    {
      date: 0, event: 1, volume: 2, mode: 3, durationDays: 11,
      systemState: 13, failure: 14, filter: 20, filterIndexPct: 21,
      speed: 22, airflow: 23, consDp: 24, rpm: 25, pwm: 26,
      outdoorTemp: 39, probeTemp: 40, probeHumidity: 41,
      probeAbsHumidity: 42, incomingTemp: 43, incomingHumidity: 44,
      incomingAbsHumidity: 45, salonTemp: 117, salonHumidity: 118
    }
  );
});


test('parseCell refuse les dates calendaires impossibles et les suffixes parasites',()=>{
 assert.equal(parseCell('31/02/2026 16:45:35',null),null);
 assert.equal(parseCell('10/11/2026 16:45:35 texte',null),null);
 assert.equal(parseCell('10/11/2026 25:45:35',null),null);
 assert.equal(parseCell('10/11/2026 16:60:35',null),null);
});

test('parseCell accepte le 29 février uniquement lors d’une année bissextile',()=>{
 assert.equal(parseCell('29/02/2024 12:00:00',null)?.rk,'29/02/2024 12:00:00');
 assert.equal(parseCell('29/02/2025 12:00:00',null),null);
});


test('repère l’en-tête VMI+ même si le nombre de lignes de métadonnées varie', () => {
  const rows = [
    ['VMI n,1.2512737'],
    ['Var. SW: 1'],
    ['Informations complémentaires'],
    [''],
    ['Export VMI+'],
    ['Date','Event','Vol(m3)','mode','Debit'],
    ['10/11/2026 16:45:35','35','337','1','121']
  ];
  const headerIndex = findVmiHeaderRowIndex(rows);
  assert.equal(headerIndex, 5);
  const mapping = getColumnMapping(rows[headerIndex]);
  const record = recFrom(rows[headerIndex + 1], null, mapping);
  assert.equal(record?.vmiModeRaw, 1);
  assert.equal(record?.debit, 121);
});

test('refuse de choisir une ligne sans les trois colonnes d’ancrage VMI+', () => {
  const rows = [
    ['Date','Event','Debit'],
    ['10/11/2026 16:45:35','35','121'],
    ['Date','Mode','Autre']
  ];
  assert.equal(findVmiHeaderRowIndex(rows), -1);
  assert.equal(findVmiHeaderRowIndex(null), -1);
});

test('la détection de l’en-tête est limitée à la fenêtre autorisée', () => {
  const rows = Array.from({length: 21}, () => ['métadonnée']);
  rows[20] = ['Date','mode','Debit'];
  assert.equal(findVmiHeaderRowIndex(rows), -1);
  assert.equal(findVmiHeaderRowIndex(rows, 21), 20);
});
