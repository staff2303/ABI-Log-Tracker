import type { Raid } from "../types/raid";
import { CURRENT_MAPPING_SCANNER_VERSION, CURRENT_PARSER_VERSION } from "./constants";
import { recordMappingDiscoveries, recordMappingDiscoveriesFromRaids, mergeImportedMappings } from "./mappingRepository";
import { createStoredRaid, mergeStoredRaid } from "./merge";
import { collectMappingDiscoveriesFromRaids } from "./mappingDiscovery";
import type { MappingDiscoveryEntry } from "./mappingTypes";
import type {
  BackupImportSummary,
  ImportedSourceFile,
  ImportCommitSummary,
  ImportHistory,
  RaidMergeAction,
  RaidMergeConflict,
  StoredRaid,
} from "./types";
import { loadTrackerState } from "./sqliteState";
import { invokeCommand } from "./tauriClient";

export async function getAllRaids(): Promise<StoredRaid[]> {
  const state = await loadTrackerState();
  return state.raids.sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime());
}

export async function getRaidCount(): Promise<number> {
  const state = await loadTrackerState();
  return state.dbInfo.raidCount;
}

export async function deleteRaid(matchKey: string): Promise<void> {
  await invokeCommand("delete_raid_by_match_key", { matchKey });
}

export async function clearTrackerDatabase(scope: "records" | "all" = "records"): Promise<void> {
  await invokeCommand("clear_tracker_database", { scope });
}

export async function findImportedSourceFileByHash(fileHash: string): Promise<ImportedSourceFile | null> {
  const state = await loadTrackerState();
  return state.sourceFiles.find((sourceFile) => sourceFile.fileHash === fileHash) ?? null;
}

export async function getDuplicateImportState(fileHash: string): Promise<{
  sourceFile: ImportedSourceFile | null;
  hasStoredResult: boolean;
  historyCount: number;
  raidCount: number;
}> {
  const state = await loadTrackerState();
  const sourceFile = state.sourceFiles.find((item) => item.fileHash === fileHash) ?? null;

  if (!sourceFile) {
    return {
      sourceFile: null,
      hasStoredResult: false,
      historyCount: 0,
      raidCount: 0,
    };
  }

  const historyCount = state.importHistory.filter((history) => history.sourceFileId === sourceFile.id).length;
  const raidCount = state.raids.filter((raid) => raid.sourceFileIds.includes(sourceFile.id)).length;

  return {
    sourceFile,
    hasStoredResult: historyCount > 0 || raidCount > 0,
    historyCount,
    raidCount,
  };
}

export async function getRecentImports(limit = 10): Promise<ImportHistory[]> {
  const state = await loadTrackerState();
  return state.importHistory
    .sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime())
    .slice(0, limit);
}

export async function getAllImportedSourceFiles(): Promise<ImportedSourceFile[]> {
  return (await loadTrackerState()).sourceFiles;
}

export async function getAllImportHistory(): Promise<ImportHistory[]> {
  return (await loadTrackerState()).importHistory;
}

export async function commitParsedImport({
  raids,
  fileHash,
  file,
  mappingDiscoveries,
}: {
  raids: Raid[];
  fileHash: string;
  file: File;
  mappingDiscoveries?: MappingDiscoveryEntry[];
}): Promise<ImportCommitSummary> {
  const now = new Date().toISOString();
  const sourceFile: ImportedSourceFile = {
    id: createSourceFileId(fileHash),
    fileHash,
    filename: file.name,
    fileSize: file.size,
    lastModified: file.lastModified || null,
    importedAt: now,
    parserVersion: CURRENT_PARSER_VERSION,
    mappingScannerVersion: CURRENT_MAPPING_SCANNER_VERSION,
  };
  const history: ImportHistory = {
    id: createImportHistoryId(sourceFile.id, now),
    sourceFileId: sourceFile.id,
    filename: file.name,
    startedAt: now,
    completedAt: null,
    parserVersion: CURRENT_PARSER_VERSION,
    discoveredRaids: raids.length,
    insertedRaids: 0,
    sameRaids: 0,
    updatedRaids: 0,
    keptExistingRaids: 0,
    failedRaids: 0,
    status: "processing",
    errorMessage: null,
  };
  const conflicts: RaidMergeConflict[] = [];

  try {
    const existingRaids = new Map((await getAllRaids()).map((raid) => [raid.matchKey, raid]));
    const raidsToPersist: StoredRaid[] = [];

    for (const raid of raids) {
      try {
        const incoming = createStoredRaid(raid, sourceFile.id, now);
        const existing = existingRaids.get(incoming.matchKey) ?? null;
        const decision = mergeStoredRaid(existing, incoming, sourceFile, now);

        incrementHistory(history, decision.action);
        conflicts.push(...decision.conflicts);
        raidsToPersist.push(decision.raid);
        existingRaids.set(decision.raid.matchKey, decision.raid);
      } catch {
        history.failedRaids += 1;
      }
    }

    history.status = history.failedRaids > 0 ? "failed" : "completed";
    history.completedAt = new Date().toISOString();
    await writeImportPayload(sourceFile, history, raidsToPersist);

    return {
      sourceFile,
      history: { ...history },
      totalStoredRaids: existingRaids.size,
      conflicts,
      mappingDiscovery: await recordMappingDiscoveries(
        mappingDiscoveries && mappingDiscoveries.length > 0
          ? mappingDiscoveries
          : collectMappingDiscoveriesFromRaids(raids),
        sourceFile.id,
        mappingDiscoveries && mappingDiscoveries.length > 0 ? CURRENT_MAPPING_SCANNER_VERSION : null,
      ),
    };
  } catch (error) {
    const failedHistory: ImportHistory = {
      ...history,
      status: "failed",
      completedAt: new Date().toISOString(),
      errorMessage: error instanceof Error ? error.message : String(error),
    };

    await writeFailedImportHistory(sourceFile, failedHistory);
    throw error;
  }
}

export async function mergeStoredRaidsFromBackup(
  raids: StoredRaid[],
  imports: ImportedSourceFile[],
  importHistory: ImportHistory[],
): Promise<BackupImportSummary> {
  const now = new Date().toISOString();
  const fallbackSourceFile: ImportedSourceFile = {
    id: `backup-${now}`,
    fileHash: `backup-${now}`,
    filename: "Backup Import",
    fileSize: 0,
    lastModified: null,
    importedAt: now,
    parserVersion: CURRENT_PARSER_VERSION,
    mappingScannerVersion: null,
  };
  const backupHistory: ImportHistory = {
    id: createImportHistoryId(fallbackSourceFile.id, now),
    sourceFileId: fallbackSourceFile.id,
    filename: fallbackSourceFile.filename,
    startedAt: now,
    completedAt: now,
    parserVersion: CURRENT_PARSER_VERSION,
    discoveredRaids: raids.length,
    insertedRaids: 0,
    sameRaids: 0,
    updatedRaids: 0,
    keptExistingRaids: 0,
    failedRaids: 0,
    status: "completed",
    errorMessage: null,
  };
  const summary: BackupImportSummary = {
    discoveredRaids: raids.length,
    insertedRaids: 0,
    sameRaids: 0,
    updatedRaids: 0,
    keptExistingRaids: 0,
    failedRaids: 0,
    totalStoredRaids: 0,
    importedFiles: imports.length,
    importedMappings: 0,
  };

  for (const sourceFile of imports) {
    const matchingHistory =
      importHistory.find((history) => history.sourceFileId === sourceFile.id) ??
      createSyntheticImportHistory(sourceFile, now);
    await writeImportPayload(sourceFile, matchingHistory, []);
  }

  const knownSourceIds = new Set([...imports.map((sourceFile) => sourceFile.id), fallbackSourceFile.id]);
  const existingRaids = new Map((await getAllRaids()).map((raid) => [raid.matchKey, raid]));
  const raidsToPersist: StoredRaid[] = [];

  for (const raid of raids) {
    try {
      const sourceFile =
        imports.find((item) => raid.sourceFileIds.includes(item.id)) ??
        fallbackSourceFile;
      const existing = existingRaids.get(raid.matchKey) ?? null;
      const normalizedRaid = {
        ...raid,
        sourceFileIds: [...new Set([...raid.sourceFileIds.filter((id) => knownSourceIds.has(id)), sourceFile.id])],
      };
      const decision = mergeStoredRaid(existing, normalizedRaid, sourceFile, now);

      incrementSummary(summary, decision.action);
      raidsToPersist.push(decision.raid);
      existingRaids.set(decision.raid.matchKey, decision.raid);
    } catch {
      summary.failedRaids += 1;
    }
  }

  backupHistory.insertedRaids = summary.insertedRaids;
  backupHistory.sameRaids = summary.sameRaids;
  backupHistory.updatedRaids = summary.updatedRaids;
  backupHistory.keptExistingRaids = summary.keptExistingRaids;
  backupHistory.failedRaids = summary.failedRaids;
  backupHistory.status = summary.failedRaids > 0 ? "failed" : "completed";

  await writeImportPayload(fallbackSourceFile, backupHistory, raidsToPersist);
  summary.totalStoredRaids = existingRaids.size;
  return { ...summary };
}

export async function mergeStoredRaidsAndMappingsFromBackup(
  raids: StoredRaid[],
  imports: ImportedSourceFile[],
  importHistory: ImportHistory[],
  mappings: ImportedMappingRecord[],
): Promise<BackupImportSummary> {
  const summary = await mergeStoredRaidsFromBackup(raids, imports, importHistory);
  const mappingSummary = await mergeImportedMappings(mappings);
  await recordMappingDiscoveriesFromRaids(raids, "backup-import");

  return {
    ...summary,
    importedMappings: mappingSummary.inserted + mappingSummary.updated,
  };
}

async function writeImportPayload(sourceFile: ImportedSourceFile, history: ImportHistory, raids: StoredRaid[]): Promise<void> {
  await invokeCommand("commit_import_payload", {
    sourceFile,
    history,
    raids,
  });
}

function incrementHistory(history: ImportHistory, action: RaidMergeAction): void {
  if (action === "INSERT") {
    history.insertedRaids += 1;
  } else if (action === "SAME") {
    history.sameRaids += 1;
  } else if (action === "UPDATE") {
    history.updatedRaids += 1;
  } else {
    history.keptExistingRaids += 1;
  }
}

function incrementSummary(summary: BackupImportSummary, action: RaidMergeAction): void {
  if (action === "INSERT") {
    summary.insertedRaids += 1;
  } else if (action === "SAME") {
    summary.sameRaids += 1;
  } else if (action === "UPDATE") {
    summary.updatedRaids += 1;
  } else {
    summary.keptExistingRaids += 1;
  }
}

async function writeFailedImportHistory(sourceFile: ImportedSourceFile, history: ImportHistory): Promise<void> {
  await writeImportPayload(sourceFile, history, []);
}

function createSyntheticImportHistory(sourceFile: ImportedSourceFile, now: string): ImportHistory {
  return {
    id: createImportHistoryId(sourceFile.id, now),
    sourceFileId: sourceFile.id,
    filename: sourceFile.filename,
    startedAt: sourceFile.importedAt || now,
    completedAt: sourceFile.importedAt || now,
    parserVersion: sourceFile.parserVersion,
    discoveredRaids: 0,
    insertedRaids: 0,
    sameRaids: 0,
    updatedRaids: 0,
    keptExistingRaids: 0,
    failedRaids: 0,
    status: "completed",
    errorMessage: null,
  };
}

function createSourceFileId(fileHash: string): string {
  return `file-${fileHash.slice(0, 24)}`;
}

function createImportHistoryId(sourceFileId: string, importedAt: string): string {
  return `${sourceFileId}-${importedAt.replace(/[^A-Za-z0-9_-]+/g, "-")}`;
}

type ImportedMappingRecord = Parameters<typeof mergeImportedMappings>[0][number];
