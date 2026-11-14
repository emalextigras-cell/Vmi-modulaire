/** Persistance locale IndexedDB. Le schéma et les clés restent identiques à la v13. */
export function createStore({ databaseName, storeName, onError = () => {} }) {
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(databaseName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  let dbPromise = null;
  async function db() {
    if (!dbPromise) dbPromise = openDB().catch(error => { dbPromise = null; throw error; });
    return dbPromise;
  }
  async function get(key) {
    try {
      const database = await db();
      return await new Promise((resolve, reject) => {
        const req = database.transaction(storeName, 'readonly').objectStore(storeName).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch (error) { onError('IndexedDB lecture : ' + error.message); return null; }
  }
  async function set(key, value) {
    try {
      const database = await db();
      await new Promise((resolve, reject) => {
        const tx = database.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(value, key);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch (error) { onError('IndexedDB écriture : ' + error.message); }
  }
  /**
   * Écrit plusieurs clés dans une seule transaction : soit toutes sont validées,
   * soit IndexedDB annule l'ensemble. Utilisé pour les restaurations de sauvegarde.
   */
  async function setMany(entries) {
    if (!Array.isArray(entries) || entries.some(entry => !Array.isArray(entry) || entry.length !== 2)) {
      throw new TypeError('Écritures IndexedDB invalides.');
    }
    try {
      const database = await db();
      await new Promise((resolve, reject) => {
        const tx = database.transaction(storeName, 'readwrite');
        const objectStore = tx.objectStore(storeName);
        for (const [key, value] of entries) objectStore.put(value, key);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('Transaction IndexedDB échouée.'));
        tx.onabort = () => reject(tx.error || new Error('Transaction IndexedDB annulée.'));
      });
    } catch (error) {
      onError('IndexedDB restauration : ' + error.message);
      throw error;
    }
  }
  return { get, set, setMany };
}
