import { useCallback, useEffect, useRef, useState } from "react";
import { commitParsedImport, getDuplicateImportState } from "../../db/raidRepository";
import type { ImportedSourceFile, ImportCommitSummary } from "../../db/types";
import { useStreamingDecoder } from "../../hooks/useStreamingDecoder";
import type { ParserDebugInfo } from "../../types/parser";
import type { StreamingDecoderStats } from "../../types/streamDecoder";
import { SectionPanel } from "../layout/SectionPanel";
import { ImportDropzone } from "./ImportDropzone";
import { ImportStatePreview } from "./ImportStatus";
import { StreamingDecoderPanel } from "./StreamingDecoderPanel";
import type { ImportState } from "./importTypes";

interface ImportPageProps {
  onImported: (summary: ImportCommitSummary, stats: StreamingDecoderStats, debugInfo: ParserDebugInfo | null) => void;
}

type ImportOutcome =
  | { type: "duplicate"; sourceFile: ImportedSourceFile }
  | { type: "completed"; summary: ImportCommitSummary }
  | { type: "failed"; message: string };

export function ImportPage({ onImported }: ImportPageProps) {
  const [state, setState] = useState<ImportState>("idle");
  const [previewProgress, setPreviewProgress] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const selectedFileRef = useRef<File | null>(null);
  const committedTokenRef = useRef<string | null>(null);
  const decoder = useStreamingDecoder();
  const showImportStatePreview = isDebugMode();

  const commitSuccessfulDecode = useCallback(
    async (stats: StreamingDecoderStats) => {
      const file = selectedFileRef.current;
      const fileHash = stats.fileHash;

      if (!file || !fileHash || committedTokenRef.current === fileHash) {
        return;
      }

      committedTokenRef.current = fileHash;

      try {
        const duplicateState = await getDuplicateImportState(fileHash);
        const duplicateSourceFile = duplicateState.sourceFile;

        if (duplicateSourceFile && duplicateState.hasStoredResult) {
          setState("duplicate");
          setOutcome({ type: "duplicate", sourceFile: duplicateSourceFile });
          return;
        }

        const summary = await commitParsedImport({
          raids: decoder.snapshot.raids,
          fileHash,
          file,
        });

        setOutcome({ type: "completed", summary });
        onImported(summary, stats, decoder.snapshot.debug);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setState("error");
        setOutcome({ type: "failed", message });
      }
    },
    [decoder.snapshot.debug, decoder.snapshot.raids, onImported],
  );

  useEffect(() => {
    if (decoder.snapshot.status === "idle") {
      return;
    }

    if (decoder.snapshot.status === "processing") {
      setState("processing");
      return;
    }

    if (decoder.snapshot.status === "success") {
      setState(decoder.snapshot.stats.totalRecords === 0 ? "empty" : "success");
      void commitSuccessfulDecode(decoder.snapshot.stats);
      return;
    }

    if (decoder.snapshot.status === "cancelled") {
      setState("cancelled");
      return;
    }

    if (decoder.snapshot.status === "error") {
      setState("error");
    }
  }, [commitSuccessfulDecode, decoder.snapshot]);

  const handleFileSelected = async (file: File | null) => {
    if (!file) {
      decoder.reset();
      setState("empty");
      setFileName(null);
      setPreviewProgress(0);
      setOutcome(null);
      selectedFileRef.current = null;
      return;
    }

    decoder.reset();
    setFileName(file.name);
    setPreviewProgress(0);
    setOutcome(null);
    selectedFileRef.current = null;
    committedTokenRef.current = null;

    if (!file.name.toLowerCase().endsWith(".log")) {
      setState("unsupported");
      return;
    }

    setState("processing");
    selectedFileRef.current = file;
    decoder.start(file);
  };

  const handlePreviewState = (nextState: ImportState) => {
    decoder.reset();
    setState(nextState);
    setPreviewProgress(nextState === "processing" ? 62 : nextState === "success" ? 100 : 0);
    setFileName(nextState === "idle" ? null : "ABInfinite.log");
  };

  const progress = decoder.snapshot.status === "idle" ? previewProgress : decoder.snapshot.stats.progress;
  const displayFileName = decoder.snapshot.stats.fileName || fileName;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <ImportDropzone
        state={state}
        progress={progress}
        fileName={displayFileName}
        onFileSelected={handleFileSelected}
        onDragStateChange={(dragging) => {
          if (state === "processing") {
            return;
          }

          setState(dragging ? "dragOver" : "idle");
        }}
        onReset={() => {
          decoder.reset();
          setState("idle");
          setFileName(null);
          setPreviewProgress(0);
          setOutcome(null);
          selectedFileRef.current = null;
          committedTokenRef.current = null;
        }}
        onCancel={decoder.cancel}
      />

      <div className="space-y-4">
        <StreamingDecoderPanel snapshot={decoder.snapshot} onCancel={decoder.cancel} />
        {outcome && <ImportResultPanel outcome={outcome} />}

        {showImportStatePreview && (
          <SectionPanel title="Import States" eyebrow="Debug UI">
            <ImportStatePreview activeState={state} onPreviewState={handlePreviewState} />
          </SectionPanel>
        )}
      </div>
    </div>
  );
}

function isDebugMode(): boolean {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "1";
}

function ImportResultPanel({ outcome }: { outcome: ImportOutcome }) {
  if (outcome.type === "duplicate") {
    return (
      <SectionPanel title="Import Result" eyebrow="Duplicate">
        <div className="border border-abi-amber/70 bg-abi-amber/10 p-3 text-sm">
          <p className="font-semibold text-abi-amber">이미 분석한 로그 파일입니다.</p>
          <p className="mt-2 text-xs text-abi-muted">
            {outcome.sourceFile.filename} / 이전 분석 {new Date(outcome.sourceFile.importedAt).toLocaleString()}
          </p>
        </div>
      </SectionPanel>
    );
  }

  if (outcome.type === "failed") {
    return (
      <SectionPanel title="Import Result" eyebrow="Failed">
        <div className="border border-abi-red/70 bg-abi-red/10 p-3 text-sm text-abi-red">{outcome.message}</div>
      </SectionPanel>
    );
  }

  const history = outcome.summary.history;
  const mappingDiscovery = outcome.summary.mappingDiscovery;

  return (
    <SectionPanel title="Import Result" eyebrow="Completed">
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-xs">
          <ResultMetric label="발견" value={history.discoveredRaids} />
          <ResultMetric label="신규" value={history.insertedRaids} tone="green" />
          <ResultMetric label="중복" value={history.sameRaids + history.keptExistingRaids} tone="amber" />
          <ResultMetric label="업데이트" value={history.updatedRaids} tone="lime" />
          <ResultMetric label="오류" value={history.failedRaids} tone="red" />
          <ResultMetric label="누적 Raid" value={outcome.summary.totalStoredRaids} />
        </div>

        <div className="border border-abi-line bg-abi-black p-3">
          <p className="text-[11px] uppercase text-abi-muted">Mapping Discovery</p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <ResultMetric label="새 ID" value={mappingDiscovery.newIds} tone="lime" />
            <ResultMetric label="재발견" value={mappingDiscovery.rediscoveredIds} />
            <ResultMetric label="자동 확인" value={mappingDiscovery.autoConfirmed} tone="green" />
            <ResultMetric label="미확인" value={mappingDiscovery.unconfirmed} tone="amber" />
            <ResultMetric label="충돌" value={mappingDiscovery.conflicts} tone="red" />
            <ResultMetric label="발견 횟수" value={mappingDiscovery.processedOccurrences} />
          </div>
          {mappingDiscovery.unconfirmed > 0 && (
            <button
              className="secondary-button mt-3 w-full justify-center border-abi-amber text-abi-amber"
              onClick={() => {
                window.location.hash = "/mappings?status=unconfirmed";
              }}
            >
              미확인 매핑 확인
            </button>
          )}
        </div>
      </div>
    </SectionPanel>
  );
}

function ResultMetric({
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
