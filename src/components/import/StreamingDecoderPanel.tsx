import { Activity, Clock, Database, FileCode2, HardDrive, ListTree, ShieldCheck, Sigma } from "lucide-react";
import type { ReactNode } from "react";
import type { StreamingDecoderSnapshot, StreamingDecoderStats, StreamingDecoderStatus } from "../../types/streamDecoder";
import { emptyValue, formatBytes, formatMilliseconds, formatNumber } from "../../utils/format";
import { SectionPanel } from "../layout/SectionPanel";
import { StatusBadge } from "../layout/StatusBadge";

interface StreamingDecoderPanelProps {
  snapshot: StreamingDecoderSnapshot;
  onCancel: () => void;
}

interface DecoderStatItem {
  label: string;
  value: string;
  subValue?: string;
  icon: ReactNode;
  tone?: "default" | "green" | "red" | "amber" | "lime";
}

const toneClasses = {
  default: "text-abi-text",
  green: "text-abi-green",
  red: "text-abi-red",
  amber: "text-abi-amber",
  lime: "text-abi-lime",
};

function statusLabel(status: StreamingDecoderStatus, stats: StreamingDecoderStats): string {
  if (status === "success" && stats.totalRecords === 0) {
    return "EMPTY";
  }

  if (status === "processing") {
    return "PROCESSING";
  }

  if (status === "success") {
    return "SUCCESS";
  }

  if (status === "cancelled") {
    return "CANCELLED";
  }

  if (status === "error") {
    return "FAILED";
  }

  return "IDLE";
}

function statusTone(status: StreamingDecoderStatus, stats: StreamingDecoderStats) {
  if (status === "success" && stats.totalRecords > 0) {
    return "green" as const;
  }

  if (status === "error") {
    return "red" as const;
  }

  if (status === "processing") {
    return "olive" as const;
  }

  if (status === "cancelled" || (status === "success" && stats.totalRecords === 0)) {
    return "amber" as const;
  }

  return "muted" as const;
}

function DecoderStatCard({ item }: { item: DecoderStatItem }) {
  return (
    <div className="min-w-0 border border-abi-line bg-abi-black px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[11px] uppercase text-abi-muted">{item.label}</p>
        <span className="shrink-0 text-abi-muted">{item.icon}</span>
      </div>
      <p className={`mt-1 truncate font-mono text-sm font-semibold ${toneClasses[item.tone ?? "default"]}`}>
        {item.value}
      </p>
      {item.subValue && <p className="mt-1 truncate text-[11px] text-abi-muted">{item.subValue}</p>}
    </div>
  );
}

export function StreamingDecoderPanel({ snapshot, onCancel }: StreamingDecoderPanelProps) {
  const { stats, status, errorMessage } = snapshot;
  const progressLabel = `${stats.progress.toFixed(1)}%`;
  const items: DecoderStatItem[] = [
    {
      label: "파일명",
      value: stats.fileName || emptyValue,
      icon: <FileCode2 size={14} aria-hidden="true" />,
    },
    {
      label: "파일 크기",
      value: `${formatNumber(stats.fileSize)} B`,
      subValue: formatBytes(stats.fileSize),
      icon: <HardDrive size={14} aria-hidden="true" />,
    },
    {
      label: "처리한 바이트",
      value: `${formatNumber(stats.processedBytes)} B`,
      subValue: formatBytes(stats.processedBytes),
      icon: <Database size={14} aria-hidden="true" />,
      tone: status === "processing" ? "lime" : "default",
    },
    {
      label: "진행률",
      value: progressLabel,
      icon: <Activity size={14} aria-hidden="true" />,
      tone: status === "processing" || status === "success" ? "lime" : "default",
    },
    {
      label: "처리 시간",
      value: formatMilliseconds(stats.elapsedMs),
      icon: <Clock size={14} aria-hidden="true" />,
    },
    {
      label: "총 레코드",
      value: formatNumber(stats.totalRecords),
      icon: <ListTree size={14} aria-hidden="true" />,
    },
    {
      label: "01 03 레코드",
      value: formatNumber(stats.mode03Records),
      icon: <ShieldCheck size={14} aria-hidden="true" />,
      tone: "green",
    },
    {
      label: "01 04 레코드",
      value: formatNumber(stats.mode04Records),
      icon: <ShieldCheck size={14} aria-hidden="true" />,
      tone: "lime",
    },
    {
      label: "01 07 Header",
      value: formatNumber(stats.headerRecords),
      icon: <ShieldCheck size={14} aria-hidden="true" />,
      tone: "amber",
    },
    {
      label: "Unknown 레코드",
      value: formatNumber(stats.unknownRecords),
      icon: <Sigma size={14} aria-hidden="true" />,
      tone: stats.unknownRecords > 0 ? "amber" : "default",
    },
    {
      label: "처리 상태",
      value: statusLabel(status, stats),
      icon: <Activity size={14} aria-hidden="true" />,
      tone: status === "error" ? "red" : status === "success" ? "green" : status === "cancelled" ? "amber" : "default",
    },
  ];

  return (
    <SectionPanel
      title="Streaming Decoder"
      eyebrow="Local Worker"
      action={
        <StatusBadge tone={statusTone(status, stats)}>
          {statusLabel(status, stats)}
        </StatusBadge>
      }
    >
      <div className="mb-3 h-2 overflow-hidden bg-abi-panel2">
        <div className="h-full bg-abi-lime transition-all duration-300" style={{ width: `${stats.progress}%` }} />
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {items.map((item) => (
          <DecoderStatCard key={item.label} item={item} />
        ))}
      </div>

      {errorMessage && (
        <div className="mt-3 border border-abi-red/70 bg-abi-red/10 px-3 py-2 text-xs leading-5 text-abi-red">
          {errorMessage}
        </div>
      )}

      {status === "processing" && (
        <button className="secondary-button mt-3 w-full border-abi-amber text-abi-amber" onClick={onCancel}>
          Cancel Streaming Decoder
        </button>
      )}
    </SectionPanel>
  );
}
