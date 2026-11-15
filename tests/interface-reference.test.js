import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('le graphique de débit affiche l’unité confirmée m³/h', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<h3>Débit VMI\+ \(m³\/h\)<\/h3>/);
  assert.doesNotMatch(html, /Débit exporté VMI\+ \(valeur brute, unité non précisée\)/);
});

test('la référence Vision’R et les limites constructeur sont documentées', async () => {
  const doc = await readFile(new URL('../docs/reference-materiel-purevent-vision-r.md', import.meta.url), 'utf8');
  assert.match(doc, /Purevent Vision'R/);
  assert.match(doc, /350 m³\/h/);
  assert.match(doc, /169 W/);
  assert.match(doc, /1 800 W/);
  assert.match(doc, /99 W/);
  assert.match(doc, /n'est pas établie/);
});
