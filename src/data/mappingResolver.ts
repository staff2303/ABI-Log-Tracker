import type { MappingCategory, MappingRecord } from "../db/mappingTypes";

type IdLike = string | number | null | undefined;

interface ResolveOptions {
  category: MappingCategory;
  unknownLabel: string;
  fallbackName?: string | null;
  rawPrefixes?: string[];
}

export interface MappingResolver {
  resolve: (id: IdLike, options: ResolveOptions) => string | null;
  weapon: (id: IdLike, fallbackName?: string | null) => string | null;
  ammo: (id: IdLike, fallbackName?: string | null) => string | null;
  equipment: (id: IdLike, fallbackName?: string | null) => string | null;
  map: (id: IdLike, fallbackName?: string | null) => string | null;
  bodyPart: (id: IdLike, fallbackName?: string | null) => string | null;
}

const emptyMappings = new Map<string, MappingRecord>();

export const staticFallbackResolver: MappingResolver = createMappingResolver([]);

export function createMappingResolver(mappings: readonly MappingRecord[]): MappingResolver {
  const byId = new Map(mappings.map((mapping) => [mapping.id, mapping]));

  return {
    resolve: (id, options) => resolveMappingName(byId, id, options),
    weapon: (id, fallbackName = null) =>
      resolveMappingName(byId, id, {
        category: "weapon",
        fallbackName,
        unknownLabel: "Unknown Weapon",
        rawPrefixes: ["weaponId"],
      }),
    ammo: (id, fallbackName = null) =>
      resolveMappingName(byId, id, {
        category: "ammo",
        fallbackName,
        unknownLabel: "Unknown Ammo",
        rawPrefixes: ["DeathCauserId", "ammoId", "DeathReason"],
      }),
    equipment: (id, fallbackName = null) =>
      resolveMappingName(byId, id, {
        category: "equipment",
        fallbackName,
        unknownLabel: "Unknown Equipment",
        rawPrefixes: ["armorId"],
      }),
    map: (id, fallbackName = null) =>
      resolveMappingName(byId, id, {
        category: "map",
        fallbackName,
        unknownLabel: "Unknown Map",
      }),
    bodyPart: (id, fallbackName = null) =>
      resolveMappingName(byId, id, {
        category: "bodyPart",
        fallbackName,
        unknownLabel: "Unknown Body Part",
        rawPrefixes: ["bodyPartId"],
      }),
  };
}

export function resolveMappingName(
  mappingsById: ReadonlyMap<string, MappingRecord> = emptyMappings,
  id: IdLike,
  options: ResolveOptions,
): string | null {
  const key = normalizeId(id);

  if (!key) {
    return cleanFallbackName(options.fallbackName, options.rawPrefixes ?? []);
  }

  const record = mappingsById.get(key);
  const mappedName = record ? getConfirmedDisplayName(record) : null;

  if (mappedName) {
    return mappedName;
  }

  const fallback = cleanFallbackName(options.fallbackName, options.rawPrefixes ?? []);

  if (fallback && (!record || record.status === "confirmed")) {
    return fallback;
  }

  return options.unknownLabel;
}

export function getConfirmedDisplayName(record: MappingRecord): string | null {
  if (record.userEdited && record.userName) {
    return record.userName;
  }

  if (record.status === "confirmed") {
    return record.name ?? record.builtinName ?? null;
  }

  return null;
}

export function normalizeId(id: IdLike): string | null {
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
