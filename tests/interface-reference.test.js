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


test('le module de conseils saisonniers est inclus dans le cache hors ligne', async () => {
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  assert.ok(sw.includes("'./js/modules/seasonal-advice.js'"));
  assert.ok(sw.includes("'./js/modules/history-selection.js'"));
  assert.ok(sw.includes("'./js/modules/format-utils.js'"));
  assert.ok(sw.includes('vmi-modulaire-v14-cache-22'));
});


test('le panneau assistant est présent et son moteur est mis en cache hors ligne', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('id="assistantVmi"'));
  assert.ok(html.includes('Assistant intelligent VMI'));
  assert.ok(html.includes('id="assistantRecommendations"'));
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  assert.ok(sw.includes("'./js/modules/assistant-summary.js'"));
  assert.ok(sw.includes("'./js/modules/assistant-renderer.js'"));
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.ok(app.includes("from './modules/assistant-renderer.js'"));
  assert.ok(app.includes('renderVmiAssistant(analysisData,'));
  const renderer = await readFile(new URL('../js/modules/assistant-renderer.js', import.meta.url), 'utf8');
  assert.ok(renderer.includes("from './assistant-summary.js'"));
});

test('l’assistant reste local et ne modifie aucune commande Bluetooth', async () => {
  const assistant = await readFile(new URL('../js/modules/assistant-summary.js', import.meta.url), 'utf8');
  assert.ok(assistant.includes('buildHygrometricDiagnosis'));
  assert.ok(assistant.includes('summarizeFanEnergyEstimate'));
  assert.ok(assistant.includes('analyzeSeasonalVentilation'));
  assert.ok(assistant.includes('Aucune commande de vitesse'));
  assert.ok(!assistant.includes('fetch('));
});
