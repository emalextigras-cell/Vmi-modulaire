import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/modules/store.js';

function installIndexedDB({ fail = false } = {}) {
  const writes = [];
  const database = {
    objectStoreNames: { contains: () => true },
    transaction() {
      const tx = {
        error: fail ? new Error('quota exceeded') : null,
        objectStore() {
          return { put(value, key) { writes.push([key, value]); } };
        }
      };
      queueMicrotask(() => {
        if (fail) tx.onerror?.();
        else tx.oncomplete?.();
      });
      return tx;
    }
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  globalThis.indexedDB = {
    open() {
      const request = { result: database };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    }
  };
  return {
    writes,
    restore() {
      if (previous) Object.defineProperty(globalThis, 'indexedDB', previous);
      else delete globalThis.indexedDB;
    }
  };
}

test('setMany écrit toutes les clés dans une transaction unique', async () => {
  const mock = installIndexedDB();
  try {
    const store = createStore({ databaseName: 'test', storeName: 'data' });
    await store.setMany([['hist', [{ t: 1 }]], ['live', [{ t: 2 }]], ['meta', { lastSync: 3 }]]);
    assert.deepEqual(mock.writes.map(([key]) => key), ['hist', 'live', 'meta']);
    assert.equal(mock.writes[0][1][0].t, 1);
  } finally {
    mock.restore();
  }
});

test('setMany propage un échec de transaction au lieu de le masquer', async () => {
  const mock = installIndexedDB({ fail: true });
  const errors = [];
  try {
    const store = createStore({ databaseName: 'test', storeName: 'data', onError: message => errors.push(message) });
    await assert.rejects(store.setMany([['hist', []], ['live', []]]), /quota exceeded/);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /IndexedDB restauration/);
  } finally {
    mock.restore();
  }
});

test('setMany refuse une liste d’écritures mal formée', async () => {
  const mock = installIndexedDB();
  try {
    const store = createStore({ databaseName: 'test', storeName: 'data' });
    await assert.rejects(store.setMany([['hist']]), /Écritures IndexedDB invalides/);
    assert.equal(mock.writes.length, 0);
  } finally {
    mock.restore();
  }
});
