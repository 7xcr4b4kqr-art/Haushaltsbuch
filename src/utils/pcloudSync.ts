import { BudgetDatabase } from '../types/budget';
import { getTodayISO } from './format';
import {
  exportDatabaseToJson,
  validateAndNormalizeDatabase,
} from './storage';

export const PCLOUD_FILENAME = 'vto-haushaltsuebersicht.json';

const IDB_NAME = 'vto_pcloud_fs_db';
const IDB_STORE = 'handles';
const IDB_KEY = 'pcloud_directory';

type PermissionStateValue = 'granted' | 'denied' | 'prompt';

interface DirectoryHandleWithPermission extends FileSystemDirectoryHandle {
  queryPermission?: (descriptor: {
    mode: 'read' | 'readwrite';
  }) => Promise<PermissionStateValue>;
  requestPermission?: (descriptor: {
    mode: 'read' | 'readwrite';
  }) => Promise<PermissionStateValue>;
}

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: 'read' | 'readwrite';
    startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
  }) => Promise<FileSystemDirectoryHandle>;
}

export function isFileSystemAccessSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as DirectoryPickerWindow;
  return typeof win.showDirectoryPicker === 'function';
}

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB nicht verfügbar.'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB-Fehler.'));
  });
}

export async function getStoredDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openHandleDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_KEY);
      req.onsuccess = () => {
        const result = req.result as FileSystemDirectoryHandle | undefined;
        resolve(result ?? null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function storeDirectoryHandle(
  handle: FileSystemDirectoryHandle
): Promise<void> {
  const db = await openHandleDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    const req = store.put(handle, IDB_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('Speicherfehler.'));
  });
}

export async function clearStoredDirectoryHandle(): Promise<void> {
  try {
    const db = await openHandleDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.delete(IDB_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch {
    // Ignore cleanup errors
  }
}

async function verifyDirectoryPermission(
  handle: FileSystemDirectoryHandle,
  mode: 'read' | 'readwrite'
): Promise<boolean> {
  const ext = handle as DirectoryHandleWithPermission;
  if (typeof ext.queryPermission === 'function') {
    const current = await ext.queryPermission({ mode });
    if (current === 'granted') return true;
  }
  if (typeof ext.requestPermission === 'function') {
    const requested = await ext.requestPermission({ mode });
    return requested === 'granted';
  }
  return true;
}

export type ConnectFolderResult =
  | { status: 'connected'; handle: FileSystemDirectoryHandle }
  | { status: 'cancelled' }
  | { status: 'unsupported'; reason: string };

export async function connectPcloudDirectory(): Promise<ConnectFolderResult> {
  const win = window as DirectoryPickerWindow;
  if (typeof win.showDirectoryPicker !== 'function') {
    return {
      status: 'unsupported',
      reason:
        'Dieser Browser unterstützt die direkte Ordner-Verknüpfung nicht (z. B. Safari/iPad). Nutzen Sie stattdessen den klassischen Datei-Export/Import.',
    };
  }

  try {
    const handle = await win.showDirectoryPicker({
      id: 'vto_pcloud_dir',
      mode: 'readwrite',
      startIn: 'documents',
    });
    await storeDirectoryHandle(handle);
    return { status: 'connected', handle };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { status: 'cancelled' };
    }
    if (err instanceof DOMException && err.name === 'SecurityError') {
      return {
        status: 'unsupported',
        reason:
          'Die direkte Ordner-Auswahl ist in dieser eingebetteten Ansicht blockiert. Öffnen Sie die App in einem eigenen Browser-Tab oder nutzen Sie den klassischen JSON-Download.',
      };
    }
    return {
      status: 'unsupported',
      reason:
        'Der Ordner konnte nicht direkt verknüpft werden. Nutzen Sie alternativ den JSON-Download.',
    };
  }
}

export type DirectSaveResult =
  | { status: 'saved'; folderName: string; fileName: string }
  | { status: 'no-folder' }
  | { status: 'permission-denied' }
  | { status: 'error'; message: string };

export async function saveDatabaseToDirectory(
  handle: FileSystemDirectoryHandle,
  db: BudgetDatabase
): Promise<DirectSaveResult> {
  try {
    const granted = await verifyDirectoryPermission(handle, 'readwrite');
    if (!granted) {
      return { status: 'permission-denied' };
    }

    const fileHandle = await handle.getFileHandle(PCLOUD_FILENAME, {
      create: true,
    });
    const writable = await fileHandle.createWritable();
    await writable.write(exportDatabaseToJson(db));
    await writable.close();

    return {
      status: 'saved',
      folderName: handle.name,
      fileName: PCLOUD_FILENAME,
    };
  } catch (err) {
    return {
      status: 'error',
      message:
        err instanceof Error
          ? err.message
          : 'Die Datei konnte im verknüpften Ordner nicht geschrieben werden.',
    };
  }
}

export type DirectLoadResult =
  | { status: 'loaded'; db: BudgetDatabase; folderName: string; fileName: string }
  | { status: 'not-found'; folderName: string }
  | { status: 'permission-denied' }
  | { status: 'invalid' }
  | { status: 'error'; message: string };

export async function loadDatabaseFromDirectory(
  handle: FileSystemDirectoryHandle
): Promise<DirectLoadResult> {
  try {
    const granted = await verifyDirectoryPermission(handle, 'read');
    if (!granted) {
      return { status: 'permission-denied' };
    }

    let fileHandle: FileSystemFileHandle;
    try {
      fileHandle = await handle.getFileHandle(PCLOUD_FILENAME, { create: false });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotFoundError') {
        return { status: 'not-found', folderName: handle.name };
      }
      throw err;
    }

    const file = await fileHandle.getFile();
    const text = await file.text();
    const parsed = JSON.parse(text) as unknown;
    const validated = validateAndNormalizeDatabase(parsed);
    if (!validated) {
      return { status: 'invalid' };
    }

    return {
      status: 'loaded',
      db: validated,
      folderName: handle.name,
      fileName: PCLOUD_FILENAME,
    };
  } catch (err) {
    return {
      status: 'error',
      message:
        err instanceof Error
          ? err.message
          : 'Die Datei konnte aus dem verknüpften Ordner nicht gelesen werden.',
    };
  }
}

export function triggerClassicJsonDownload(db: BudgetDatabase): void {
  const json = exportDatabaseToJson(db);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vto-haushaltsuebersicht-${getTodayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
