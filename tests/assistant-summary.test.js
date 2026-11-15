import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVmiAssistantSummary } from '../js/modules/assistant-summary.js';

const HOUR = 3600000;
function makeHistory({ manualModes = true } = {}) {
  const start = new Date(2026, 10, 1, 0, 0, 0).getTime();
  const rows = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      rows.push({
        t: start + day * 24 * HOUR + hour * HOUR,
        st: 20,
        sh: 60,
        te: 10,
        he: 50,
        tExt: 12,
        debit: 125,
        rpm: 1200,
        volumeRaw: 337,
        vmiModeRaw: manualModes ? (hour < 8 ? 1 : hour < 16 ? 2 : 3) : null,
        vmiSpeedRaw: 5,
        consTmaxRaw: 10,
        seasonRaw: 1
      });
    }
  }
  return rows;
}

test('retourne une consigne claire quand aucun historique n’est disponible', () => {
  const result = buildVmiAssistantSummary([]);
  assert.equal(result.status, 'no-data');
  assert.match(result.overview, /aucun relevé historique/i);
  assert.equal(result.sections.length, 0);
  assert.ok(result.recommendations.some(item => item.title === 'Charger un historique'));
});

test('synthétise les analyses existantes sans inventer de consommation mesurée', () => {
  const rows = makeHistory();
  const result = buildVmiAssistantSummary(rows, { targetRH: 50, minSamples: 10 });

  assert.equal(result.status, 'available');
  assert.equal(result.sampleCount, rows.length);
  for (const id of ['quality', 'hygrometry', 'time', 'speeds', 'airflow', 'seasonal', 'energy']) {
    assert.ok(result.sections.some(item => item.id === id), 'section manquante : ' + id);
  }

  const energy = result.sections.find(item => item.id === 'energy');
  assert.ok(energy.details.some(line => /kWh estimés/.test(line)));
  assert.ok(energy.details.some(line => /Aucun index électrique externe enregistré/.test(line)));
  assert.ok(energy.details.some(line => /préchauffage et la consommation totale ne sont pas estimés/.test(line)));
  assert.ok(result.limits.some(line => /Aucune commande/.test(line)));
  assert.ok(result.recommendations.some(item => /Examiner les comparaisons de vitesses/.test(item.title)));
  assert.ok(result.recommendations.some(item => item.title === 'Bilan simple de la période'));
  assert.ok(result.recommendations.find(item => item.title === 'Bilan simple de la période').text.includes('Les niveaux 1/2 donnent des résultats proches') || result.recommendations.find(item => item.title === 'Bilan simple de la période').text.includes('présente une humidité absolue intérieure')); 
  assert.ok(!result.recommendations.some(item => /consommation réelle/i.test(item.title)));
});

test('ne confond pas le code brut Vitesse avec les modes manuels 1/2/3', () => {
  const result = buildVmiAssistantSummary(makeHistory({ manualModes: false }));
  const speedSection = result.sections.find(item => item.id === 'speeds');
  const airflowSection = result.sections.find(item => item.id === 'airflow');

  assert.match(speedSection.summary, /Aucune annotation de vitesse manuelle/);
  assert.ok(airflowSection.details.some(line => /codes « Vitesse » bruts/i.test(line)));
  assert.ok(!result.recommendations.some(item => /vitesses/i.test(item.title)));
});

test('distingue les index externes mesurés de l’estimation du ventilateur', () => {
  const rows = makeHistory();
  const start = rows[0].t;
  const end = rows[rows.length - 1].t;
  const result = buildVmiAssistantSummary(rows, {
    energyReadings: [
      { id: 'meter-1', meterType: 'ventilation', t: start, kwh: 100 },
      { id: 'meter-2', meterType: 'ventilation', t: end, kwh: 102 }
    ]
  });
  const energy = result.sections.find(item => item.id === 'energy');

  assert.ok(energy.details.some(line => /2 kWh cumulés/.test(line)));
  assert.ok(energy.details.some(line => /kWh estimés/.test(line)));
  assert.ok(energy.details.some(line => /ne représente pas une mesure électrique/.test(line)));
});


test('ne transforme pas un pic isolé plausible en conseil d’alerte', () => {
  const rows = makeHistory();
  rows[80].sh = 95;
  const result = buildVmiAssistantSummary(rows);
  assert.ok(!result.recommendations.some(item => /mesures inhabituelles|valeurs hors limites/i.test(item.title)));
  const quality = result.sections.find(item => item.id === 'quality');
  assert.ok(quality.details.some(line => /pic\(s\) isolé\(s\)/.test(line)));
});

test('ne propose pas de comparer les vitesses sans comparaison horaire exploitable', () => {
  const rows = makeHistory();
  const oneDay = rows.slice(0, 24);
  const result = buildVmiAssistantSummary(oneDay);
  assert.ok(!result.recommendations.some(item => /comparaisons de vitesses/i.test(item.title)));
});


test('le bilan simple refuse de départager les vitesses avec moins de cinq jours communs', () => {
  const rows = makeHistory().slice(0, 4 * 24);
  const result = buildVmiAssistantSummary(rows);
  const balance = result.recommendations.find(item => item.title === 'Bilan simple de la période');
  assert.ok(balance);
  assert.match(balance.text, /Pas encore assez de recul pour départager les vitesses/);
  assert.ok(!result.recommendations.some(item => /Examiner les comparaisons de vitesses/.test(item.title)));
});
