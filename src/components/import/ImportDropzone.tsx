import { CircleStop, FileUp, Play, RotateCcw, UploadCloud } from "lucide-react";
import { useRef } from "react";
import { cn } from "../../utils/classNames";
import { ImportProgress } from "./ImportProgress";
import { ImportStatus } from "./ImportStatus";
import type { ImportState } from "./importTypes";

interface ImportDropzoneProps {
  state: ImportState;
  progress: number;
  fileName: string | null;
  onFileSelected: (file: File | null) => void;
  onDragStateChange: (dragging: boolean) => void;
  onDemo: () => void;
  onReset: () => void;
  onCancel: () => void;
}

export function ImportDropzone({
  state,
  progress,
  fileName,
  onFileSelected,
  onDragStateChange,
  onDemo,
  onReset,
  onCancel,
}: ImportDropzoneProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isDropActive = state === "dragOver";
  const isProcessing = state === "processing";

  return (
    <div className="panel p-4 lg:p-5">
      <div
        className={cn(
          "flex min-h-[320px] flex-col items-center justify-center border border-dashed p-5 text-center transition",
          isDropActive ? "border-abi-lime bg-abi-olive/10" : "border-abi-line bg-abi-black/70",
          isProcessing && "border-abi-olive",
        )}
        onDragEnter={(event) => {
          event.preventDefault();
          onDragStateChange(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          onDragStateChange(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          onDragStateChange(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          onDragStateChange(false);
          onFileSelected(event.dataTransfer.files.item(0));
        }}
      >
        <div className="flex h-16 w-16 items-center justify-center border border-abi-olive bg-abi-panel2 text-abi-lime">
          <UploadCloud size={30} aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-xl font-semibold text-abi-text">ABInfinite.log Import</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-abi-muted">
          로그는 서버에 업로드되지 않고 브라우저에서 분석됩니다.
        </p>
        <p className="mt-1 text-xs text-abi-muted">
          현재 단계는 Raid Parser가 아닌 Web Worker 기반 Streaming Decoder 프로토타입입니다.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <button className="secondary-button" onClick={() => fileInputRef.current?.click()} disabled={isProcessing}>
            <FileUp size={16} aria-hidden="true" />
            파일 선택
          </button>
          <button className="primary-button" onClick={onDemo} disabled={isProcessing}>
            <Play size={16} aria-hidden="true" />
            DEMO DATA
          </button>
          {isProcessing && (
            <button className="secondary-button border-abi-amber text-abi-amber" onClick={onCancel}>
              <CircleStop size={16} aria-hidden="true" />
              Cancel
            </button>
          )}
          <button className="icon-button" onClick={onReset} aria-label="Reset import state">
            <RotateCcw size={16} aria-hidden="true" />
          </button>
        </div>

        <input
          ref={fileInputRef}
          className="hidden"
          type="file"
          accept=".log"
          onChange={(event) => onFileSelected(event.target.files?.item(0) ?? null)}
        />

        {fileName && (
          <div className="mt-5 border border-abi-line bg-abi-panel px-3 py-2 font-mono text-xs text-abi-text">
            {fileName}
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <ImportStatus state={state} />
        <ImportProgress progress={state === "processing" ? progress : state === "success" ? 100 : 0} />
      </div>
    </div>
  );
}
