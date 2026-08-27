import type { Raid } from "../types/raid";
import type { MappingCategory, MappingDiscoveryEntry } from "./mappingTypes";
import { createMappingIdentity, namespaceForCategory } from "./mappingIdentity";

type IdLike = string | number | null | undefined;

const rawNamePrefixes = [
  "weaponId",
  "armorId",
  "bodyPartId",
  "DeathCauserId",
  "ammoId",
  "DeathReason",
  "Unknown",
];

export function collectMappingDiscoveriesFromRaids(raids: readonly Raid[]): MappingDiscoveryEntry[] {
  const entries: MappingDiscoveryEntry[] = [];

  for (const raid of raids) {
    pushId(entries, raid.basic.mapId, "map", raid.basic.mapName ?? raid.basic.map, "battle-result");

    raid.kills.forEach((kill) => {
      pushId(entries, kill.weaponId, "weapon", kill.weaponName, "id-usage");
      pushId(entries, kill.armorId, "equipment", kill.armorName, "id-usage", "armor");
      pushId(entries, kill.hitBodyPartId, "bodyPart", kill.bodyPartName, "id-usage");
    });

    raid.incomingDamage.forEach((event) => {
      pushId(entries, event.deathCauserId, "ammo", null, "id-usage");
      pushId(entries, event.armorId, "equipment", null, "id-usage", "armor");
    });

    if (raid.death) {
      pushId(entries, raid.death.weaponId, "weapon", raid.death.weaponName, "id-usage");
      pushId(entries, raid.death.deathCauserId ?? raid.death.ammoId, "ammo", raid.death.ammoName, "id-usage");
      pushId(entries, raid.death.armorId, "equipment", raid.death.armorName, "id-usage", "armor");
      pushId(entries, raid.death.hitBodyPartId, "bodyPart", raid.death.hitBodyPartName, "id-usage");
    }
  }

  return entries;
}

function pushId(
  target: MappingDiscoveryEntry[],
  id: IdLike,
  category: MappingCategory,
  candidateName: string | null | undefined,
  evidenceType: MappingDiscoveryEntry["evidenceType"],
  suggestedCategory: MappingCategory | null = category,
): void {
  const normalizedId = normalizeId(id);
  const cleanedCandidateName = cleanCandidateName(candidateName);
  const namespace = namespaceForCategory(category);
  const identity = createMappingIdentity(namespace, normalizedId ?? (String(id).trim() === "0" ? "0" : null), category === "bodyPart");

  if (!identity) {
    return;
  }

  target.push({
    id: identity.id,
    namespace: identity.namespace,
    rawId: identity.rawId,
    category,
    suggestedCategory,
    candidateName: cleanedCandidateName,
    confidence: cleanedCandidateName ? "medium" : "low",
    evidenceType: evidenceType === "battle-result" ? "map_info" : "typed_field",
    autoConfirm: false,
  });
}

export function normalizeMappingId(id: IdLike): string | null {
  return normalizeId(id);
}

function normalizeId(id: IdLike): string | null {
  if (id === null || id === undefined || id === "") {
    return null;
  }

  const normalized = String(id).trim();

  if (!normalized || normalized === "0") {
    return null;
  }

  return normalized;
}

function cleanCandidateName(name: string | null | undefined): string | null {
  const normalized = name?.trim();

  if (!normalized || normalized === "—") {
    return null;
  }

  const lower = normalized.toLowerCase();

  if (rawNamePrefixes.some((prefix) => lower.startsWith(prefix.toLowerCase()))) {
    return null;
  }

  return normalized;
}
