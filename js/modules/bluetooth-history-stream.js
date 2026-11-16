/**
 * Contrôle l'ordre des fragments d'historique observés dans les notifications VMI.
 * Les captures montrent un index de ligne (octets 9-10) et un index de fragment
 * (octets 12-13) progressant par pas de 10. Cette garde ne reconstitue pas le
 * protocole : elle détecte uniquement les répétitions, trous et désordres observés.
 */
export function createHistoryStreamState() {
  return {
    sequence: null,
    expectedChunk: 0,
    skippedSequence: null,
    fragments: new Map(),
    gapCount: 0
  };
}

export function acceptHistoryFragment(state, fragment) {
  const sequence = Number(fragment?.sequence);
  const chunkIndex = Number(fragment?.chunkIndex);
  const payload = String(fragment?.payload ?? '');
  if (!Number.isInteger(sequence) || sequence < 0 ||
      !Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex % 10 !== 0) {
    state.gapCount++;
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
    if (sequence !== state.sequence + 1 || chunkIndex !== 0) gap = true;
    state.sequence = sequence;
    state.expectedChunk = 0;
    state.skippedSequence = null;
    resetBuffer = gap;
  }

  if (gap) {
    state.gapCount++;
    if (chunkIndex !== 0) {
      state.skippedSequence = sequence;
      return { accepted: false, duplicate: false, gap: true, resetBuffer: true };
    }
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
  return { accepted: true, duplicate: false, gap, resetBuffer };
}
