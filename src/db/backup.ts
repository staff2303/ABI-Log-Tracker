import { BACKUP_FORMAT, BACKUP_VERSION, CURRENT_SCHEMA_VERSION } from "./constants";
import { getAllRaids } from "./raidRepository";
import { getAllMappings } from "./mappingRepository";
import { loadTrackerState } from "./sqliteState";
import { invokeCommand } from "./tauriClient";
import type { BackupImportSummary, BackupPayload } from "./types";

export async function createBackupPayload(): Promise<BackupPayload> {
  const state = await loadTrackerState();

  return {
    format: BACKUP_FORMAT,
    backupVersion: BACKUP_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    raids: await getAllRaids(),
    imports: state.sourceFiles,
    importHistory: state.importHistory,
    mappings: await getAllMappings(),
    settings: {},
  };
}

export async function exportBackupFile(): Promise<void> {
  const result = await invokeCommand<{ path: string; bytes: number }>("export_database_backup");
  window.alert(`DB 백업 완료\n${result.path}`);
}

export async function importBackupFile(file: File): Promise<BackupImportSummary> {
  const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
  await invokeCommand("restore_database_backup", { bytes });
  const state = await loadTrackerState();

  return {
    discoveredRaids: state.dbInfo.raidCount,
    insertedRaids: state.dbInfo.raidCount,
    sameRaids: 0,
    updatedRaids: 0,
    keptExistingRaids: 0,
    failedRaids: 0,
    totalStoredRaids: state.dbInfo.raidCount,
    importedFiles: state.sourceFiles.length,
    importedMappings: state.mappings.length,
  };
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
