import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseAuthorizedDevice } from '../js/modules/bluetooth-autoconnect.js';

const device = id => ({ id, gatt: { connect() {} } });

test('sélectionne automatiquement l’unique appareil déjà autorisé', () => {
  const vmi = device('vmi-1');
  assert.equal(chooseAuthorizedDevice([vmi]), vmi);
});

test('préfère toujours l’identifiant mémorisé si plusieurs appareils sont autorisés', () => {
  const phone = device('phone');
  const vmi = device('vmi');
  assert.equal(chooseAuthorizedDevice([phone, vmi], 'vmi'), vmi);
});

test('ne choisit pas arbitrairement entre plusieurs appareils', () => {
  assert.equal(chooseAuthorizedDevice([device('one'), device('two')]), null);
});

test('retourne null si aucun appareil autorisé n’est disponible', () => {
  assert.equal(chooseAuthorizedDevice([]), null);
  assert.equal(chooseAuthorizedDevice([{ id: 'invalid' }]), null);
});
