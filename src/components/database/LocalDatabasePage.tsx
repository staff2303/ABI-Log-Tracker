import type { ImportedSourceFile, ImportCommitSummary, ImportHistory, StorageInfo } from "../../db/types";
import { LocalDatabasePanel } from "../dashboard/LocalDatabasePanel";

interface LocalDatabasePageProps {
  imports: ImportHistory[];
  sourceFiles: ImportedSourceFile[];
  lastImportSummary: ImportCommitSummary | null;
  storageInfo: StorageInfo;
  totalRaids: number;
  onNavigateImport: () => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onClearDatabase: () => void;
}

export function LocalDatabasePage({
  imports,
  sourceFiles,
  lastImportSummary,
  storageInfo,
  totalRaids,
  onNavigateImport,
  onExportBackup,
  onImportBackup,
  onClearDatabase,
}: LocalDatabasePageProps) {
  return (
    <div className="space-y-4">
      <section className="panel p-3">
        <p className="text-[11px] uppercase text-abi-muted">Local IndexedDB</p>
        <h1 className="mt-1 text-xl font-semibold text-abi-text">Local Database</h1>
      </section>

      <LocalDatabasePanel
        imports={imports}
        sourceFiles={sourceFiles}
        lastImportSummary={lastImportSummary}
        storageInfo={storageInfo}
        totalRaids={totalRaids}
        onNavigateImport={onNavigateImport}
        onExportBackup={onExportBackup}
        onImportBackup={onImportBackup}
        onClearDatabase={onClearDatabase}
      />
    </div>
  );
}
