import { Download, FolderOpen, HardDrive, RotateCcw, Trash2, Upload } from "lucide-react";
import { useRef } from "react";
import { CURRENT_PARSER_VERSION, CURRENT_SCHEMA_VERSION, DB_NAME, DB_VERSION } from "../../db/constants";
import type { ImportedSourceFile, ImportCommitSummary, ImportHistory, StorageInfo } from "../../db/types";
import { formatBytes, formatLongDateTime, formatNumber } from "../../utils/format";
import { SectionPanel } from "../layout/SectionPanel";
import { StatusBadge } from "../layout/StatusBadge";

interface LocalDatabasePanelProps {
  imports: ImportHistory[];
  sourceFiles: ImportedSourceFile[];
  lastImportSummary: ImportCommitSummary | null;
  storageInfo: StorageInfo;
  totalRaids: number;
  onNavigateImport: () => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onOpenDatabaseFolder: () => void;
  onClearDatabase: () => void;
}

export function LocalDatabasePanel({
  imports,
  sourceFiles,
  lastImportSummary,
  storageInfo,
  totalRaids,
  onNavigateImport,
  onExportBackup,
  onImportBackup,
  onOpenDatabaseFolder,
  onClearDatabase,
}: LocalDatabasePanelProps) {
  const backupInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <SectionPanel
      title="Local Database"
      eyebrow="SQLite"
      action={<StatusBadge tone="green">{storageInfo.journalMode ? `WAL ${storageInfo.journalMode}` : "AppData DB"}</StatusBadge>}
    >
      <div className="grid gap-2 lg:grid-cols-[1fr_1fr_1.6fr]">
        <div className="border border-abi-line bg-abi-black p-3">
          <p className="text-[11px] uppercase text-abi-muted">Database</p>
          <p className="mt-1 font-mono text-sm text-abi-text">{DB_NAME}</p>
          <p className="mt-2 text-xs text-abi-muted">
            DB v{DB_VERSION} / Schema v{CURRENT_SCHEMA_VERSION} / Parser {CURRENT_PARSER_VERSION}
          </p>
        </div>

        <div className="border border-abi-line bg-abi-black p-3">
          <p className="text-[11px] uppercase text-abi-muted">Storage</p>
          <div className="mt-1 flex items-center gap-2 font-mono text-sm text-abi-text">
            <HardDrive size={14} aria-hidden="true" />
            {formatBytes(storageInfo.usage)}
          </div>
          <p className="mt-2 truncate text-xs text-abi-muted" title={storageInfo.dbPath ?? undefined}>
            {storageInfo.dbPath ?? "Tauri AppData SQLite에 구조화된 전적만 저장합니다."}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-2 xl:grid-cols-5">
          <button className="secondary-button justify-center" onClick={onNavigateImport}>
            <Upload size={15} aria-hidden="true" />
            로그 추가
          </button>
          <button className="secondary-button justify-center" onClick={onExportBackup}>
            <Download size={15} aria-hidden="true" />
            DB 백업
          </button>
          <button className="secondary-button justify-center" onClick={() => backupInputRef.current?.click()}>
            <RotateCcw size={15} aria-hidden="true" />
            DB 복원
          </button>
          <button className="secondary-button justify-center" onClick={onOpenDatabaseFolder}>
            <FolderOpen size={15} aria-hidden="true" />
            DB 폴더
          </button>
          <button className="secondary-button justify-center border-abi-red/70 text-abi-red" onClick={onClearDatabase}>
            <Trash2 size={15} aria-hidden="true" />
            초기화
          </button>
          <input
            ref={backupInputRef}
            className="hidden"
            type="file"
            accept=".db,application/vnd.sqlite3,application/x-sqlite3"
            onChange={(event) => {
              const file = event.target.files?.item(0);
              if (file) {
                onImportBackup(file);
              }
              event.currentTarget.value = "";
            }}
          />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs lg:grid-cols-6">
        <Metric label="Raid" value={totalRaids} />
        <Metric label="Source Files" value={sourceFiles.length} />
        <Metric label="Import History" value={imports.length} />
        <Metric label="Orphan Sources" value={Math.max(0, sourceFiles.length - imports.length)} tone={sourceFiles.length > imports.length ? "amber" : "default"} />
      </div>

      {lastImportSummary && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs lg:grid-cols-6">
          <Metric label="발견" value={lastImportSummary.history.discoveredRaids} />
          <Metric label="신규" value={lastImportSummary.history.insertedRaids} tone="green" />
          <Metric label="중복" value={lastImportSummary.history.sameRaids + lastImportSummary.history.keptExistingRaids} tone="amber" />
          <Metric label="업데이트" value={lastImportSummary.history.updatedRaids} tone="lime" />
          <Metric label="오류" value={lastImportSummary.history.failedRaids} tone="red" />
          <Metric label="누적" value={lastImportSummary.totalStoredRaids || totalRaids} />
        </div>
      )}

      <div className="mt-3">
        <p className="mb-2 text-[11px] uppercase text-abi-muted">Recent Imports</p>
        {imports.length === 0 ? (
          <div className="border border-abi-line bg-abi-black p-3 text-xs text-abi-muted">아직 저장된 Import History가 없습니다.</div>
        ) : (
          <div className="grid gap-2 xl:grid-cols-2">
            {imports.slice(0, 6).map((entry) => (
              <div key={entry.id} className="border border-abi-line bg-abi-black px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate font-semibold text-abi-text">{entry.filename}</p>
                  <StatusBadge tone={entry.status === "completed" ? "green" : entry.status === "failed" ? "red" : "olive"}>
                    {entry.status}
                  </StatusBadge>
                </div>
                <p className="mt-1 text-abi-muted">{formatLongDateTime(entry.startedAt)}</p>
                <p className="mt-1 font-mono text-abi-muted">
                  신규 {formatNumber(entry.insertedRaids)} / 중복 {formatNumber(entry.sameRaids + entry.keptExistingRaids)} / 업데이트{" "}
                  {formatNumber(entry.updatedRaids)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionPanel>
  );
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "green" | "amber" | "lime" | "red";
}) {
  const toneClass = {
    default: "text-abi-text",
    green: "text-abi-green",
    amber: "text-abi-amber",
    lime: "text-abi-lime",
    red: "text-abi-red",
  }[tone];

  return (
    <div className="border border-abi-line bg-abi-black px-3 py-2">
      <p className="text-abi-muted">{label}</p>
      <p className={`mt-1 font-mono text-lg font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
