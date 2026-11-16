/** Fonctions de formatage partagées par les vues de synthèse de l'assistant. */
export const fmt = (value, digits = 1) => Number.isFinite(value)
  ? Number(value).toLocaleString('fr-FR', { maximumFractionDigits: digits })
  : 'non disponible';
export const signed = (value, unit, digits = 1) => Number.isFinite(value)
  ? (value > 0 ? '+' : '') + fmt(value, digits) + ' ' + unit
  : 'non disponible';
export const dateLabel = timestamp => Number.isFinite(timestamp)
  ? new Date(timestamp).toLocaleDateString('fr-FR')
  : 'date inconnue';
export const percent = value => Number.isFinite(value) ? fmt(value, 1) + ' %' : 'non disponible';
export const duration = hours => {
  if (!Number.isFinite(hours)) return 'non disponible';
  if (hours < 1) return fmt(hours * 60, 0) + ' min';
  return fmt(hours) + ' h';
};
export const section = (id, title, status, summary, details = []) => ({
  id, title, status, summary, details
});
export const recommendation = (priority, title, text, reason) => ({
  priority, title, text, reason
});
