import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "./components/layout/AppShell";
import { DashboardPage } from "./components/dashboard/DashboardPage";
import { LocalDatabasePage } from "./components/database/LocalDatabasePage";
import { MappingManagementPage } from "./components/mapping/MappingManagementPage";
import { ImportPage } from "./components/import/ImportPage";
import { RaidDetailPage } from "./components/raid/RaidDetailPage";
import { exportBackupFile, importBackupFile } from "./db/backup";
import {
  clearTrackerDatabase,
  deleteRaid,
  getAllImportedSourceFiles,
  getAllRaids,
  getRecentImports,
} from "./db/raidRepository";
import {
  bulkUpdateMappingCategory,
  discoverMappingsForExistingRaidsOnce,
  ensureBuiltInMappingsSeeded,
  exportMappingFile,
  getAllMappings,
  importMappingFile,
  rediscoverMappingsForExistingRaids,
  resetOrDeleteMapping,
  saveMapping,
} from "./db/mappingRepository";
import { getStorageInfo, requestStoragePersistence } from "./db/storage";
import { createMappingResolver } from "./data/mappingResolver";
import type { MappingCategory } from "./db/mappingTypes";
import type { ImportCommitSummary, ImportHistory, StorageInfo, StoredRaid } from "./db/types";
import type { ParserDebugInfo } from "./types/parser";
import type { StreamingDecoderStats } from "./types/streamDecoder";

type AppRoute =
  | { screen: "import" }
  | { screen: "dashboard" }
  | { screen: "database" }
  | { screen: "mappings" }
  | { screen: "raid"; raidId: string };

function parseHashRoute(): AppRoute {
  const hash = window.location.hash.replace(/^#\/?/, "");

  if (hash === "dashboard") {
    return { screen: "dashboard" };
  }

  if (hash === "database") {
    return { screen: "database" };
  }

  if (hash === "mappings" || hash.startsWith("mappings?")) {
    return { screen: "mappings" };
  }

  if (hash.startsWith("raid/")) {
    return { screen: "raid", raidId: decodeURIComponent(hash.replace("raid/", "")) };
  }

  return { screen: "import" };
}

function pushRoute(route: AppRoute): void {
  if (route.screen === "dashboard") {
    window.location.hash = "/dashboard";
    return;
  }

  if (route.screen === "raid") {
    window.location.hash = `/raid/${encodeURIComponent(route.raidId)}`;
    return;
  }

  if (route.screen === "database") {
    window.location.hash = "/database";
    return;
  }

  if (route.screen === "mappings") {
    window.location.hash = "/mappings";
    return;
  }

  window.location.hash = "/import";
}

export default function App() {
  const [route, setRoute] = useState<AppRoute>(() => parseHashRoute());
  const [raids, setRaids] = useState<StoredRaid[]>([]);
  const [mappings, setMappings] = useState<Awaited<ReturnType<typeof getAllMappings>>>([]);
  const [imports, setImports] = useState<ImportHistory[]>([]);
  const [sourceFiles, setSourceFiles] = useState<Awaited<ReturnType<typeof getAllImportedSourceFiles>>>([]);
  const [lastImportSummary, setLastImportSummary] = useState<ImportCommitSummary | null>(null);
  const [storageInfo, setStorageInfo] = useState<StorageInfo>({ persisted: null, usage: null, quota: null });
  const [debugInfo, setDebugInfo] = useState<ParserDebugInfo | null>(null);
  const [decoderStats, setDecoderStats] = useState<StreamingDecoderStats | null>(null);

  const refreshDatabaseState = useCallback(async () => {
    await ensureBuiltInMappingsSeeded();

    const [nextRaids, nextImports, nextSourceFiles, nextStorageInfo] = await Promise.all([
      getAllRaids(),
      getRecentImports(),
      getAllImportedSourceFiles(),
      getStorageInfo().catch(() => ({ persisted: null, usage: null, quota: null })),
    ]);

    await discoverMappingsForExistingRaidsOnce(nextRaids);
    const nextMappings = await getAllMappings();

    setRaids(nextRaids);
    setImports(nextImports);
    setSourceFiles(nextSourceFiles);
    setMappings(nextMappings);
    setStorageInfo(nextStorageInfo);
  }, []);

  useEffect(() => {
    const handleHashChange = () => setRoute(parseHashRoute());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    void refreshDatabaseState();
    void requestStoragePersistence()
      .catch(() => null)
      .then(() => refreshDatabaseState());
  }, [refreshDatabaseState]);

  const selectedRaid = useMemo(() => {
    if (route.screen !== "raid") {
      return null;
    }

    return raids.find((raid) => raid.id === route.raidId) ?? null;
  }, [raids, route]);
  const mappingResolver = useMemo(() => createMappingResolver(mappings), [mappings]);

  const navigateImport = () => pushRoute({ screen: "import" });
  const navigateDashboard = () => pushRoute({ screen: "dashboard" });
  const navigateDatabase = () => pushRoute({ screen: "database" });
  const navigateMappings = () => pushRoute({ screen: "mappings" });
  const navigateRaid = (raidId: string) => pushRoute({ screen: "raid", raidId });
  const handleImportComplete = async (
    summary: ImportCommitSummary,
    nextDecoderStats: StreamingDecoderStats,
    nextDebugInfo: ParserDebugInfo | null,
  ) => {
    setLastImportSummary(summary);
    setDecoderStats(nextDecoderStats);
    setDebugInfo(nextDebugInfo);
    await refreshDatabaseState();
    navigateDashboard();
  };
  const handleDeleteRaid = async (raid: StoredRaid) => {
    if (!window.confirm("이 Raid 기록을 삭제할까요?")) {
      return;
    }

    await deleteRaid(raid.matchKey);
    await refreshDatabaseState();
    navigateDashboard();
  };
  const handleClearDatabase = async () => {
    const input = window.prompt("전체 전적과 Import History를 삭제하려면 DELETE를 입력하세요.");

    if (input !== "DELETE") {
      return;
    }

    await clearTrackerDatabase();
    setLastImportSummary(null);
    setDebugInfo(null);
    setDecoderStats(null);
    await refreshDatabaseState();
    navigateImport();
  };
  const handleExportBackup = async () => {
    try {
      await exportBackupFile();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };
  const handleImportBackup = async (file: File) => {
    try {
      const summary = await importBackupFile(file);
      const now = new Date().toISOString();

      setLastImportSummary({
        sourceFile: {
          id: `backup-${Date.now()}`,
          fileHash: "backup-import",
          filename: file.name,
          fileSize: file.size,
          lastModified: file.lastModified || null,
          importedAt: now,
          parserVersion: "backup",
        },
        history: {
          id: `backup-${Date.now()}`,
          sourceFileId: "backup-import",
          filename: file.name,
          startedAt: now,
          completedAt: now,
          parserVersion: "backup",
          discoveredRaids: summary.discoveredRaids,
          insertedRaids: summary.insertedRaids,
          sameRaids: summary.sameRaids,
          updatedRaids: summary.updatedRaids,
          keptExistingRaids: summary.keptExistingRaids,
          failedRaids: summary.failedRaids,
          status: summary.failedRaids > 0 ? "failed" : "completed",
        },
        totalStoredRaids: summary.totalStoredRaids,
        conflicts: [],
        mappingDiscovery: {
          newIds: 0,
          rediscoveredIds: 0,
          autoConfirmed: 0,
          unconfirmed: 0,
          conflicts: 0,
          processedOccurrences: 0,
        },
      });
      await refreshDatabaseState();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <AppShell
      currentScreen={route.screen}
      onNavigateDashboard={navigateDashboard}
      onNavigateImport={navigateImport}
      onNavigateDatabase={navigateDatabase}
      onNavigateMappings={navigateMappings}
    >
      {route.screen === "import" && (
        <ImportPage
          onImported={(summary, nextDecoderStats, nextDebugInfo) => {
            void handleImportComplete(summary, nextDecoderStats, nextDebugInfo);
          }}
        />
      )}
      {route.screen === "dashboard" && (
        <DashboardPage
          raids={raids}
          debugInfo={debugInfo}
          decoderStats={decoderStats}
          mappingResolver={mappingResolver}
          onRaidSelect={navigateRaid}
        />
      )}
      {route.screen === "mappings" && (
        <MappingManagementPage
          mappings={mappings}
          raids={raids}
          onSave={async (input) => {
            await saveMapping(input);
            await refreshDatabaseState();
          }}
          onResetOrDelete={async (id) => {
            await resetOrDeleteMapping(id);
            await refreshDatabaseState();
          }}
          onBulkCategory={async (ids: string[], category: MappingCategory) => {
            await bulkUpdateMappingCategory(ids, category);
            await refreshDatabaseState();
          }}
          onExportMappings={() => {
            void exportMappingFile();
          }}
          onImportMappings={async (file) => {
            await importMappingFile(file);
            await refreshDatabaseState();
          }}
          onSyncBuiltIns={async () => {
            await ensureBuiltInMappingsSeeded();
            await refreshDatabaseState();
          }}
          onDiscoverFromRaids={async () => {
            await rediscoverMappingsForExistingRaids(raids);
            await refreshDatabaseState();
          }}
        />
      )}
      {route.screen === "database" && (
        <LocalDatabasePage
          imports={imports}
          sourceFiles={sourceFiles}
          lastImportSummary={lastImportSummary}
          storageInfo={storageInfo}
          totalRaids={raids.length}
          onNavigateImport={navigateImport}
          onExportBackup={handleExportBackup}
          onImportBackup={handleImportBackup}
          onClearDatabase={handleClearDatabase}
        />
      )}
      {route.screen === "raid" && (
        <RaidDetailPage
          raid={selectedRaid}
          mappingResolver={mappingResolver}
          onBack={navigateDashboard}
          onDelete={handleDeleteRaid}
          onOpenMapping={(id) => {
            window.location.hash = `/mappings?id=${encodeURIComponent(id)}`;
          }}
        />
      )}
    </AppShell>
  );
}
