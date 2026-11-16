import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistoryDownloadController } from '../js/modules/history-download-controller.js';

function setup(overrides = {}) {
 let download = { on: true, rows: [], buf: '', total: 0, sigs: new Set(), got: false, timeout: null };
 let autoDone = false;
 const calls = [];
 const elements = { dlh: { disabled: false }, dlp: { textContent: '' } };
 const deps = {
  $: id => elements[id], getDownload: () => download, setDownload: value => { download = value; },
  getHistory: () => [], parseCell: value => ({ rk: '2026-11-16' }), num: value => Number(value),
  recFrom: fields => ({ rk: '2026-11-16', d: Number(fields[11]) }), ingest: (rows, label) => calls.push(['ingest', rows.length, label]),
  armDownloadTimeout: (state, finish) => { calls.push(['timer', state.on, typeof finish]); },
  setClock: async () => true, send: async (...args) => { calls.push(['send', ...args]); return true; },
  setCommandsDisabled: value => calls.push(['disabled', value]), connected: () => true,
  markSync: () => calls.push(['sync']), disconnectIntentionally: () => calls.push(['disconnect']),
  showError: value => calls.push(['error', value]), log: value => calls.push(['log', value]),
  getAutoDone: () => autoDone, setAutoDone: value => { autoDone = value; },
  ...overrides
 };
 return { controller: createHistoryDownloadController(deps), calls, elements, getDownload: () => download, getAutoDone: () => autoDone };
}

test('le parseur ajoute une ligne reconnue et ignore les lignes hors format', () => {
 const { controller, getDownload } = setup();
 controller.parseDownloadLine('ligne de statut');
 assert.equal(getDownload().rows.length, 0);
 controller.parseDownloadLine('16/11/2026 12:00:00;1;2;3;4;5;6;7;8;9;10;11');
 assert.equal(getDownload().rows.length, 1);
 assert.equal(getDownload().rows[0].d, 11);
});

test('un relevé déjà connu arrête le téléchargement et déconnecte volontairement', () => {
 const { controller, calls, getDownload } = setup({ getHistory: () => [{ rk: '2026-11-16', d: 11 }] });
 controller.parseDownloadLine('16/11/2026 12:00:00;1;2;3;4;5;6;7;8;9;10;11');
 assert.equal(getDownload().on, false);
 assert.ok(calls.some(call => call[0] === 'disconnect'));
 assert.ok(calls.some(call => call[0] === 'ingest' && call[1] === 0));
});

test('le démarrage conserve les trois registres de lancement et arme le délai', async () => {
 const { controller, calls, elements, getDownload } = setup({ getDownload: () => ({ on: false, rows: [], sigs: new Set() }) });
 await controller.startDownload(false);
 assert.deepEqual(calls.filter(call => call[0] === 'send'), [['send', 0x2c, 0], ['send', 0x20, 0], ['send', 0x22, 0]]);
 assert.ok(calls.some(call => call[0] === 'timer'));
 assert.equal(elements.dlh.disabled, true);
 assert.equal(getDownload().on, true);
});
