import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DecoderWorkerRequest,
  DecoderWorkerResponse,
  StreamingDecoderSnapshot,
  StreamingDecoderStats,
} from "../types/streamDecoder";

function createStatsPreview(file: File): StreamingDecoderStats {
  return {
    fileName: file.name,
    fileSize: file.size,
    processedBytes: 0,
    progress: file.size === 0 ? 100 : 0,
    elapsedMs: 0,
    totalRecords: 0,
    mode03Records: 0,
    mode04Records: 0,
    unknownRecords: 0,
    headerRecords: 0,
    decodedBytes: 0,
  };
}

const emptySnapshot: StreamingDecoderSnapshot = {
  status: "idle",
  stats: {
    fileName: "",
    fileSize: 0,
    processedBytes: 0,
    progress: 0,
    elapsedMs: 0,
    totalRecords: 0,
    mode03Records: 0,
    mode04Records: 0,
    unknownRecords: 0,
    headerRecords: 0,
    decodedBytes: 0,
  },
  errorMessage: null,
  raids: [],
  debug: null,
};

function createDecoderWorker(): Worker {
  return new Worker(new URL("../workers/abiLogDecoder.worker.ts", import.meta.url), { type: "module" });
}

export function useStreamingDecoder() {
  const workerRef = useRef<Worker | null>(null);
  const [snapshot, setSnapshot] = useState<StreamingDecoderSnapshot>(emptySnapshot);

  const terminateWorker = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  const clearWorker = useCallback((worker: Worker) => {
    worker.terminate();

    if (workerRef.current === worker) {
      workerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    terminateWorker();
    setSnapshot(emptySnapshot);
  }, [terminateWorker]);

  const start = useCallback(
    (file: File) => {
      terminateWorker();

      const worker = createDecoderWorker();
      workerRef.current = worker;
      setSnapshot({
        status: "processing",
        stats: createStatsPreview(file),
        errorMessage: null,
        raids: [],
        debug: null,
      });

      worker.onmessage = (event: MessageEvent<DecoderWorkerResponse>) => {
        const message = event.data;

        if (message.type === "progress") {
          setSnapshot((current) => ({
            status: "processing",
            stats: message.stats,
            errorMessage: null,
            raids: current.raids,
            debug: current.debug,
          }));
          return;
        }

        if (message.type === "complete") {
          setSnapshot({
            status: "success",
            stats: message.stats,
            errorMessage: null,
            raids: message.raids,
            debug: message.debug,
          });
          clearWorker(worker);
          return;
        }

        if (message.type === "cancelled") {
          setSnapshot({
            status: "cancelled",
            stats: message.stats,
            errorMessage: null,
            raids: message.raids,
            debug: message.debug,
          });
          clearWorker(worker);
          return;
        }

        setSnapshot({
          status: "error",
          stats: message.stats ?? createStatsPreview(file),
          errorMessage: message.errorMessage,
          raids: [],
          debug: null,
        });
        clearWorker(worker);
      };

      worker.onerror = (event) => {
        setSnapshot({
          status: "error",
          stats: createStatsPreview(file),
          errorMessage: event.message || "Worker failed before it could report decoder progress.",
          raids: [],
          debug: null,
        });
        clearWorker(worker);
      };

      const request: DecoderWorkerRequest = { type: "start", file };
      worker.postMessage(request);
    },
    [clearWorker, terminateWorker],
  );

  const cancel = useCallback(() => {
    const request: DecoderWorkerRequest = { type: "cancel" };
    workerRef.current?.postMessage(request);
  }, []);

  useEffect(() => terminateWorker, [terminateWorker]);

  return {
    snapshot,
    start,
    cancel,
    reset,
  };
}
