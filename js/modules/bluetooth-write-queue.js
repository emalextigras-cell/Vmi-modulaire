/**
 * File d'écriture BLE séquentielle.
 * Les commandes conservent le délai historique de 350 ms et l'ordre d'arrivée.
 */
export function createBleWriteQueue({
  isConnected,
  getCharacteristic,
  getConnectionToken = () => null,
  sleep,
  onSuccess = () => {},
  onError = () => {},
  delayMs = 350
}) {
  let tail = Promise.resolve();

  function write(bytes) {
    // Une écriture appartient à la session active au moment de sa mise en file.
    const connectionToken = getConnectionToken();
    const task = tail.then(async () => {
      const ensureSession = () => {
        if (getConnectionToken() !== connectionToken || !isConnected()) {
          const error = new Error('Commande annulée : la connexion Bluetooth a changé ou a été interrompue.');
          error.code = 'BLE_SESSION_CHANGED';
          throw error;
        }
      };
      if (getConnectionToken() !== connectionToken) {
        const error = new Error('Commande annulée : la session Bluetooth a changé.');
        error.code = 'BLE_SESSION_CHANGED';
        throw error;
      }
      if (!isConnected()) throw new Error('VMI non connectée');
      const characteristic = getCharacteristic();
      if (!characteristic) throw new Error('Caractéristique Bluetooth indisponible.');

      if (characteristic.properties?.write &&
          typeof characteristic.writeValueWithResponse === 'function') {
        await characteristic.writeValueWithResponse(bytes);
      } else if (characteristic.properties?.writeWithoutResponse &&
                 typeof characteristic.writeValueWithoutResponse === 'function') {
        await characteristic.writeValueWithoutResponse(bytes);
      } else if (typeof characteristic.writeValue === 'function') {
        // Repli historique conservé pour les navigateurs exposant l'ancienne API.
        await characteristic.writeValue(bytes);
      } else {
        throw new Error('Cette caractéristique Bluetooth ne permet pas l’écriture.');
      }

      // Une réponse d'écriture tardive ne doit pas valider une ancienne session.
      ensureSession();
      onSuccess(bytes);
      await sleep(delayMs);
      // Le délai fait partie de la séquence : ne pas laisser la suite continuer
      // si la connexion a été perdue pendant cette attente.
      ensureSession();
      return true;
    });

    const result = task.catch(error => {
      onError(error);
      return false;
    });
    // La file reste utilisable même après un échec d'écriture.
    tail = result.then(() => undefined, () => undefined);
    return result;
  }

  return { write };
}
