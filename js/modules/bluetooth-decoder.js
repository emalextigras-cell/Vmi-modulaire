/**
 * Décodage pur des notifications VMI observées.
 * Les offsets et seuils de longueur reprennent strictement le parseur historique.
 * Aucune interprétation physique ni correction de valeur n'est ajoutée ici.
 */
export function decodeVmiNotification(input) {
  if (!input) return null;
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 3 || bytes[0] !== 0xA5 || bytes[1] !== 0xB6) return null;

  const type = bytes[2];

  if (type === 0x30) {
    if (bytes.length < 14) {
      return { kind: 'history', valid: false, length: bytes.length };
    }
    let end = 14;
    while (end < bytes.length && bytes[end] !== 0) end++;
    return {
      kind: 'history',
      valid: true,
      payload: bytes.slice(14, end),
      sequence: bytes[9] | (bytes[10] << 8),
      chunkIndex: bytes[12],
      received: bytes[9] | (bytes[10] << 8),
      final: bytes[13] === 1
    };
  }

  if (type === 0x01 && bytes.length > 53) {
    return {
      kind: 'state',
      filter: bytes[28],
      days: bytes[26],
      volume: bytes[22] | (bytes[23] << 8),
      maxTemperature: bytes[38],
      rawSpeed: bytes[34],
      boost: bytes[44],
      holiday: bytes[43]
    };
  }

  if (type === 0x02 && bytes.length > 13) {
    return { kind: 'room', temperature: bytes[11], humidity: bytes[13] };
  }

  if (type === 0x03 && bytes.length > 13) {
    return {
      kind: 'probes',
      firstTemperature: bytes[6],
      firstHumidity: bytes[8],
      secondTemperature: bytes[11],
      secondHumidity: bytes[13]
    };
  }

  if (type === 0x04 && bytes.length > 7) {
    return { kind: 'history-total', total: bytes[6] | (bytes[7] << 8) };
  }

  return { kind: 'unknown', type, length: bytes.length };
}
