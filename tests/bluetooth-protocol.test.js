import test from 'node:test';
import assert from 'node:assert/strict';
import { SVC_C, CH_C, SVC_T, CH_T, crc, frame, timeFrame, hex } from '../js/modules/bluetooth-protocol.js';

test('les UUID BLE correspondent aux services et caractéristiques observés', () => {
  assert.equal(SVC_C, '0003cbbb-0000-1000-8000-00805f9b0131');
  assert.equal(CH_C, '0003cbb1-0000-1000-8000-00805f9b0131');
  assert.equal(SVC_T, '0003cab5-0000-1000-8000-00805f9b0131');
  assert.equal(CH_T, '0003caa2-0000-1000-8000-00805f9b0131');
});

test('frame reproduit les trames de commande réellement capturées', () => {
  assert.equal(hex(frame(0x03, 0)), 'a5b6100605030000000010');
  assert.equal(hex(frame(0x06, 0)), 'a5b6100605060000000015');
  assert.equal(hex(frame(0x07, 0)), 'a5b6100605070000000014');
});

test('timeFrame reproduit la trame horaire réellement capturée', () => {
  const date = new Date(2026, 10, 12, 14, 31, 0);
  assert.equal(hex(timeFrame(date)), 'a5b61a06061a0b0c0e1f0016');
});

test('crc correspond au dernier octet des trames capturées', () => {
  const command = [0xA5, 0xB6, 0x10, 0x06, 0x05, 0x03, 0, 0, 0, 0];
  assert.equal(crc(command), 0x10);
  const clock = [0xA5, 0xB6, 0x1A, 0x06, 0x06, 0x1A, 0x0B, 0x0C, 0x0E, 0x1F, 0x00];
  assert.equal(crc(clock), 0x16);
});
