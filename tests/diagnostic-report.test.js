import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDiagnosticReport } from '../js/modules/diagnostic-report.js';

const fmt = timestamp => new Date(timestamp).toISOString();

test('le rapport de diagnostic conserve les états et les limites de données', () => {
 const report = buildDiagnosticReport({
  appVersion: 'test', now: 10_000, userAgent: 'Test navigateur', bluetoothAvailable: true,
  connected: false, serviceWorkerStatus: 'actif', sheetJsLoaded: true,
  hist: [{ t: 1_000, st: 21, sh: 50, tExt: 8, t1: 22, h1: 45, te: 12, he: 60, rpm: 900, d: 1, rk: 'raw' }, { t: 9_000, st: 22, sh: 55, tExt: 9, t1: 23, h1: 48, te: 13, he: 58, rpm: 950 }],
  live: [{ t: 9_000 }], minValid: 5_000, fmtLocal: fmt, fmtShort: fmt,
  absoluteHumidity: () => 10, lastSeen: { salon: 9_000, probes: 8_000, state: 0 },
  source: 'hist', selectedDate: '2026-11-16', daysSetting: 30,
  chartPaths: { chartRH: 2, chartHA: 1 }, downloadOn: true, downloadProgress: '12/20',
  commandResult: 'aucune', errors: ['erreur test'], logLines: ['ligne récente']
 });
 assert.match(report, /Historique : 2 relevés dont 1 valides/);
 assert.match(report, /Bluetooth : disponible · connecté : non/);
 assert.match(report, /trous > 2 h : 0/);
 assert.match(report, /Direct : 1 relevés/);
 assert.match(report, /chartRH 2 courbe\(s\)/);
 assert.match(report, /Téléchargement : en cours · 12\/20/);
 assert.match(report, /erreur test/);
 assert.match(report, /ligne récente/);
});

test('le rapport signale une période sans historique valide', () => {
 const report = buildDiagnosticReport({ appVersion: 'test', hist: [{ t: 1 }], minValid: 2, fmtLocal: fmt, fmtShort: fmt, absoluteHumidity: () => null });
 assert.match(report, /Historique : 1 relevés dont 0 valides/);
 assert.doesNotMatch(report, /période :/);
});
