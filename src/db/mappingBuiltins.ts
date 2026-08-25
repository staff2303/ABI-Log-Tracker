import { bodyPartMap } from "../data/bodyPartMap";
import { ammoMap } from "../data/generated/ammoMap";
import { attachmentMap } from "../data/generated/attachmentMap";
import { consumableMap } from "../data/generated/consumableMap";
import { equipmentMap } from "../data/generated/equipmentMap";
import { mapMap } from "../data/generated/mapMap";
import { otherItemMap } from "../data/generated/otherItemMap";
import { throwableMap } from "../data/generated/throwableMap";
import { weaponMap } from "../data/generated/weaponMap";
import type { MappingCategory, MappingRecord } from "./mappingTypes";

interface BuiltInMappingSource {
  category: MappingCategory;
  map: Readonly<Record<string, string>>;
}

const builtInSources: BuiltInMappingSource[] = [
  { category: "weapon", map: weaponMap },
  { category: "ammo", map: ammoMap },
  { category: "equipment", map: equipmentMap },
  { category: "attachment", map: attachmentMap },
  { category: "throwable", map: throwableMap },
  { category: "medical", map: consumableMap },
  { category: "loot", map: otherItemMap },
  { category: "map", map: mapMap },
  { category: "bodyPart", map: bodyPartMap },
];

export function createBuiltInMappingRecords(now = new Date().toISOString()): MappingRecord[] {
  return builtInSources.flatMap(({ category, map }) =>
    Object.entries(map).map(([id, name]) => createBuiltInMappingRecord(id, name, category, now)),
  );
}

function createBuiltInMappingRecord(
  id: string,
  name: string,
  category: MappingCategory,
  now: string,
): MappingRecord {
  return {
    id: String(id),
    category,
    suggestedCategory: category,
    name,
    builtinName: name,
    userName: null,
    status: "confirmed",
    source: "builtin",
    aliases: [],
    rawBlueprint: null,
    confidence: "high",
    occurrenceCount: 0,
    firstSeenAt: null,
    lastSeenAt: null,
    sourceFileIds: [],
    createdAt: now,
    updatedAt: now,
    userEdited: false,
    notes: null,
    candidateNames: [],
    evidence: [
      {
        type: "direct-name",
        value: name,
        occurrences: 1,
        sourceFileId: null,
      },
    ],
  };
}
