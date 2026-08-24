import { useEffect, useState } from "react";
import { useStreamingDecoder } from "../../hooks/useStreamingDecoder";
import type { ParserDebugInfo } from "../../types/parser";
import type { Raid } from "../../types/raid";
import type { StreamingDecoderStats } from "../../types/streamDecoder";
import { SectionPanel } from "../layout/SectionPanel";
import { ImportDropzone } from "./ImportDropzone";
import { ImportStatePreview } from "./ImportStatus";
import { StreamingDecoderPanel } from "./StreamingDecoderPanel";
import type { ImportState } from "./importTypes";

interface ImportPageProps {
  onDemo: () => void;
  onParsed: (raids: Raid[], debugInfo: ParserDebugInfo, stats: StreamingDecoderStats) => void;
}

export function ImportPage({ onDemo, onParsed }: ImportPageProps) {
  const [state, setState] = useState<ImportState>("idle");
  const [previewProgress, setPreviewProgress] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const decoder = useStreamingDecoder();

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
      if (decoder.snapshot.debug) {
        onParsed(decoder.snapshot.raids, decoder.snapshot.debug, decoder.snapshot.stats);
      }
      return;
    }

    if (decoder.snapshot.status === "cancelled") {
      setState("cancelled");
      return;
    }

    if (decoder.snapshot.status === "error") {
      setState("error");
    }
  }, [decoder.snapshot, onParsed]);

  const handleFileSelected = (file: File | null) => {
    if (!file) {
      decoder.reset();
      setState("empty");
      setFileName(null);
      setPreviewProgress(0);
      return;
    }

    decoder.reset();
    setFileName(file.name);
    setPreviewProgress(0);

    if (!file.name.toLowerCase().endsWith(".log")) {
      setState("unsupported");
      return;
    }

    setState("processing");
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
        onDemo={() => {
          decoder.reset();
          onDemo();
        }}
        onReset={() => {
          decoder.reset();
          setState("idle");
          setFileName(null);
          setPreviewProgress(0);
        }}
        onCancel={decoder.cancel}
      />

      <div className="space-y-4">
        <StreamingDecoderPanel snapshot={decoder.snapshot} onCancel={decoder.cancel} />

        <SectionPanel title="Import States" eyebrow="UI Matrix">
          <ImportStatePreview activeState={state} onPreviewState={handlePreviewState} />
        </SectionPanel>
      </div>
    </div>
  );
}
