import type { ParserDebugInfo } from "./parser";
import type { Raid } from "./raid";

export type StreamingDecoderStatus = "idle" | "processing" | "success" | "cancelled" | "error";

export interface StreamingDecoderStats {
  fileName: string;
  fileSize: number;
  processedBytes: number;
  progress: number;
  elapsedMs: number;
  totalRecords: number;
  mode03Records: number;
  mode04Records: number;
  unknownRecords: number;
  headerRecords: number;
  decodedBytes: number;
}

export interface StreamingDecoderSnapshot {
  status: StreamingDecoderStatus;
  stats: StreamingDecoderStats;
  errorMessage: string | null;
  raids: Raid[];
  debug: ParserDebugInfo | null;
}

export type DecoderWorkerRequest =
  | {
      type: "start";
      file: File;
    }
  | {
      type: "cancel";
    };

export type DecoderWorkerResponse =
  | {
      type: "progress";
      stats: StreamingDecoderStats;
    }
  | {
      type: "complete";
      stats: StreamingDecoderStats;
      raids: Raid[];
      debug: ParserDebugInfo;
    }
  | {
      type: "cancelled";
      stats: StreamingDecoderStats;
      raids: Raid[];
      debug: ParserDebugInfo;
    }
  | {
      type: "error";
      errorMessage: string;
      stats: StreamingDecoderStats | null;
    };
