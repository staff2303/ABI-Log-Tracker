import { BACKUP_FORMAT, BACKUP_VERSION, CURRENT_SCHEMA_VERSION } from "./constants";
import {
  getAllImportedSourceFiles,
  getAllImportHistory,
  getAllRaids,
  mergeStoredRaidsAndMappingsFromBackup,
} from "./raidRepository";
import { getAllMappings } from "./mappingRepository";
import type { BackupImportSummary, BackupPayload } from "./types";

export async function createBackupPayload(): Promise<BackupPayload> {
  return {
    format: BACKUP_FORMAT,
    backupVersion: BACKUP_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    raids: await getAllRaids(),
    imports: await getAllImportedSourceFiles(),
    importHistory: await getAllImportHistory(),
    mappings: await getAllMappings(),
    settings: {},
  };
}

export async function exportBackupFile(): Promise<void> {
  const payload = await createBackupPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const stamp = payload.exportedAt.slice(0, 10);

  anchor.href = url;
  anchor.download = `ABITracker_Backup_${stamp}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importBackupFile(file: File): Promise<BackupImportSummary> {
  const text = await file.text();
  const payload = validateBackupPayload(JSON.parse(text) as unknown);
  return mergeStoredRaidsAndMappingsFromBackup(payload.raids, payload.imports, payload.importHistory, payload.mappings);
}

export function validateBackupPayload(value: unknown): BackupPayload {
  if (!isObject(value)) {
    throw new Error("Backup JSON must be an object.");
  }

  if (value.format !== BACKUP_FORMAT) {
    throw new Error("Backup format is not abi-tracker-backup.");
  }

  if (value.backupVersion !== BACKUP_VERSION && value.backupVersion !== 1) {
    throw new Error(`Unsupported backup version: ${String(value.backupVersion)}`);
  }

  if (!Array.isArray(value.raids) || !Array.isArray(value.imports) || !Array.isArray(value.importHistory)) {
    throw new Error("Backup is missing required raids/imports/importHistory arrays.");
  }

  if (!Array.isArray(value.mappings)) {
    value.mappings = [];
  }

  value.raids.forEach((raid, index) => {
    if (!isObject(raid) || typeof raid.matchKey !== "string" || !isObject(raid.basic)) {
      throw new Error(`Invalid raid record at index ${index}.`);
    }
  });

  return value as unknown as BackupPayload;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
