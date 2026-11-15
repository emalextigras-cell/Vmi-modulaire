import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('les graphiques de débit affichent l’unité m³/h', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /Débit VMI\+ \(m³/h\)/);
  const chart = await readFile(new URL('../js/modules/chart-renderer.js', import.meta.url), 'utf8');
  assert.match(chart, /Débit VMI\+ \(m³/h\)/);
  assert.match(html, /Estimation du ventilateur PUREVENT à partir du débit exporté en m³/h/);
});

test('le code identifie l’unité Debit en m³/h', async () => {
  const analysis = await readFile(new URL('../js/modules/analysis.js', import.meta.url), 'utf8');
  assert.match(analysis, /unit: 'm³/h', verified: true/);
  assert.doesNotMatch(analysis, /m³\/h/);
});

test('la référence Vision’R et les limites constructeur sont documentées', async () => {
  const doc = await readFile(new URL('../docs/reference-materiel-purevent-vision-r.md', import.meta.url), 'utf8');
  assert.match(doc, /Purevent Vision'R/);
  assert.match(doc, /350 m³\/h/);
  assert.match(doc, /169 W/);
  assert.match(doc, /1 800 W/);
  assert.match(doc, /99 W/);
  assert.match(doc, /débit d'air exprimé en m³\/h/);
});
