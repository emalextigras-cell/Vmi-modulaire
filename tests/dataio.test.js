import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCell, recFrom, mapVmiPlusHeaders } from '../js/modules/dataio.js';

test('parseCell lit une date CSV VMI+ au format français', () => {
  const parsed = parseCell('10/11/2026 16:45:35', null);
  assert.ok(parsed);
  assert.equal(parsed.rk, '10/11/2026 16:45:35');
  const date = new Date(parsed.t);
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 10);
  assert.equal(date.getDate(), 10);
});

test('l’en-tête réel VMI+ repère les champs même si les colonnes changent de place', () => {
  const headers = ['Vitesse','Date','Indice Encr (%)','Etat filtre','Debit','Tachy (rpm)','PWM (1/1000)','mode','Vol(m3)','Duree fonc (j)'];
  const map = mapVmiPlusHeaders(headers);
  const row = ['3','10/11/2026 16:45:35','90','172','121','1376','348','1','337','186'];
  const record = recFrom(row, null, map);
  assert.ok(record);
  assert.equal(record.vmiSpeedRaw, 3);
  assert.equal(record.filterCloggingPct, 90);
  assert.equal(record.fil, 172);
  assert.equal(record.debit, 121);
  assert.equal(record.rpm, 1376);
  assert.equal(record.pwm, 348);
  assert.equal(record.modeRaw, 1);
  assert.equal(record.volumeM3, 337);
  assert.equal(record.d, 186);
  assert.equal(record.vit, null);
});

test('recFrom conserve les colonnes capteurs de secours et les champs bruts connus', () => {
  const row = Array(124).fill('');
  row[0] = '10/11/2026 16:45:35'; row[11] = '186';
  row[20] = '172'; row[21] = '90'; row[22] = '3'; row[23] = '121';
  row[24] = '112'; row[25] = '1376'; row[26] = '348';
  row[39] = '17,6'; row[40] = '17,7'; row[41] = '73'; row[42] = '09,05';
  row[43] = '17,6'; row[44] = '74'; row[45] = '09,12';
  row[117] = '019,7'; row[118] = '062,0';
  const record = recFrom(row, null);
  assert.ok(record);
  assert.equal(record.rk, '10/11/2026 16:45:35');
  assert.equal(record.d, 186); assert.equal(record.fil, 172);
  assert.equal(record.filterCloggingPct, 90); assert.equal(record.vmiSpeedRaw, 3);
  assert.equal(record.debit, 121); assert.equal(record.consDp, 112);
  assert.equal(record.rpm, 1376); assert.equal(record.pwm, 348);
  assert.equal(record.t1, 17.7); assert.equal(record.h1, 73);
  assert.equal(record.vmiAbsP0, 9.05); assert.equal(record.te, 17.6);
  assert.equal(record.he, 74); assert.equal(record.vmiAbsP1, 9.12);
  assert.equal(record.st, 19.7); assert.equal(record.sh, 62);
  assert.equal(record.tExt, 17.6); assert.equal(record.vit, null);
});

test('recFrom conserve une ligne ne contenant que le débit', () => {
  const row = Array(124).fill('');
  row[0] = '10/11/2026 16:45:35'; row[23] = '121';
  const record = recFrom(row, null);
  assert.ok(record); assert.equal(record.debit, 121); assert.equal(record.vit, null);
});

test('les intitulés répétés des capteurs gardent leurs indices de secours connus', () => {
  const headers = ['Date','Temp','Hum rel (%)','Temp','Hum rel (%)'];
  const map = mapVmiPlusHeaders(headers);
  assert.equal(map.date, 0);
  assert.equal(map.probeTemp, undefined);
});
