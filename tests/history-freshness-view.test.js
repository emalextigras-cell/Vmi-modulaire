import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHistoryFreshnessView } from '../js/modules/history-freshness-view.js';

const fmtShort = value => new Date(value).toISOString().slice(0, 10);

test('affiche un message simple quand aucun historique n’est disponible', () => {
  const view = buildHistoryFreshnessView({ estimate: null, fmtShort });
  assert.equal(view.className, 'advice');
  assert.match(view.text, /Aucun historique mémorisé/);
});

test('présente une estimation sans alerte lorsque la synchronisation est récente', () => {
  const view = buildHistoryFreshnessView({
    estimate: { newest: 1000, ageDays: 2, capacityDays: 28, daysRemaining: 20, deadline: 3000 },
    lastSync: 2000,
    fmtShort
  });
  assert.equal(view.className, 'advice good');
  assert.match(view.text, /Historique à jour/);
  assert.match(view.text, /Dernière synchronisation/);
});

test('signale une échéance de téléchargement proche ou dépassée', () => {
  const view = buildHistoryFreshnessView({
    estimate: { newest: 1000, ageDays: 14, capacityDays: 14, daysRemaining: 1, deadline: 2000 },
    fmtShort
  });
  assert.equal(view.className, 'advice warn');
  assert.match(view.text, /connecte-toi maintenant/);
});
