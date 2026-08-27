import { loadDatabaseInfo, storageInfoFromDatabaseInfo } from "./sqliteState";
import { invokeCommand } from "./tauriClient";
import type { StorageInfo } from "./types";

export async function getStorageInfo(): Promise<StorageInfo> {
  return storageInfoFromDatabaseInfo(await loadDatabaseInfo());
}

export async function requestStoragePersistence(): Promise<boolean | null> {
  return true;
}

export async function openDatabaseFolder(): Promise<void> {
  await invokeCommand("open_database_folder");
}
