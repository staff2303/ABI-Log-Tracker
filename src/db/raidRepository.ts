import type { Raid } from "../types/raid";
import { CURRENT_PARSER_VERSION } from "./constants";
import { recordMappingDiscoveriesFromRaids, mergeImportedMappings } from "./mappingRepository";
import { createStoredRaid, mergeStoredRaid } from "./merge";
import {
  clearStores,
  countStore,
  getAllFromStore,
  getImportByHash,
  openTrackerDatabase,
  requestToPromise,
  runImportTransaction,
} from "./database";
import type {
  BackupImportSummary,
  ImportedSourceFile,
  ImportCommitSummary,
  ImportHistory,
  RaidMergeAction,
  RaidMergeConflict,
  StoredRaid,
} from "./types";

export async function getAllRaids(): Promise<StoredRaid[]> {
  const raids = await getAllFromStore<StoredRaid>("raids");
  return raids.sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime());
}

export async function getRaidCount(): Promise<number> {
  return countStore("raids");
}

export async function deleteRaid(matchKey: string): Promise<void> {
  const db = await openTrackerDatabase();

  await new Promise<void>((resolve, reject) => {
    const request = db.transaction("raids", "readwrite").objectStore("raids").delete(matchKey);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Failed to delete raid."));
  });
}

export async function clearTrackerDatabase(): Promise<void> {
  await clearStores(["raids", "imports", "importHistory", "settings", "mappings"]);
}

export async function findImportedSourceFileByHash(fileHash: string): Promise<ImportedSourceFile | null> {
  return getImportByHash(fileHash);
}

export async function getDuplicateImportState(fileHash: string): Promise<{
  sourceFile: ImportedSourceFile | null;
  hasStoredResult: boolean;
  historyCount: number;
  raidCount: number;
}> {
  const sourceFile = await getImportByHash(fileHash);

  if (!sourceFile) {
    return {
      sourceFile: null,
      hasStoredResult: false,
      historyCount: 0,
      raidCount: 0,
    };
  }

  const [histories, raids] = await Promise.all([
    getAllFromStore<ImportHistory>("importHistory"),
    getAllFromStore<StoredRaid>("raids"),
  ]);
  const historyCount = histories.filter((history) => history.sourceFileId === sourceFile.id).length;
  const raidCount = raids.filter((raid) => raid.sourceFileIds.includes(sourceFile.id)).length;

  return {
    sourceFile,
    hasStoredResult: historyCount > 0 || raidCount > 0,
    historyCount,
    raidCount,
  };
}

export async function getRecentImports(limit = 10): Promise<ImportHistory[]> {
  const imports = await getAllFromStore<ImportHistory>("importHistory");

  return imports
    .sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime())
    .slice(0, limit);
}

export async function getAllImportedSourceFiles(): Promise<ImportedSourceFile[]> {
  return getAllFromStore<ImportedSourceFile>("imports");
}

export async function getAllImportHistory(): Promise<ImportHistory[]> {
  return getAllFromStore<ImportHistory>("importHistory");
}

export async function commitParsedImport({
  raids,
  fileHash,
  file,
}: {
  raids: Raid[];
  fileHash: string;
  file: File;
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
    const result = await runImportTransaction(async ({ raids: raidStore, imports, importHistory }) => {
      await requestToPromise(imports.put(sourceFile));
      await requestToPromise(importHistory.put(history));

      for (const raid of raids) {
        try {
          const incoming = createStoredRaid(raid, sourceFile.id, now);
          const existing = ((await requestToPromise(raidStore.get(incoming.matchKey))) as StoredRaid | undefined) ?? null;
          const decision = mergeStoredRaid(existing, incoming, sourceFile, now);

          incrementHistory(history, decision.action);
          conflicts.push(...decision.conflicts);
          await requestToPromise(raidStore.put(decision.raid));
        } catch {
          history.failedRaids += 1;
        }
      }

      history.status = history.failedRaids > 0 ? "failed" : "completed";
      history.completedAt = new Date().toISOString();
      await requestToPromise(importHistory.put(history));
      const totalStoredRaids = await requestToPromise(raidStore.count());

      return {
        sourceFile,
        history: { ...history },
        totalStoredRaids,
        conflicts,
        mappingDiscovery: {
          newIds: 0,
          rediscoveredIds: 0,
          autoConfirmed: 0,
          unconfirmed: 0,
          conflicts: 0,
          processedOccurrences: 0,
        },
      };
    });

    return {
      ...result,
      mappingDiscovery: await recordMappingDiscoveriesFromRaids(raids, sourceFile.id),
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

  return runImportTransaction(async ({ raids: raidStore, imports: importStore, importHistory: historyStore }) => {
    for (const sourceFile of imports) {
      await requestToPromise(importStore.put(sourceFile));
    }

    for (const history of importHistory) {
      await requestToPromise(historyStore.put(history));
    }

    for (const raid of raids) {
      try {
        const existing = ((await requestToPromise(raidStore.get(raid.matchKey))) as StoredRaid | undefined) ?? null;
        const decision = mergeStoredRaid(existing, raid, imports[0] ?? fallbackSourceFile, now);

        incrementSummary(summary, decision.action);
        await requestToPromise(raidStore.put(decision.raid));
      } catch {
        summary.failedRaids += 1;
      }
    }

    summary.totalStoredRaids = await requestToPromise(raidStore.count());
    return { ...summary };
  });
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
  await runImportTransaction(async ({ imports, importHistory }) => {
    await requestToPromise(imports.put(sourceFile));
    await requestToPromise(importHistory.put(history));
  });
}

function createSourceFileId(fileHash: string): string {
  return `file-${fileHash.slice(0, 24)}`;
}

function createImportHistoryId(sourceFileId: string, importedAt: string): string {
  return `${sourceFileId}-${importedAt.replace(/[^A-Za-z0-9_-]+/g, "-")}`;
}

type ImportedMappingRecord = Parameters<typeof mergeImportedMappings>[0][number];
