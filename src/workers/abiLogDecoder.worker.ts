import { decodePayloadForValidation, decodePayloadToBytes } from "../parser/decoder/abiLogCodec";
import { RaidParser } from "../parser/raid/RaidParser";
import type { DecoderWorkerRequest, DecoderWorkerResponse, StreamingDecoderStats } from "../types/streamDecoder";

type ByteBuffer = Uint8Array<ArrayBufferLike>;
type WorkerContext = {
  postMessage: (message: DecoderWorkerResponse) => void;
  onmessage: ((event: MessageEvent<DecoderWorkerRequest>) => void) | null;
};

const ctx = self as unknown as WorkerContext;
const progressIntervalMs = 140;

let cancelRequested = false;
let currentReader: ReadableStreamDefaultReader<ByteBuffer> | null = null;
let currentStats: StreamingDecoderStats | null = null;
let startedAt = 0;
let lastProgressAt = 0;
const decodedTextDecoder = new TextDecoder("utf-8", { fatal: false });

function createInitialStats(file: File): StreamingDecoderStats {
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

function postMessage(message: DecoderWorkerResponse): void {
  ctx.postMessage(message);
}

function refreshRuntimeStats(stats: StreamingDecoderStats): void {
  stats.elapsedMs = performance.now() - startedAt;
  stats.progress = stats.fileSize === 0 ? 100 : Math.min(100, (stats.processedBytes / stats.fileSize) * 100);
}

function maybePostProgress(stats: StreamingDecoderStats, force = false): void {
  const now = performance.now();

  if (!force && now - lastProgressAt < progressIntervalMs) {
    return;
  }

  refreshRuntimeStats(stats);
  lastProgressAt = now;
  postMessage({ type: "progress", stats: { ...stats } });
}

function concatCarry(carry: ByteBuffer, chunk: ByteBuffer): ByteBuffer {
  if (carry.length === 0) {
    return chunk;
  }

  const merged = new Uint8Array(carry.length + chunk.length);
  merged.set(carry, 0);
  merged.set(chunk, carry.length);
  return merged;
}

function trimLineEnding(buffer: ByteBuffer, start: number, end: number): ByteBuffer {
  if (end > start && buffer[end - 1] === 0x0d) {
    return buffer.subarray(start, end - 1);
  }

  return buffer.subarray(start, end);
}

function processRecordLine(line: ByteBuffer, stats: StreamingDecoderStats, parser: RaidParser): void {
  stats.totalRecords += 1;
  const sourceRecordIndex = stats.totalRecords;

  if (line.length >= 2 && line[0] === 0x01) {
    const type = line[1];

    if (type === 0x07) {
      stats.headerRecords += 1;
      return;
    }

    if (type === 0x03) {
      stats.mode03Records += 1;
      const result = decodePayloadForValidation(line, 2, line.length - 2, 3);
      stats.decodedBytes += result.decodedBytes;
      const decodedLine = decodedTextDecoder.decode(decodePayloadToBytes(line, 2, line.length - 2, 3));
      parser.consume(decodedLine, { sourceRecordIndex });
      return;
    }

    if (type === 0x04) {
      stats.mode04Records += 1;
      const result = decodePayloadForValidation(line, 2, line.length - 2, 4);
      stats.decodedBytes += result.decodedBytes;
      const decodedLine = decodedTextDecoder.decode(decodePayloadToBytes(line, 2, line.length - 2, 4));
      parser.consume(decodedLine, { sourceRecordIndex });
      return;
    }

    stats.unknownRecords += 1;
    parser.recordUnknown();
    return;
  }

  if (line.length > 0) {
    stats.unknownRecords += 1;
    parser.recordUnknown();
  }
}

function processCompleteLines(buffer: ByteBuffer, stats: StreamingDecoderStats, parser: RaidParser): ByteBuffer {
  let lineStart = 0;

  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] !== 0x0a) {
      continue;
    }

    const line = trimLineEnding(buffer, lineStart, index);
    processRecordLine(line, stats, parser);
    lineStart = index + 1;
  }

  return buffer.slice(lineStart);
}

async function decodeFile(file: File): Promise<void> {
  cancelRequested = false;
  startedAt = performance.now();
  lastProgressAt = 0;

  const stats = createInitialStats(file);
  currentStats = stats;
  const parser = new RaidParser();
  let carry: ByteBuffer = new Uint8Array(0);

  try {
    currentReader = file.stream().getReader();
    maybePostProgress(stats, true);

    while (!cancelRequested) {
      const { value, done } = await currentReader.read();

      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      stats.processedBytes += value.byteLength;
      carry = processCompleteLines(concatCarry(carry, value), stats, parser);
      maybePostProgress(stats);
    }

    if (cancelRequested) {
      refreshRuntimeStats(stats);
      const result = parser.finalize(stats.totalRecords);
      postMessage({ type: "cancelled", stats: { ...stats }, raids: result.raids, debug: result.debug });
      return;
    }

    if (carry.length > 0) {
      const finalLine = trimLineEnding(carry, 0, carry.length);
      processRecordLine(finalLine, stats, parser);
      carry = new Uint8Array(0);
    }

    refreshRuntimeStats(stats);
    stats.progress = 100;
    const result = parser.finalize(stats.totalRecords);
    postMessage({ type: "complete", stats: { ...stats }, raids: result.raids, debug: result.debug });
  } catch (error) {
    if (cancelRequested) {
      refreshRuntimeStats(stats);
      const result = parser.finalize(stats.totalRecords);
      postMessage({ type: "cancelled", stats: { ...stats }, raids: result.raids, debug: result.debug });
      return;
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown streaming decoder error";
    refreshRuntimeStats(stats);
    postMessage({ type: "error", errorMessage, stats: { ...stats } });
  } finally {
    currentReader = null;
    currentStats = null;
  }
}

ctx.onmessage = (event: MessageEvent<DecoderWorkerRequest>) => {
  const message = event.data;

  if (message.type === "cancel") {
    cancelRequested = true;
    void currentReader?.cancel();
    return;
  }

  if (message.type === "start") {
    if (currentStats) {
      postMessage({
        type: "error",
        errorMessage: "Decoder is already processing a file.",
        stats: { ...currentStats },
      });
      return;
    }

    void decodeFile(message.file);
  }
};
