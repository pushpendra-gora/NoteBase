'use client';

import { NoteDocument } from '../types';

const DB_NAME = 'notebase_offline_files_db';
const DB_VERSION = 1;
const STORE_NAME = 'files';

interface StoredOfflineFileRecord {
  id: string;
  blob: Blob;
  mimeType: string;
  title?: string;
  cachedAt: number;
}

/**
 * Returns true ONLY when running inside the NoteBase Student Android App WebView
 * (where `window.NoteBaseAndroid` interface is injected). Normal desktop/mobile
 * web browsers return false so local offline file caching stays app-only.
 */
export function isAndroidStudentApp(): boolean {
  return typeof window !== 'undefined' && Boolean((window as any).NoteBaseAndroid);
}

function openOfflineDb(): Promise<IDBDatabase | null> {
  if (!isAndroidStudentApp() || typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveOfflineFileBlob(
  docId: string,
  blob: Blob,
  mimeType: string,
  title?: string
): Promise<boolean> {
  if (!docId || !blob || blob.size <= 0) return false;
  const db = await openOfflineDb();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record: StoredOfflineFileRecord = {
        id: docId,
        blob,
        mimeType: mimeType || blob.type || 'application/octet-stream',
        title,
        cachedAt: Date.now(),
      };
      store.put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function getOfflineFileBlob(
  docId: string
): Promise<{ blob: Blob; mimeType: string; cachedAt: number } | null> {
  if (!docId) return null;
  const db = await openOfflineDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(docId);
      req.onsuccess = () => {
        const res = req.result as StoredOfflineFileRecord | undefined;
        if (res && res.blob instanceof Blob && res.blob.size > 0) {
          resolve({ blob: res.blob, mimeType: res.mimeType, cachedAt: res.cachedAt });
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function getAllOfflineBlobIds(): Promise<string[]> {
  const db = await openOfflineDb();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAllKeys();
      req.onsuccess = () => {
        const keys = Array.isArray(req.result) ? req.result.map((k) => String(k)) : [];
        resolve(keys);
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function removeOfflineFileBlob(docId: string): Promise<void> {
  if (!docId) return;
  const db = await openOfflineDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(docId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Returns all document metadata entries that were previously opened by the student
 * and saved in `notebase_cached_pdf_docs`.
 */
export function getSavedOfflineDocsMap(): Record<string, NoteDocument> {
  if (!isAndroidStudentApp()) return {};
  try {
    const raw = localStorage.getItem('notebase_cached_pdf_docs');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, NoteDocument>) : {};
  } catch {
    return {};
  }
}

export function getSavedCachedIdSet(): Set<string> {
  if (!isAndroidStudentApp()) return new Set();
  try {
    const raw = localStorage.getItem('notebase_cached_pdf_ids');
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map((id) => String(id))) : new Set();
  } catch {
    return new Set();
  }
}

export function markDocAsCachedOffline(docId: string) {
  if (!isAndroidStudentApp() || !docId) return;
  try {
    const ids = getSavedCachedIdSet();
    if (!ids.has(docId)) {
      ids.add(docId);
      localStorage.setItem('notebase_cached_pdf_ids', JSON.stringify(Array.from(ids)));
    }
  } catch {}
}

export function isDeviceOffline(): boolean {
  if (typeof window === 'undefined') return false;
  const bridge = (window as any).NoteBaseAndroid;
  const bridgeOnline = bridge?.isNetworkConnected ? Boolean(bridge.isNetworkConnected()) : true;
  return !navigator.onLine || !bridgeOnline;
}
