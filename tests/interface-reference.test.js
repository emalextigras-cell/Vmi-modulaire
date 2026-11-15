import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('les graphiques de débit affichent l’unité m³/h', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('Débit VMI+ (m³/h)'));
  assert.ok(html.includes('Estimation du ventilateur PUREVENT à partir du débit exporté en m³/h'));
  const chart = await readFile(new URL('../js/modules/chart-renderer.js', import.meta.url), 'utf8');
  assert.ok(chart.includes('Débit VMI+ (m³/h)'));
});

test('le code identifie l’unité Debit en m³/h', async () => {
  const analysis = await readFile(new URL('../js/modules/analysis.js', import.meta.url), 'utf8');
  assert.ok(analysis.includes("unit: 'm³/h', verified: true"));
});

test('la référence Vision’R et les limites constructeur sont documentées', async () => {
  const doc = await readFile(new URL('../docs/reference-materiel-purevent-vision-r.md', import.meta.url), 'utf8');
  assert.ok(doc.includes("Purevent Vision'R"));
  assert.ok(doc.includes('350 m³/h'));
  assert.ok(doc.includes('169 W'));
  assert.ok(doc.includes('1 800 W'));
  assert.ok(doc.includes('99 W'));
  assert.ok(doc.includes("débit d'air exprimé en m³/h"));
});
