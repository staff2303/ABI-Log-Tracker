import { DB_NAME, DB_VERSION } from "./constants";
import type { MappingRecord } from "./mappingTypes";
import type { ImportedSourceFile, ImportHistory, StoredRaid } from "./types";

export type StoreName = "raids" | "imports" | "importHistory" | "settings" | "mappings";

let databasePromise: Promise<IDBDatabase> | null = null;

export function openTrackerDatabase(): Promise<IDBDatabase> {
  databasePromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains("raids")) {
        const raids = db.createObjectStore("raids", { keyPath: "matchKey" });
        raids.createIndex("startedAt", "startedAt");
        raids.createIndex("mapId", "mapId");
        raids.createIndex("mode", "mode");
        raids.createIndex("zone", "zone");
        raids.createIndex("result", "result");
        raids.createIndex("teamType", "teamType");
        raids.createIndex("parserVersion", "parserVersion");
      }

      if (!db.objectStoreNames.contains("imports")) {
        const imports = db.createObjectStore("imports", { keyPath: "id" });
        imports.createIndex("fileHash", "fileHash", { unique: true });
        imports.createIndex("importedAt", "importedAt");
        imports.createIndex("filename", "filename");
      }

      if (!db.objectStoreNames.contains("importHistory")) {
        const history = db.createObjectStore("importHistory", { keyPath: "id" });
        history.createIndex("startedAt", "startedAt");
        history.createIndex("sourceFileId", "sourceFileId");
        history.createIndex("status", "status");
      }

      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }

      if (!db.objectStoreNames.contains("mappings")) {
        const mappings = db.createObjectStore("mappings", { keyPath: "id" });
        mappings.createIndex("category", "category");
        mappings.createIndex("status", "status");
        mappings.createIndex("source", "source");
        mappings.createIndex("name", "name");
        mappings.createIndex("updatedAt", "updatedAt");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB."));
  });

  return databasePromise;
}

export async function getAllFromStore<T>(storeName: StoreName): Promise<T[]> {
  const db = await openTrackerDatabase();

  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error ?? new Error(`Failed to read ${storeName}.`));
  });
}

export async function countStore(storeName: StoreName): Promise<number> {
  const db = await openTrackerDatabase();

  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(`Failed to count ${storeName}.`));
  });
}

export async function getRaidByMatchKey(matchKey: string): Promise<StoredRaid | null> {
  return getByKey<StoredRaid>("raids", matchKey);
}

export async function getImportByHash(fileHash: string): Promise<ImportedSourceFile | null> {
  const db = await openTrackerDatabase();

  return new Promise((resolve, reject) => {
    const request = db.transaction("imports", "readonly").objectStore("imports").index("fileHash").get(fileHash);
    request.onsuccess = () => resolve((request.result as ImportedSourceFile | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("Failed to find source file by hash."));
  });
}

export async function getSetting<T>(key: string): Promise<T | null> {
  const record = await getByKey<{ key: string; value: T }>("settings", key);
  return record?.value ?? null;
}

export async function putSetting<T>(key: string, value: T): Promise<void> {
  const db = await openTrackerDatabase();

  await runTransaction(db, ["settings"], "readwrite", (tx) => {
    tx.objectStore("settings").put({ key, value });
  });
}

export async function clearStores(storeNames: StoreName[]): Promise<void> {
  const db = await openTrackerDatabase();

  return runTransaction(db, storeNames, "readwrite", (tx) => {
    storeNames.forEach((storeName) => {
      tx.objectStore(storeName).clear();
    });
  });
}

export async function runImportTransaction<T>(
  operation: (stores: {
    raids: IDBObjectStore;
    imports: IDBObjectStore;
    importHistory: IDBObjectStore;
  }) => Promise<T>,
): Promise<T> {
  const db = await openTrackerDatabase();

  return runTransaction(db, ["raids", "imports", "importHistory"], "readwrite", (tx) =>
    operation({
      raids: tx.objectStore("raids"),
      imports: tx.objectStore("imports"),
      importHistory: tx.objectStore("importHistory"),
    }),
  );
}

export async function runMappingTransaction<T>(
  operation: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await openTrackerDatabase();

  return runTransaction(db, ["mappings"], "readwrite", (tx) => operation(tx.objectStore("mappings")));
}

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

async function getByKey<T>(storeName: StoreName, key: IDBValidKey): Promise<T | null> {
  const db = await openTrackerDatabase();

  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).get(key);
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error(`Failed to read ${storeName}.`));
  });
}

function runTransaction<T>(
  db: IDBDatabase,
  storeNames: StoreName[],
  mode: IDBTransactionMode,
  operation: (tx: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    let operationResult: T;
    let operationSettled = false;

    tx.oncomplete = () => resolve(operationResult);
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed."));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted."));

    void Promise.resolve(operation(tx))
      .then((result) => {
        operationResult = result;
        operationSettled = true;
      })
      .catch((error) => {
        if (!operationSettled) {
          tx.abort();
        }
        reject(error instanceof Error ? error : new Error(String(error)));
      });
  });
}

export type { ImportedSourceFile, ImportHistory, MappingRecord, StoredRaid };
