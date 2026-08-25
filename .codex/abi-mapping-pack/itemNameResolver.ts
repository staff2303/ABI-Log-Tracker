import { weaponMap } from "./weaponMap";
import { throwableMap } from "./throwableMap";
import { attachmentMap } from "./attachmentMap";
import { ammoMap } from "./ammoMap";
import { equipmentMap } from "./equipmentMap";
import { consumableMap } from "./consumableMap";
import { otherItemMap } from "./otherItemMap";

export const itemNameMap: Readonly<Record<string, string>> = {
  ...weaponMap,
  ...throwableMap,
  ...attachmentMap,
  ...ammoMap,
  ...equipmentMap,
  ...consumableMap,
  ...otherItemMap,
};

export function getMappedItemName(id: string | number | null | undefined): string | null {
  if (id === null || id === undefined) return null;
  const key = String(id);
  return itemNameMap[key] ?? null;
}

export function formatItemWithFallback(
  id: string | number | null | undefined,
  fallbackLabel = "Unknown"
): string {
  if (id === null || id === undefined) return "—";
  const key = String(id);
  return itemNameMap[key] ?? `${fallbackLabel} #${key}`;
}
