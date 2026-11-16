/** Formatage des durées et des dates locales utilisées par l'interface. */
import { pad } from './date-utils.js';

export function formatDuration(ms) {
  const minutes = Math.round(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days) return days + ' j ' + (hours % 24) + ' h';
  if (hours) return hours + ' h ' + (minutes % 60) + ' min';
  return minutes + ' min';
}

export function localDateTimeValue(timestamp = Date.now()) {
  const date = new Date(timestamp);
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}
