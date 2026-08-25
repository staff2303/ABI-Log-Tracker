import type { Nullable, Vector3 } from "../types/raid";

export const emptyValue = "—";

export function displayValue<T>(value: Nullable<T> | undefined): T | string {
  return value === null || value === undefined || value === "" ? emptyValue : value;
}

export function formatDateTime(value: string): string {
  return formatLocalDateTime(value, false);
}

export function formatLongDateTime(value: string): string {
  return formatLocalDateTime(value, true);
}

export function formatDateInputValue(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function formatLocalDateTime(value: string, includeSeconds: boolean): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return emptyValue;
  }

  const base = `${date.getFullYear()}.${pad2(date.getMonth() + 1)}.${pad2(date.getDate())} ${pad2(
    date.getHours(),
  )}:${pad2(date.getMinutes())}`;

  return includeSeconds ? `${base}:${pad2(date.getSeconds())}` : base;
}

export function formatNumber(value: Nullable<number> | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return emptyValue;
  }

  return new Intl.NumberFormat("ko-KR").format(value);
}

export function formatId(value: Nullable<number | string> | undefined): string {
  if (value === null || value === undefined || value === "") {
    return emptyValue;
  }

  return String(value);
}

export function formatBytes(value: Nullable<number> | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return emptyValue;
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let unitIndex = 0;
  let current = value;

  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }

  const digits = unitIndex === 0 ? 0 : current >= 100 ? 1 : 2;
  return `${current.toFixed(digits)} ${units[unitIndex]}`;
}

export function formatMilliseconds(value: Nullable<number> | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return emptyValue;
  }

  if (value < 1000) {
    return `${Math.round(value)} ms`;
  }

  return `${(value / 1000).toFixed(2)} s`;
}

export function formatLootValue(value: Nullable<number> | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return emptyValue;
  }

  return `${formatNumber(value)} Koen`;
}

export function formatDistance(value: Nullable<number> | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return emptyValue;
  }

  if (Math.abs(value) < 1000) {
    return `${formatNumber(Math.round(value))} m`;
  }

  const kilometers = value / 1000;
  const digits = Math.abs(kilometers) >= 10 ? 1 : 2;
  return `${kilometers.toFixed(digits)} km`;
}

export function formatPercent(value: Nullable<number> | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return emptyValue;
  }

  return `${Math.round(value * 100)}%`;
}

export function formatDecimal(value: Nullable<number> | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return emptyValue;
  }

  return value.toFixed(digits);
}

export function formatDuration(totalSeconds: Nullable<number> | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined || Number.isNaN(totalSeconds)) {
    return emptyValue;
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

export function formatVector(value: Nullable<Vector3> | undefined): string {
  if (!value || value.x === null || value.y === null || value.z === null) {
    return emptyValue;
  }

  return `X ${value.x.toFixed(1)} / Y ${value.y.toFixed(1)} / Z ${value.z.toFixed(1)}`;
}

export function formatBoolean(value: Nullable<boolean> | undefined): string {
  if (value === null || value === undefined) {
    return emptyValue;
  }

  return value ? "Yes" : "No";
}
