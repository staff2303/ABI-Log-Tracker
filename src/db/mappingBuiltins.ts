import { bodyPartMap } from "../data/bodyPartMap";
import { ammoMap } from "../data/generated/ammoMap";
import { attachmentMap } from "../data/generated/attachmentMap";
import { consumableMap } from "../data/generated/consumableMap";
import { equipmentMap } from "../data/generated/equipmentMap";
import { mapMap } from "../data/generated/mapMap";
import { otherItemMap } from "../data/generated/otherItemMap";
import { throwableMap } from "../data/generated/throwableMap";
import { weaponMap } from "../data/generated/weaponMap";
import { createMappingIdentity, namespaceForCategory } from "./mappingIdentity";
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
  const namespace = namespaceForCategory(category);
  const identity = createMappingIdentity(namespace, id, namespace === "gameplay_tag");
  const mappingId = identity?.id ?? `${namespace}:${id}`;
  const rawId = identity?.rawId ?? String(id);

  return {
    id: mappingId,
    namespace,
    rawId,
    category,
    subcategory: null,
    suggestedCategory: category,
    name,
    displayName: name,
    builtinName: name,
    userName: null,
    internalName: null,
    canonicalInternalName: null,
    status: "confirmed",
    source: "builtin",
    aliases: [],
    rawBlueprint: null,
    confidence: "confirmed",
    confirmationType: "builtin",
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
        type: "direct_name_id",
        value: name,
        occurrences: 1,
        sourceFileId: null,
        observedName: name,
        observedCategory: category,
      },
    ],
  };
}
