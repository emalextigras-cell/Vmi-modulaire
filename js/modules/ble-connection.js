export function shouldReconnectAfterDisconnect({ manualDisconnect, intentionalDisconnect, hasDevice }) {
  return !manualDisconnect && !intentionalDisconnect && hasDevice;
}

export function createConnectionGate() {
  let pending = null;
  return async function runConnection(task) {
    if (pending) return pending;
    const attempt = Promise.resolve().then(task);
    pending = attempt;
    try {
      return await attempt;
    } finally {
      if (pending === attempt) pending = null;
    }
  };
}
