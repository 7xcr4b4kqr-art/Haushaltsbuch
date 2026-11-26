/**
 * Kleine Promise-API über eine IndexedDB-Datenbank (Key-Value-Store).
 * Werte werden als strukturierte Objekte gespeichert (Structured Clone),
 * ein JSON.stringify ist nicht nötig.
 */

export const IDB_DB_NAME = 'vto_haushaltsbuch';
export const IDB_STORE_NAME = 'kv';
export const IDB_KEY_BUDGET = 'budget';
export const IDB_KEY_AVATARS = 'avatars';

const OPEN_TIMEOUT_MS = 5000;
const PROBE_KEY = '__probe__';

let dbPromise: Promise<IDBDatabase> | null = null;

export function isIndexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
      reject(new Error('IndexedDB nicht verfügbar.'));
      return;
    }
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('IndexedDB antwortet nicht (Zeitüberschreitung).'));
    }, OPEN_TIMEOUT_MS);

    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(IDB_DB_NAME, 1);
    } catch (err) {
      settled = true;
      clearTimeout(timer);
      reject(err instanceof Error ? err : new Error('IndexedDB-Fehler.'));
      return;
    }

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
        db.createObjectStore(IDB_STORE_NAME);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      if (settled) {
        // Zu spät geöffnet (nach Timeout): Verbindung wieder schließen.
        db.close();
        return;
      }
      settled = true;
      clearTimeout(timer);
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(req.error ?? new Error('IndexedDB konnte nicht geöffnet werden.'));
    };
    req.onblocked = () => {
      // Wartet auf andere Tabs; der Timeout greift, falls es hängen bleibt.
    };
  });
}

function getDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = openDatabase().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

export async function idbGet<T = unknown>(key: string): Promise<T | undefined> {
  const db = await getDb();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, 'readonly');
    const req = tx.objectStore(IDB_STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error ?? new Error('Lesen fehlgeschlagen.'));
    tx.onabort = () =>
      reject(tx.error ?? new Error('Lesevorgang abgebrochen.'));
  });
}

/** Schreibt einen Wert; das Promise erfüllt sich erst, wenn die Transaktion abgeschlossen ist. */
export async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Speichern fehlgeschlagen.'));
    tx.onabort = () =>
      reject(tx.error ?? new Error('Speichervorgang abgebrochen.'));
    try {
      tx.objectStore(IDB_STORE_NAME).put(value, key);
    } catch (err) {
      reject(err instanceof Error ? err : new Error('Speichern fehlgeschlagen.'));
    }
  });
}

export async function idbRemove(key: string): Promise<void> {
  const db = await getDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Löschen fehlgeschlagen.'));
    tx.onabort = () =>
      reject(tx.error ?? new Error('Löschvorgang abgebrochen.'));
    tx.objectStore(IDB_STORE_NAME).delete(key);
  });
}

/** Schreib-/Lesetest: true nur, wenn IndexedDB tatsächlich benutzbar ist. */
export async function idbSelfTest(): Promise<boolean> {
  if (!isIndexedDbAvailable()) return false;
  try {
    const token = `ok_${Date.now()}`;
    await idbSet(PROBE_KEY, { token });
    const back = await idbGet<{ token?: string }>(PROBE_KEY);
    await idbRemove(PROBE_KEY);
    return back?.token === token;
  } catch {
    return false;
  }
}

/** Nur für Tests: gecachte Verbindung verwerfen. */
export function resetIdbConnectionForTests(): void {
  if (dbPromise) {
    void dbPromise.then((db) => db.close()).catch(() => undefined);
  }
  dbPromise = null;
}
