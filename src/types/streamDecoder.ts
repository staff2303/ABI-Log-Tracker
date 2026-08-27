import type { ParserDebugInfo } from "./parser";
import type { Raid } from "./raid";
import type { MappingDiscoveryEntry } from "../db/mappingTypes";

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
  fileHash: string | null;
}

export interface StreamingDecoderSnapshot {
  status: StreamingDecoderStatus;
  stats: StreamingDecoderStats;
  errorMessage: string | null;
  raids: Raid[];
  debug: ParserDebugInfo | null;
  mappingDiscoveries: MappingDiscoveryEntry[];
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
      mappingDiscoveries: MappingDiscoveryEntry[];
    }
  | {
      type: "cancelled";
      stats: StreamingDecoderStats;
      raids: Raid[];
      debug: ParserDebugInfo;
      mappingDiscoveries: MappingDiscoveryEntry[];
    }
  | {
      type: "error";
      errorMessage: string;
      stats: StreamingDecoderStats | null;
    };
