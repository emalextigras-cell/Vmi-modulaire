import { buildVmiAssistantSummary } from './assistant-summary.js';

export function renderVmiAssistant(data, {
  documentRef = globalThis.document,
  targetRH = 50,
  minSamples = 10,
  energyReadings = [],
  meterHistory = [],
  onError = () => {}
} = {}) {
  const get = id => documentRef?.getElementById?.(id);
  const status = get('assistantStatus');
  const overview = get('assistantOverview');
  const recommendations = get('assistantRecommendations');
  const sections = get('assistantSections');
  const limits = get('assistantLimits');
  if (!status || !overview || !recommendations || !sections || !limits) return;

  try {
    const result = buildVmiAssistantSummary(data, {
      targetRH,
      minSamples,
      energyReadings,
      meterHistory
    });
    status.className = result.status === 'available'
      ? 'advice good'
      : result.status === 'no-data' ? 'advice warn' : 'advice';
    status.textContent = result.title + ' · ' + result.confidence;
    overview.textContent = result.overview;

    recommendations.replaceChildren();
    result.recommendations.forEach(item => {
      const article = documentRef.createElement('article');
      const tag = documentRef.createElement('span');
      const heading = documentRef.createElement('h4');
      const detail = documentRef.createElement('p');
      const reason = documentRef.createElement('p');
      article.className = 'diagnosis-item ' +
        (item.priority === 'prioritaire' ? 'diagnosis-caution'
          : item.priority === 'favorable' ? 'diagnosis-positive' : '');
      tag.className = 'diagnosis-tag';
      tag.textContent = item.priority;
      heading.textContent = item.title;
      detail.textContent = item.text;
      reason.className = 'diagnosis-action';
      reason.textContent = 'Pourquoi : ' + item.reason;
      article.append(tag, heading, detail, reason);
      recommendations.append(article);
    });

    sections.replaceChildren();
    result.sections.forEach(item => {
      const details = documentRef.createElement('details');
      const summary = documentRef.createElement('summary');
      const paragraph = documentRef.createElement('p');
      const list = documentRef.createElement('ul');
      details.className = 'assistant-detail';
      summary.textContent = item.title + ' · ' + item.status;
      paragraph.textContent = item.summary;
      item.details.forEach(line => {
        const li = documentRef.createElement('li');
        li.textContent = line;
        list.append(li);
      });
      details.append(summary, paragraph, list);
      sections.append(details);
    });

    limits.replaceChildren();
    result.limits.forEach(line => {
      const li = documentRef.createElement('li');
      li.textContent = line;
      limits.append(li);
    });
  } catch (error) {
    status.className = 'advice warn';
    status.textContent = 'L’assistant n’a pas pu terminer la synthèse. Les autres analyses de l’application restent disponibles.';
    overview.textContent = 'Erreur de synthèse : ' + String(error?.message || error);
    recommendations.replaceChildren();
    sections.replaceChildren();
    limits.replaceChildren();
    onError('Assistant VMI : ' + String(error?.message || error));
  }
}
