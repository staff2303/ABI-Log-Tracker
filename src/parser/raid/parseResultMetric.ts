import type { Nullable } from "../../types/raid";
import { parseNumberValue } from "./parseUtils";

const metricMarker = "\u672c\u5730\u8ba1\u7b97\u7684\u7ed3\u7b97\u7ed3\u679c\u503c";

export type ResultMetricLabel =
  | "Operators Eliminated"
  | "Militants Eliminated"
  | "Body Damage"
  | "Armor Durability Damage"
  | "Hits"
  | "Ammo Used"
  | "Overall Accuracy"
  | "Longest Kill Streak"
  | "total_out_value"
  | "Containers Searched"
  | "Premium Containers Searched"
  | "XP from looting"
  | "XP from unlocking"
  | "Extraction XP"
  | "Loot Found"
  | "Weapons Found"
  | "Attachments Found"
  | "Equipment Found"
  | "Total HP Lost"
  | "Total Healed"
  | "Broken Limbs"
  | "Debuffs Removed"
  | "Provisions Spent"
  | "Kilometers Traveled"
  | "Falls"
  | "Teammates Rescued"
  | "Times Rescued"
  | "No. of Support";

const resultMetricLabels: ResultMetricLabel[] = [
  "Armor Durability Damage",
  "Premium Containers Searched",
  "Operators Eliminated",
  "Militants Eliminated",
  "Longest Kill Streak",
  "Kilometers Traveled",
  "Overall Accuracy",
  "Containers Searched",
  "Provisions Spent",
  "Teammates Rescued",
  "Times Rescued",
  "No. of Support",
  "Attachments Found",
  "Equipment Found",
  "XP from unlocking",
  "XP from looting",
  "Extraction XP",
  "Body Damage",
  "Weapons Found",
  "Total HP Lost",
  "Total Healed",
  "Broken Limbs",
  "Debuffs Removed",
  "Loot Found",
  "Ammo Used",
  "total_out_value",
  "Falls",
  "Hits",
];

export interface ResultMetric {
  label: ResultMetricLabel;
  value: Nullable<number>;
  percent: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseResultMetric(line: string): ResultMetric | null {
  const isMetricLine = line.includes(metricMarker) || line.includes("overviewData total_out_value");

  if (!isMetricLine) {
    return null;
  }

  for (const label of resultMetricLabels) {
    if (!line.includes(label)) {
      continue;
    }

    const match = line.match(new RegExp(`${escapeRegExp(label)}\\s+(-?\\d+(?:\\.\\d+)?)(%)?`));

    if (!match) {
      continue;
    }

    return {
      label,
      value: parseNumberValue(match[1]),
      percent: Boolean(match[2]),
    };
  }

  return null;
}
