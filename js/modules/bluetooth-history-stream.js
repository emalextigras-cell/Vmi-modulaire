/**
 * Contrôle l'ordre et la complétude des fragments d'historique VMI.
 * La capture observée montre des fragments indexés 0, 10, 20, 30 et 40
 * pour les lignes de données. Les blocs de métadonnées initiaux peuvent
 * n'avoir qu'un fragment : le contrôle de fin ne s'applique qu'aux payloads
 * qui commencent effectivement par une date VMI.
 */
export function createHistoryStreamState() {
  return {
    sequence: null,
    expectedChunk: 0,
    skippedSequence: null,
    fragments: new Map(),
    gapCount: 0,
    linePrefix: '',
    lineHasDate: false
  };
}

const DATE_PREFIX = /^\n?\d{1,2}\/\d{1,2}\/\d{4} \d{1,2}:\d{2}:\d{2};/;

/** Une ligne de données observée est complète après réception du fragment 40. */
export function isCurrentHistoryRecordComplete(state) {
  return !!state && state.lineHasDate === true && state.expectedChunk >= 50;
}

export function acceptHistoryFragment(state, fragment) {
  const sequence = Number(fragment?.sequence);
  const chunkIndex = Number(fragment?.chunkIndex);
  const payload = String(fragment?.payload ?? '');
  if (!Number.isInteger(sequence) || sequence < 0 ||
      !Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex % 10 !== 0) {
    state.gapCount++;
    if (Number.isInteger(sequence) && sequence >= 0 && (state.sequence === null || sequence >= state.sequence)) {
      state.sequence = sequence;
      state.expectedChunk = 0;
      state.skippedSequence = sequence;
      state.linePrefix = '';
      state.lineHasDate = false;
    }
    return { accepted: false, duplicate: false, gap: true, resetBuffer: true };
  }

  const key = sequence + ':' + chunkIndex;
  if (state.fragments.has(key)) {
    if (state.fragments.get(key) === payload) {
      return { accepted: false, duplicate: true, gap: false, resetBuffer: false };
    }
    state.gapCount++;
    state.skippedSequence = sequence;
    return { accepted: false, duplicate: false, gap: true, resetBuffer: true };
  }

  let gap = false;
  let resetBuffer = false;
  if (state.sequence === null) {
    if (sequence !== 0 || chunkIndex !== 0) gap = true;
    state.sequence = sequence;
    state.expectedChunk = 0;
  } else if (sequence < state.sequence) {
    state.gapCount++;
    return { accepted: false, duplicate: false, gap: true, resetBuffer: false };
  } else if (sequence > state.sequence) {
    const missingTail = state.lineHasDate && state.expectedChunk < 50;
    if (missingTail) {
      gap = true;
      state.gapCount++;
    }
    if (sequence !== state.sequence + 1 || chunkIndex !== 0) {
      if (!gap) state.gapCount++;
      gap = true;
    }
    state.sequence = sequence;
    state.expectedChunk = 0;
    state.skippedSequence = null;
    state.linePrefix = '';
    state.lineHasDate = false;
    resetBuffer = gap || missingTail;
  }

  if (gap && chunkIndex !== 0) {
    state.skippedSequence = sequence;
    return { accepted: false, duplicate: false, gap: true, resetBuffer: true };
  }

  if (state.skippedSequence === sequence) {
    return { accepted: false, duplicate: false, gap: false, resetBuffer: false };
  }

  if (chunkIndex !== state.expectedChunk) {
    state.gapCount++;
    state.skippedSequence = sequence;
    return { accepted: false, duplicate: false, gap: true, resetBuffer: true };
  }

  state.fragments.set(key, payload);
  state.expectedChunk += 10;
  if (state.linePrefix.length < 64) {
    state.linePrefix = (state.linePrefix + payload).slice(0, 64);
    state.lineHasDate = DATE_PREFIX.test(state.linePrefix);
  }
  return { accepted: true, duplicate: false, gap, resetBuffer };
}

/** Les relevés issus d'un transfert incomplet ne peuvent pas servir de borne d'arrêt. */
export function isHistorySyncBaseline(record) {
  return !!record && record.syncPartial !== true;
}

/** Marque les lignes reçues selon que le transfert entier est certifié ou non. */
export function markHistoryRows(records, complete) {
  return (Array.isArray(records) ? records : []).map(record => ({
    ...record,
    syncPartial: !complete
  }));
}

/** Signale une notification d'historique tronquée dont les index ne sont pas lisibles. */
export function markHistoryStreamInvalid(state) {
  state.gapCount++;
  if (state.sequence !== null) state.skippedSequence = state.sequence;
  return { accepted: false, duplicate: false, gap: true, resetBuffer: true };
}
