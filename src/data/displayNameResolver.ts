import { ammoMap } from "./generated/ammoMap";
import { equipmentMap } from "./generated/equipmentMap";
import { itemNameMap } from "./generated/itemNameResolver";
import { mapMap } from "./generated/mapMap";
import { weaponMap } from "./generated/weaponMap";

type IdLike = string | number | null | undefined;

export function getMappedWeaponName(id: IdLike): string | null {
  return getMappedName(weaponMap, id);
}

export function getMappedAmmoName(id: IdLike): string | null {
  return getMappedName(ammoMap, id);
}

export function getMappedEquipmentName(id: IdLike): string | null {
  return getMappedName(equipmentMap, id);
}

export function getMappedMapName(id: IdLike): string | null {
  return getMappedName(mapMap, id);
}

export function formatWeaponDisplayName(id: IdLike, fallbackName: string | null | undefined = null): string | null {
  return formatMappedName([weaponMap, itemNameMap], id, fallbackName, "Unknown Weapon", ["weaponId"]);
}

export function formatAmmoDisplayName(id: IdLike, fallbackName: string | null | undefined = null): string | null {
  return formatMappedName([ammoMap, itemNameMap], id, fallbackName, "Unknown Ammo", ["DeathCauserId", "ammoId", "DeathReason"]);
}

export function formatEquipmentDisplayName(id: IdLike, fallbackName: string | null | undefined = null): string | null {
  return formatMappedName([equipmentMap, itemNameMap], id, fallbackName, "Unknown Equipment", ["armorId"]);
}

export function formatMapDisplayName(id: IdLike, fallbackName: string | null | undefined = null): string | null {
  return getMappedMapName(id) ?? cleanFallbackName(fallbackName, []) ?? null;
}

function getMappedName(map: Readonly<Record<string, string>>, id: IdLike): string | null {
  const key = normalizeId(id);
  return key === null ? null : map[key] ?? null;
}

function formatMappedName(
  maps: ReadonlyArray<Readonly<Record<string, string>>>,
  id: IdLike,
  fallbackName: string | null | undefined,
  unknownLabel: string,
  rawPrefixes: string[],
): string | null {
  const key = normalizeId(id);
  const mapped = key === null ? null : maps.map((map) => map[key]).find(Boolean) ?? null;

  if (mapped) {
    return mapped;
  }

  return cleanFallbackName(fallbackName, rawPrefixes) ?? (key === null ? null : unknownLabel);
}

function normalizeId(id: IdLike): string | null {
  if (id === null || id === undefined || id === "") {
    return null;
  }

  return String(id);
}

function cleanFallbackName(value: string | null | undefined, rawPrefixes: string[]): string | null {
  const normalized = value?.trim();

  if (!normalized || normalized === "—") {
    return null;
  }

  const lower = normalized.toLowerCase();

  if (rawPrefixes.some((prefix) => lower.startsWith(prefix.toLowerCase()))) {
    return null;
  }

  return normalized;
}
