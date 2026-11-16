import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCell } from '../js/modules/dataio.js';

function spreadsheetDate(parts) {
  return { SSF: { parse_date_code: () => parts } };
}

test('parseCell respecte le mois et le jour fournis par le numéro de série Excel', () => {
  const parsed = parseCell(46340, spreadsheetDate({
    y: 2026, m: 11, d: 10, H: 16, M: 45, S: 35
  }));
  assert.ok(parsed);
  const date = new Date(parsed.t);
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 10);
  assert.equal(date.getDate(), 10);
  assert.equal(date.getHours(), 16);
  assert.equal(date.getMinutes(), 45);
  assert.equal(date.getSeconds(), 35);
  assert.equal(parsed.rk, '10/11/2026 16:45:35');
});

test('parseCell ne rejette pas une date Excel dont le jour est inférieur ou égal à 12', () => {
  const parsed = parseCell(46310, spreadsheetDate({
    y: 2026, m: 10, d: 11, H: 8, M: 5, S: 0
  }));
  assert.equal(parsed?.rk, '11/10/2026 08:05:00');
});

test('parseCell refuse une date Excel impossible', () => {
  assert.equal(parseCell(46340, spreadsheetDate({
    y: 2026, m: 2, d: 30, H: 12, M: 0, S: 0
  })), null);
});
