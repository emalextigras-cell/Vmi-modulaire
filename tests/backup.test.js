import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackupSnapshot, mergeBackupData } from '../js/modules/backup.js';

const MIN_VALID = new Date(2025, 0, 1).getTime();

test('createBackupSnapshot conserve le format JSON v13', () => {
  const snapshot = createBackupSnapshot({
    hist: [{ t: MIN_VALID, sh: 50 }],
    live: [{ t: MIN_VALID + 1, sh: 51 }],
    meta: { lastSync: 123 },
    exportedAt: '2026-11-13T12:00:00.000Z'
  });
  assert.deepEqual(snapshot, {
    app: 'vmi-purevent',
    version: 1,
    exportedAt: '2026-11-13T12:00:00.000Z',
    hist: [{ t: MIN_VALID, sh: 50 }],
    live: [{ t: MIN_VALID + 1, sh: 51 }],
    meta: { lastSync: 123 }
  });
});

test('mergeBackupData ajoute les relevés valides sans écraser les existants', () => {
  const existing = { t: MIN_VALID, sh: 48 };
  const result = mergeBackupData({
    backup: { app: 'vmi-purevent', hist: [{ t: MIN_VALID, sh: 99 }, { t: MIN_VALID + 1, sh: 52 }, { t: MIN_VALID - 1, sh: 30 }] },
    currentHist: [existing],
    minValid: MIN_VALID
  });
  assert.equal(result.hist.length, 2);
  assert.equal(result.hist[0], existing);
  assert.equal(result.hist[0].sh, 48);
  assert.equal(result.hist[1].sh, 52);
  assert.equal(result.addedHistory, 1);
});

test('mergeBackupData fusionne les relevés directs sans doublons et limite à 10000', () => {
  const currentLive = [{ t: 1, sh: 40 }];
  const result = mergeBackupData({
    backup: { app: 'vmi-purevent', hist: [], live: [{ t: 1, sh: 99 }, { t: 2, sh: 41 }] },
    currentLive,
    minValid: MIN_VALID
  });
  assert.deepEqual(result.live, [{ t: 1, sh: 40 }, { t: 2, sh: 41 }]);
  assert.equal(result.addedLive, 1);

  const capped = mergeBackupData({
    backup: { app: 'vmi-purevent', hist: [], live: Array.from({ length: 5 }, (_, i) => ({ t: i + 3 })) },
    currentLive,
    minValid: MIN_VALID,
    maxLive: 3
  });
  assert.deepEqual(capped.live.map(row => row.t), [3, 4, 5]);
});

test('mergeBackupData conserve la dernière synchronisation la plus récente', () => {
  const result = mergeBackupData({
    backup: { app: 'vmi-purevent', hist: [], meta: { lastSync: 200 } },
    currentMeta: { lastSync: 300, other: 'kept' },
    minValid: MIN_VALID
  });
  assert.deepEqual(result.meta, { lastSync: 300, other: 'kept' });
});

test('mergeBackupData refuse une sauvegarde au mauvais format', () => {
  assert.throws(() => mergeBackupData({ backup: { app: 'autre', hist: [] }, minValid: MIN_VALID }), /non reconnu/);
  assert.throws(() => mergeBackupData({ backup: { app: 'vmi-purevent', hist: {} }, minValid: MIN_VALID }), /non reconnu/);
});
