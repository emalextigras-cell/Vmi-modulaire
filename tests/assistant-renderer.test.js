import test from 'node:test';
import assert from 'node:assert/strict';
import { renderVmiAssistant } from '../js/modules/assistant-renderer.js';

function makeElement() {
  return {
    className: '',
    textContent: '',
    children: [],
    replaceChildren() { this.children = []; },
    append(...items) { this.children.push(...items); }
  };
}

test('ne modifie rien lorsque les éléments de l’assistant sont absents', () => {
  assert.doesNotThrow(() => renderVmiAssistant([], {
    documentRef: { getElementById: () => null }
  }));
});

test('affiche un état explicite lorsque l’historique est vide', () => {
  const elements = new Map([
    'assistantStatus', 'assistantOverview', 'assistantRecommendations',
    'assistantSections', 'assistantLimits'
  ].map(id => [id, makeElement()]));
  const documentRef = {
    getElementById: id => elements.get(id),
    createElement: () => makeElement()
  };

  renderVmiAssistant([], { documentRef });

  assert.match(elements.get('assistantStatus').textContent, /aucun|historique|donnée/i);
  assert.ok(elements.get('assistantRecommendations').children.length > 0);
});
