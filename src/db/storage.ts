import type { StorageInfo } from "./types";

export async function getStorageInfo(): Promise<StorageInfo> {
  const estimate = await navigator.storage?.estimate?.();
  const persisted = await navigator.storage?.persisted?.();

  return {
    persisted: persisted ?? null,
    usage: estimate?.usage ?? null,
    quota: estimate?.quota ?? null,
  };
}

export async function requestStoragePersistence(): Promise<boolean | null> {
  if (!navigator.storage?.persist) {
    return null;
  }

  return navigator.storage.persist();
}
