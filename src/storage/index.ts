import { SessionSchema, safeParseSchema, type Session } from "../lib/schema/learning";

const DB_NAME = "lear-by-ai";
const DB_VERSION = 1;
const SESSION_STORE = "sessions";
const META_STORE = "meta";
const META_KEY_SCHEMA = "schemaVersion";
const META_KEY_LAST_SESSION = "lastSessionId";
const MAX_SESSION_BYTES = 1_000_000;

type StorageResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

let dbPromise: Promise<IDBDatabase> | null = null;

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB error"));
  });
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        db.createObjectStore(SESSION_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = async () => {
      const db = request.result;
      try {
        await ensureSchemaVersion(db);
        resolve(db);
      } catch (error) {
        reject(error);
      }
    };
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
  });
  return dbPromise;
}

async function ensureSchemaVersion(db: IDBDatabase) {
  const current = await getMetaValue<number>(db, META_KEY_SCHEMA);
  if (current === undefined) {
    await setMetaValue(db, META_KEY_SCHEMA, 1);
    return;
  }
  if (current !== 1) {
    await clearStore(db, SESSION_STORE);
    await setMetaValue(db, META_KEY_SCHEMA, 1);
    await setMetaValue(db, META_KEY_LAST_SESSION, null);
  }
}

async function getMetaValue<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  const tx = db.transaction(META_STORE, "readonly");
  const store = tx.objectStore(META_STORE);
  const result = await requestToPromise(store.get(key));
  return result ? (result as { value: T }).value : undefined;
}

async function setMetaValue(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  const tx = db.transaction(META_STORE, "readwrite");
  const store = tx.objectStore(META_STORE);
  await requestToPromise(store.put({ key, value }));
}

async function clearStore(db: IDBDatabase, storeName: string): Promise<void> {
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);
  await requestToPromise(store.clear());
}

function ensurePayloadSize(session: Session): StorageResult<Session> {
  const payload = JSON.stringify(session);
  if (payload.length > MAX_SESSION_BYTES) {
    return { ok: false, error: `Session payload too large (${payload.length} bytes)` };
  }
  return { ok: true, value: session };
}

export async function saveSession(session: Session): Promise<StorageResult<Session>> {
  const parsed = safeParseSchema(SessionSchema, session);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }
  const sizeCheck = ensurePayloadSize(parsed.data);
  if (!sizeCheck.ok) return sizeCheck;

  try {
    const db = await openDb();
    const tx = db.transaction(SESSION_STORE, "readwrite");
    const store = tx.objectStore(SESSION_STORE);
    await requestToPromise(store.put(parsed.data));
    return { ok: true, value: parsed.data };
  } catch (error: any) {
    return { ok: false, error: error?.message ?? "Failed to save session" };
  }
}

export async function getSession(sessionId: string): Promise<StorageResult<Session | null>> {
  try {
    const db = await openDb();
    const tx = db.transaction(SESSION_STORE, "readonly");
    const store = tx.objectStore(SESSION_STORE);
    const result = await requestToPromise(store.get(sessionId));
    if (!result) return { ok: true, value: null };
    const parsed = safeParseSchema(SessionSchema, result);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    return { ok: true, value: parsed.data };
  } catch (error: any) {
    return { ok: false, error: error?.message ?? "Failed to load session" };
  }
}

export async function listSessions(): Promise<StorageResult<Session[]>> {
  try {
    const db = await openDb();
    const tx = db.transaction(SESSION_STORE, "readonly");
    const store = tx.objectStore(SESSION_STORE);
    const result = await requestToPromise(store.getAll());
    const sessions: Session[] = [];
    for (const item of result) {
      const parsed = safeParseSchema(SessionSchema, item);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      sessions.push(parsed.data);
    }
    return { ok: true, value: sessions };
  } catch (error: any) {
    return { ok: false, error: error?.message ?? "Failed to list sessions" };
  }
}

export async function deleteSession(sessionId: string): Promise<StorageResult<true>> {
  try {
    const db = await openDb();
    const tx = db.transaction(SESSION_STORE, "readwrite");
    const store = tx.objectStore(SESSION_STORE);
    await requestToPromise(store.delete(sessionId));
    const lastSession = await getLastSessionId();
    if (lastSession.ok && lastSession.value === sessionId) {
      await setLastSessionId(null);
    }
    return { ok: true, value: true };
  } catch (error: any) {
    return { ok: false, error: error?.message ?? "Failed to delete session" };
  }
}

export async function setLastSessionId(sessionId: string | null): Promise<StorageResult<true>> {
  try {
    const db = await openDb();
    await setMetaValue(db, META_KEY_LAST_SESSION, sessionId);
    return { ok: true, value: true };
  } catch (error: any) {
    return { ok: false, error: error?.message ?? "Failed to update last session id" };
  }
}

export async function getLastSessionId(): Promise<StorageResult<string | null>> {
  try {
    const db = await openDb();
    const value = await getMetaValue<string | null>(db, META_KEY_LAST_SESSION);
    return { ok: true, value: value ?? null };
  } catch (error: any) {
    return { ok: false, error: error?.message ?? "Failed to load last session id" };
  }
}

export async function clearAll(): Promise<StorageResult<true>> {
  try {
    const db = await openDb();
    await clearStore(db, SESSION_STORE);
    await clearStore(db, META_STORE);
    await setMetaValue(db, META_KEY_SCHEMA, 1);
    return { ok: true, value: true };
  } catch (error: any) {
    return { ok: false, error: error?.message ?? "Failed to clear storage" };
  }
}

export async function resetStorageForTests(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Failed to delete database"));
    request.onblocked = () => resolve();
  });
}

