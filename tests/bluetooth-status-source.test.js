import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { decodeVmiNotification } from '../js/modules/bluetooth-decoder.js';

test('les états Boost et Vacances restent décodés après la vitesse brute', async () => {
  const bytes = new Uint8Array(54);
  bytes[0] = 0xA5;
  bytes[1] = 0xB6;
  bytes[2] = 0x01;
  bytes[34] = 1;
  bytes[43] = 1;
  bytes[44] = 0;

  const decoded = decodeVmiNotification(bytes);
  assert.equal(decoded.kind, 'state');
  assert.equal(decoded.rawSpeed, 1);
  assert.equal(decoded.boost, 0);
  assert.equal(decoded.holiday, 1);

  const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.ok(source.includes('cur.vit=decoded.rawSpeed+1;'));
  assert.ok(source.includes('cur.boost=decoded.boost;cur.hol=decoded.holiday;cur.rpm=null;'));
});
