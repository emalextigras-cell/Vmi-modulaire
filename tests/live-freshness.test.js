import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLiveFreshnessText } from '../js/modules/live-freshness.js';

test('distingue les flux reçus récemment pour chaque groupe de mesures', () => {
  assert.equal(
    buildLiveFreshnessText({ salon: 95000, probes: 98000, state: 99000 }, 100000),
    'Salon : à jour (il y a 5 s) · sondes : à jour (il y a 2 s) · état VMI : à jour (il y a 1 s).'
  );
});

test('signale séparément un flux devenu ancien après 90 secondes', () => {
  assert.equal(
    buildLiveFreshnessText({ salon: 1000, probes: 50000, state: 99000 }, 100000),
    'Salon : anciennes (il y a 1 min) · sondes : à jour (il y a 50 s) · état VMI : à jour (il y a 1 s).'
  );
});

test('indique explicitement les flux qui n’ont encore jamais été reçus', () => {
  assert.equal(
    buildLiveFreshnessText({}, 100000),
    'Salon : non reçues · sondes : non reçues · état VMI : non reçues.'
  );
});

test('ne produit pas un âge négatif si l’horloge avance entre deux lectures', () => {
  assert.match(buildLiveFreshnessText({ salon: 101000 }, 100000), /Salon : à jour \(il y a 0 s\)/);
});
