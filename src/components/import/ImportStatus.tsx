import { AlertTriangle, Ban, CheckCircle2, FileSearch, Inbox, Loader2, UploadCloud } from "lucide-react";
import type { ReactNode } from "react";
import type { ImportState } from "./importTypes";

export interface ImportStatusDefinition {
  state: ImportState;
  label: string;
  title: string;
  detail: string;
  tone: "muted" | "green" | "red" | "amber" | "lime";
  icon: ReactNode;
}

const importStatusDefinitions: ImportStatusDefinition[] = [
  {
    state: "idle",
    label: "Idle",
    title: "ABInfinite.log 대기",
    detail: "ABInfinite.log 파일을 선택하면 브라우저 로컬에서 Raid 분석을 시작합니다.",
    tone: "muted",
    icon: <UploadCloud size={20} aria-hidden="true" />,
  },
  {
    state: "dragOver",
    label: "Drag Over",
    title: "파일 드롭 준비",
    detail: "브라우저 로컬 File stream으로만 처리할 파일을 선택합니다.",
    tone: "lime",
    icon: <UploadCloud size={20} aria-hidden="true" />,
  },
  {
    state: "processing",
    label: "Processing",
    title: "로그 분석 중",
    detail: "Worker가 한 번의 File stream에서 SHA-256, 로그 디코딩, Raid Parser 처리를 함께 수행합니다.",
    tone: "lime",
    icon: <Loader2 className="animate-spin" size={20} aria-hidden="true" />,
  },
  {
    state: "success",
    label: "Success",
    title: "분석 완료",
    detail: "전체 로그 문자열은 보관하지 않고 Raid 결과와 처리 통계만 남겼습니다.",
    tone: "green",
    icon: <CheckCircle2 size={20} aria-hidden="true" />,
  },
  {
    state: "duplicate",
    label: "Duplicate File",
    title: "이미 분석한 로그 파일",
    detail: "파일 Hash가 Import History에 존재합니다. 기본 동작은 재분석을 건너뜁니다.",
    tone: "amber",
    icon: <Ban size={20} aria-hidden="true" />,
  },
  {
    state: "cancelled",
    label: "Cancelled",
    title: "사용자 취소",
    detail: "진행 중인 File stream reader를 취소하고 Worker를 정리했습니다.",
    tone: "amber",
    icon: <Ban size={20} aria-hidden="true" />,
  },
  {
    state: "unsupported",
    label: "Unsupported Log",
    title: "지원하지 않는 파일",
    detail: "현재는 ABInfinite.log 형식의 .log 파일만 처리합니다.",
    tone: "amber",
    icon: <Ban size={20} aria-hidden="true" />,
  },
  {
    state: "empty",
    label: "Empty Result",
    title: "표시할 레코드 없음",
    detail: "파일은 처리했지만 레코드로 집계할 라인이 없었습니다.",
    tone: "amber",
    icon: <Inbox size={20} aria-hidden="true" />,
  },
  {
    state: "error",
    label: "Error",
    title: "스트리밍 처리 실패",
    detail: "Worker 또는 File stream 처리 중 오류가 발생했습니다.",
    tone: "red",
    icon: <AlertTriangle size={20} aria-hidden="true" />,
  },
];

function getImportStatusDefinition(state: ImportState): ImportStatusDefinition {
  return importStatusDefinitions.find((definition) => definition.state === state) ?? importStatusDefinitions[0];
}

const toneClasses = {
  muted: "border-abi-line bg-abi-panel text-abi-muted",
  green: "border-abi-green/70 bg-abi-green/10 text-abi-green",
  red: "border-abi-red/70 bg-abi-red/10 text-abi-red",
  amber: "border-abi-amber/70 bg-abi-amber/10 text-abi-amber",
  lime: "border-abi-olive bg-abi-olive/10 text-abi-lime",
};

interface ImportStatusProps {
  state: ImportState;
}

export function ImportStatus({ state }: ImportStatusProps) {
  const definition = getImportStatusDefinition(state);

  return (
    <div className={`flex items-start gap-3 border p-3 ${toneClasses[definition.tone]}`}>
      <span className="mt-0.5">{definition.icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-abi-text">{definition.title}</span>
        <span className="mt-1 block text-xs leading-5 text-abi-muted">{definition.detail}</span>
      </span>
    </div>
  );
}

export function ImportStatePreview({
  activeState,
  onPreviewState,
}: {
  activeState: ImportState;
  onPreviewState: (state: ImportState) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
      {importStatusDefinitions.map((definition) => (
        <button
          key={definition.state}
          className={`flex items-center justify-between border px-3 py-2 text-left text-xs transition ${
            activeState === definition.state
              ? "border-abi-olive bg-abi-panel2 text-abi-lime"
              : "border-abi-line bg-abi-black text-abi-muted hover:border-abi-olive hover:text-abi-text"
          }`}
          onClick={() => onPreviewState(definition.state)}
        >
          <span className="flex min-w-0 items-center gap-2">
            {definition.icon}
            <span className="truncate">{definition.label}</span>
          </span>
          <FileSearch size={14} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
