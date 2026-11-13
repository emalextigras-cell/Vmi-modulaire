/** Conversion des dates et des lignes d'export VMI+/tableur. */
import { DAY, pad, num } from './date-utils.js';

// Index des colonnes observés dans l'export CSV VMI+ utilisé pour la v13.
// La colonne 22 est explicitement nommée « Vitesse » dans l'en-tête de l'export.
const VMI_PLUS_COLUMN = Object.freeze({
  durationDays: 11,
  filter: 20,
  speed: 22,
  rpm: 25,
  probeTemp: 40,
  probeHumidity: 41,
  incomingTemp: 43,
  incomingHumidity: 44,
  salonTemp: 117,
  salonHumidity: 118
});

export function parseCell(value, spreadsheet = window.XLSX) {
  if (typeof value === 'number' && value > 30000 && spreadsheet) {
    const c = spreadsheet.SSF.parse_date_code(value);
    if (!c) return null;
    const swap = c.d <= 12, year = c.y, month = swap ? c.d : c.m, day = swap ? c.m : c.d, second = Math.round(c.S);
    return { t: new Date(year, month-1, day, c.H, c.M, second).getTime(),
      rk: `${pad(day)}/${pad(month)}/${year} ${pad(c.H)}:${pad(c.M)}:${pad(second)}` };
  }
  if (typeof value === 'string') {
    const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (m) return { t: new Date(+m[3], +m[2]-1, +m[1], +m[4], +m[5], +(m[6]||0)).getTime(),
      rk: `${pad(+m[1])}/${pad(+m[2])}/${m[3]} ${pad(+m[4])}:${m[5]}:${pad(+(m[6]||0))}` };
  }
  return null;
}

export function recFrom(row, spreadsheet = window.XLSX) {
  const parsed = parseCell(row[0], spreadsheet);
  if (!parsed) return null;
  const record = {
    t: parsed.t,
    rk: parsed.rk,
    d: num(row[VMI_PLUS_COLUMN.durationDays]),
    st: num(row[VMI_PLUS_COLUMN.salonTemp]),
    sh: num(row[VMI_PLUS_COLUMN.salonHumidity]),
    t1: num(row[VMI_PLUS_COLUMN.probeTemp]),
    h1: num(row[VMI_PLUS_COLUMN.probeHumidity]),
    te: num(row[VMI_PLUS_COLUMN.incomingTemp]),
    he: num(row[VMI_PLUS_COLUMN.incomingHumidity]),
    rpm: num(row[VMI_PLUS_COLUMN.rpm]),
    fil: num(row[VMI_PLUS_COLUMN.filter]),
    // Valeur brute conservée, sans l'assimiler aux vitesses manuelles 1/2/3 de l'interface.
    vmiSpeedRaw: num(row[VMI_PLUS_COLUMN.speed]),
    // Valeur de la colonne « Debit » de l'export ; aucune unité n'est supposée.
    debit: num(row[23]),
    vit: null,
    boost: null,
    hol: null
  };
  return ['st','sh','t1','h1','te','he','rpm','fil'].some(key=>record[key]!=null) ? record : null;
}

export const dayNumber = timestamp => {
  const d = new Date(timestamp);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
};
