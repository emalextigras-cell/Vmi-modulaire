import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('les graphiques de débit signalent que l’unité du champ CSV reste à confirmer', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /Débit exporté VMI\+ \(valeur brute ; unité à confirmer\)/);
  const chart = await readFile(new URL('../js/modules/chart-renderer.js', import.meta.url), 'utf8');
  assert.match(chart, /Débit exporté VMI\+ \(valeur brute ; unité à confirmer\)/);
  assert.match(html, /Estimation conditionnelle du ventilateur PUREVENT/);
});

test('le code ne marque pas l’unité Debit comme confirmée', async () => {
  const analysis = await readFile(new URL('../js/modules/analysis.js', import.meta.url), 'utf8');
  assert.match(analysis, /valeur brute \(unité à confirmer\)/);
  assert.doesNotMatch(analysis, /m³\/h confirmé/);
});

test('la référence Vision’R et les limites constructeur sont documentées', async () => {
  const doc = await readFile(new URL('../docs/reference-materiel-purevent-vision-r.md', import.meta.url), 'utf8');
  assert.match(doc, /Purevent Vision'R/);
  assert.match(doc, /350 m³\/h/);
  assert.match(doc, /169 W/);
  assert.match(doc, /1 800 W/);
  assert.match(doc, /99 W/);
  assert.match(doc, /unité à confirmer/);
});
