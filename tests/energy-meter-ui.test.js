import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('le suivi électrique mesuré est accessible dans l’interface', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const start = html.indexOf('<div id="energyMeterSection">');
  const end = html.indexOf('</div>', html.indexOf('</p>', html.indexOf('id="energyMeterForm"')));
  assert.ok(start >= 0, 'le bloc de suivi électrique doit exister');
  assert.ok(end > start, 'le bloc de suivi électrique doit être correctement délimité');
  const section = html.slice(start, end);
  assert.match(section, /id="energyMeterForm"/);
  assert.match(section, /id="energyMeterSummary"/);
  assert.match(section, /id="energyMeterHistory"/);
  assert.doesNotMatch(section, /\shidden(?:\s|>)/);
  assert.doesNotMatch(section, /aria-hidden="true"/);
});
