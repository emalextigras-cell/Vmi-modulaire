import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptHistoryFragment, createHistoryStreamState } from '../js/modules/bluetooth-history-stream.js';

test('accepte les fragments ordonnés d’une même ligne puis la ligne suivante', () => {
  const state = createHistoryStreamState();
  const a = acceptHistoryFragment(state, { sequence: 0, chunkIndex: 0, payload: 'entête' });
  const b = acceptHistoryFragment(state, { sequence: 1, chunkIndex: 0, payload: 'début' });
  const c = acceptHistoryFragment(state, { sequence: 1, chunkIndex: 10, payload: 'suite' });
  assert.equal(a.accepted, true);
  assert.equal(b.accepted, true);
  assert.equal(c.accepted, true);
  assert.equal(state.gapCount, 0);
});

test('ignore une notification strictement dupliquée sans la compter comme progrès', () => {
  const state = createHistoryStreamState();
  acceptHistoryFragment(state, { sequence: 0, chunkIndex: 0, payload: 'abc' });
  const duplicate = acceptHistoryFragment(state, { sequence: 0, chunkIndex: 0, payload: 'abc' });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.accepted, false);
  assert.equal(state.gapCount, 0);
});

test('détecte un fragment manquant et écarte le reste de la ligne corrompue', () => {
  const state = createHistoryStreamState();
  acceptHistoryFragment(state, { sequence: 0, chunkIndex: 0, payload: 'entête' });
  acceptHistoryFragment(state, { sequence: 1, chunkIndex: 0, payload: 'début' });
  const gap = acceptHistoryFragment(state, { sequence: 1, chunkIndex: 20, payload: 'fin' });
  const skipped = acceptHistoryFragment(state, { sequence: 1, chunkIndex: 30, payload: 'suite' });
  const next = acceptHistoryFragment(state, { sequence: 2, chunkIndex: 0, payload: 'ligne suivante' });
  assert.equal(gap.gap, true);
  assert.equal(gap.resetBuffer, true);
  assert.equal(skipped.accepted, false);
  assert.equal(next.accepted, true);
  assert.equal(state.gapCount, 1);
});

test('détecte un index de ligne manquant sans concaténer les données', () => {
  const state = createHistoryStreamState();
  acceptHistoryFragment(state, { sequence: 0, chunkIndex: 0, payload: 'a' });
  const result = acceptHistoryFragment(state, { sequence: 2, chunkIndex: 0, payload: 'c' });
  assert.equal(result.accepted, true);
  assert.equal(result.gap, true);
  assert.equal(result.resetBuffer, true);
  assert.equal(state.gapCount, 1);
});

test('les lignes d’un transfert partiel ne deviennent pas une borne d’arrêt', async () => {
  const { isHistorySyncBaseline, markHistoryRows } = await import('../js/modules/bluetooth-history-stream.js');
  const partial = markHistoryRows([{ rk: '01/01/2026 00:00:00', d: 1 }], false);
  assert.equal(partial[0].syncPartial, true);
  assert.equal(isHistorySyncBaseline(partial[0]), false);
  const completed = markHistoryRows(partial, true);
  assert.equal(completed[0].syncPartial, false);
  assert.equal(isHistorySyncBaseline(completed[0]), true);
});
