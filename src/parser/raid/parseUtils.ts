import type { Nullable } from "../../types/raid";

export interface LogLineMeta {
  timestamp: string | null;
}

export function parseLogTimestamp(line: string): string | null {
  const match = line.match(/\[(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2}):(\d{3})\]/);

  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second, ms] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${ms}+09:00`;
}

export function parseNumberValue(value: string | undefined): Nullable<number> {
  if (value === undefined) {
    return null;
  }

  const normalized = value.trim();

  if (normalized === "" || normalized.toLowerCase() === "nil") {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseBooleanValue(value: string | undefined): Nullable<boolean> {
  if (value === undefined) {
    return null;
  }

  const normalized = value.trim().replace(/^"|"$/g, "").toLowerCase();

  if (normalized === "true" || normalized === "1") {
    return true;
  }

  if (normalized === "false" || normalized === "0") {
    return false;
  }

  return null;
}

export function getNumberAfter(label: string, line: string): Nullable<number> {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = line.match(new RegExp(`${escapedLabel}\\s*:?\\s*(-?\\d+(?:\\.\\d+)?)`));
  return parseNumberValue(match?.[1]);
}

export function getTextBetween(line: string, startLabel: string, endLabel: string): string | null {
  const start = line.indexOf(startLabel);

  if (start < 0) {
    return null;
  }

  const valueStart = start + startLabel.length;
  const end = line.indexOf(endLabel, valueStart);

  if (end < 0) {
    return null;
  }

  const value = line.slice(valueStart, end).trim();
  return value === "" ? null : value;
}

export function getLuaLineNumber(line: string, fileName: string): number | null {
  const escapedFileName = fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = line.match(new RegExp(`${escapedFileName}:(\\d+)\\]`));
  return parseNumberValue(match?.[1]);
}

export function secondsToClock(seconds: Nullable<number>): string {
  if (seconds === null) {
    return "—";
  }

  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${rest
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes.toString().padStart(2, "0")}:${rest.toString().padStart(2, "0")}`;
}

export function subtractSeconds(iso: string, seconds: Nullable<number>): string {
  if (seconds === null) {
    return iso;
  }

  return new Date(new Date(iso).getTime() - seconds * 1000).toISOString();
}

export function parseLooseKeyValues(block: string): Record<string, string> {
  const values: Record<string, string> = {};
  const regex = /^\s*([A-Za-z_][\w]*)\s*=\s*("([^"]*)"|[^,\r\n]+),?/gm;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(block)) !== null) {
    values[match[1]] = (match[3] ?? match[2]).trim();
  }

  return values;
}

export function valueOrNull(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  const normalized = value.trim().replace(/^"|"$/g, "");
  return normalized === "" || normalized.toLowerCase() === "nil" ? null : normalized;
}
