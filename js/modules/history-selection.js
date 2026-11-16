/** Sélectionne les relevés affichés sans modifier l'historique source. */
import { dayStart, shiftDay, MIN_VALID } from './date-utils.js';

export function selectDataRange(records, { selectedDate = null, daysSetting = 30 } = {}) {
  const data = (Array.isArray(records) ? records : [])
    .filter(record => record && record.t >= MIN_VALID)
    .sort((a, b) => a.t - b.t);

  if (selectedDate) {
    const start = dayStart(selectedDate);
    const end = dayStart(shiftDay(selectedDate, 1));
    return data.filter(record => record.t >= start && record.t < end);
  }

  if (daysSetting && data.length) {
    const end = data[data.length - 1].t;
    return data.filter(record => record.t >= end - daysSetting * 86400000);
  }

  return data;
}
