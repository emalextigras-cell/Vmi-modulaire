import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeVmiNotification } from '../js/modules/bluetooth-decoder.js';

const frame = (type, length) => {
  const bytes = new Uint8Array(length);
  bytes[0] = 0xA5;
  bytes[1] = 0xB6;
  bytes[2] = type;
  return bytes;
};

test('ignore les notifications sans en-tête VMI complet', () => {
  assert.equal(decodeVmiNotification(new Uint8Array([0xA5, 0xB6])), null);
  assert.equal(decodeVmiNotification(new Uint8Array([0, 0, 1])), null);
});

test('décode les champs de la trame état aux offsets historiques', () => {
  const bytes = frame(0x01, 54);
  bytes[22] = 0x34; bytes[23] = 0x12;
  bytes[26] = 19; bytes[28] = 2; bytes[34] = 1;
  bytes[38] = 35; bytes[43] = 1; bytes[44] = 0;
  assert.deepEqual(decodeVmiNotification(bytes), {
    kind: 'state', filter: 2, days: 19, volume: 0x1234,
    maxTemperature: 35, rawSpeed: 1, boost: 0, holiday: 1
  });
});

test('conserve les mesures de température et humidité aux offsets existants', () => {
  const room = frame(0x02, 14); room[11] = 21; room[13] = 56;
  assert.deepEqual(decodeVmiNotification(room), { kind: 'room', temperature: 21, humidity: 56 });
  const probes = frame(0x03, 14);
  probes[6] = 8; probes[8] = 9; probes[11] = 10; probes[13] = 11;
  assert.deepEqual(decodeVmiNotification(probes), {
    kind: 'probes', firstTemperature: 8, firstHumidity: 9,
    secondTemperature: 10, secondHumidity: 11
  });
});

test('décode le compteur historique et conserve l’interprétation historique de l’octet de fin', () => {
  const total = frame(0x04, 8); total[6] = 0x34; total[7] = 0x12;
  assert.deepEqual(decodeVmiNotification(total), { kind: 'history-total', total: 0x1234 });
  const history = frame(0x30, 18);
  history[9] = 7; history[10] = 1; history[13] = 1;
  history.set([65, 66, 0], 14);
  const decoded = decodeVmiNotification(history);
  assert.equal(decoded.kind, 'history');
  assert.equal(decoded.sequence, 263);
  assert.equal(decoded.chunkIndex, 0);
  assert.equal(decoded.received, 263);
  assert.equal(decoded.final, true);
  assert.deepEqual([...decoded.payload], [65, 66]);
  const fragment = frame(0x30, 18); fragment[9] = 25; fragment[12] = 10;
  fragment.set([65, 66, 0], 14);
  const decodedFragment = decodeVmiNotification(fragment);
  assert.equal(decodedFragment.sequence, 25);
  assert.equal(decodedFragment.chunkIndex, 10);
  assert.equal(decodedFragment.final, false);
});

test('signale une trame historique trop courte et conserve les types inconnus', () => {
  assert.deepEqual(decodeVmiNotification(frame(0x30, 13)), { kind: 'history', valid: false, length: 13 });
  assert.deepEqual(decodeVmiNotification(frame(0x10, 4)), { kind: 'unknown', type: 0x10, length: 4 });
});
