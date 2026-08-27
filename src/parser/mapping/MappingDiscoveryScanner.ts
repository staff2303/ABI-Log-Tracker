import type {
  MappingCandidateSource,
  MappingCategory,
  MappingConfidence,
  MappingDiscoveryCandidate,
  MappingDiscoveryEntry,
  MappingEvidenceType,
  MappingNamespace,
} from "../../db/mappingTypes";
import { createMappingKey } from "../../db/mappingIdentity";
import { isIgnoredMappingBlueprint } from "../../db/mappingCandidateFilters";

interface CandidateAggregate {
  value: string;
  occurrences: number;
  strongestEvidence: MappingEvidenceType;
  confidence: MappingConfidence;
  sample?: string;
}

interface MappingDiscoveryAggregate {
  rawId: string;
  namespace: MappingNamespace;
  category: MappingCategory;
  subcategory: string | null;
  suggestedCategory: MappingCategory | null;
  totalOccurrences: number;
  candidateNames: Map<string, CandidateAggregate>;
  blueprints: Map<string, CandidateAggregate>;
  evidenceTypes: Map<MappingEvidenceType, number>;
  firstRecordIndex?: number;
  lastRecordIndex?: number;
  sample?: string;
}

interface IdHit {
  id: string;
  namespace: MappingNamespace;
  category: MappingCategory;
  subcategory: string | null;
  suggestedCategory: MappingCategory | null;
}

interface MappingEventContext {
  eventType: string | null;
  ids: IdHit[];
  names: Set<string>;
  blueprints: Set<string>;
  firstRecordIndex: number;
  lastRecordIndex: number;
  sample?: string;
  overflowed: boolean;
}

interface MappingInstanceContext {
  key: string;
  ids: IdHit[];
  names: Set<string>;
  blueprints: Set<string>;
  lastRecordIndex: number;
  sample?: string;
  overflowed: boolean;
}

const sampleMaxLength = 360;
const maxInstanceContexts = 8000;
const instanceTtlRecords = 50_000;
const maxRelationIds = 6;
const maxRelationNames = 6;
const maxRelationBlueprints = 6;

const evidenceStrength: Record<MappingEvidenceType, number> = {
  confirmed_multi: 120,
  manual: 115,
  direct_name_id: 110,
  item_info: 108,
  bp_class_id: 90,
  map_info: 88,
  gid_correlation: 75,
  typed_field: 50,
  contextual: 35,
  id_pattern: 20,
  "direct-id-name": 100,
  "battle-result": 95,
  "direct-name": 90,
  "same-event": 80,
  "same-instance": 75,
  "blueprint": 50,
  "proximity": 20,
  "id-usage": 10,
  "user": 100,
  "imported": 90,
};

const rawNamePrefixes = [
  "weaponId",
  "armorId",
  "bodyPartId",
  "DeathCauserId",
  "ammoId",
  "MapId",
  "MapUnlockId",
  "DeathReason",
  "Unknown",
];

const idRules: Array<{
  labels: string[];
  namespace: MappingNamespace;
  category: MappingCategory;
  subcategory?: string | null;
  suggestedCategory?: MappingCategory | null;
  allowZero?: boolean;
}> = [
  {
    labels: ["weaponId", "WeaponId", "WeaponID", "KillerWeaponID", "KillerWeaponId", "DeathWeaponID"],
    namespace: "item",
    category: "weapon",
  },
  {
    labels: ["DeathCauserId", "DeathCauserID", "deathCauserId", "ammoId", "AmmoId", "AmmoID", "BulletId", "BulletID"],
    namespace: "item",
    category: "ammo",
  },
  {
    labels: ["armorId", "ArmorId", "ArmorID", "护甲ID"],
    namespace: "item",
    category: "equipment",
    suggestedCategory: "armor",
  },
  {
    labels: ["hitBodyPartId", "bodyPartId", "BodyPartId", "BodyPartID", "bodyPart"],
    namespace: "gameplay_tag",
    category: "bodyPart",
    allowZero: true,
  },
  {
    labels: ["MapUnlockId", "MapUnlockID", "MapId", "MapID", "mapId"],
    namespace: "map",
    category: "map",
  },
  {
    labels: ["ItemId", "ItemID", "itemId", "item_id", "TemplateId", "TemplateID"],
    namespace: "item",
    category: "loot",
  },
];

const nameLabels = [
  "WeaponName",
  "weaponName",
  "ItemName",
  "itemName",
  "DisplayName",
  "displayName",
  "ArmorName",
  "armorName",
  "AmmoName",
  "ammoName",
  "MapName",
  "mapName",
];

const instanceLabels = [
  "Instance",
  "InstanceId",
  "InstanceID",
  "ItemGuid",
  "ItemGUID",
  "Guid",
  "GUID",
  "ObjectId",
  "ObjectID",
];

const battleResultNeedles = [
  "Parse KillEnemyEvent",
  "BeKilledEvents",
  "Parse ShootEnemyEvents",
  "OprationResultPanel:Init",
];

export class MappingDiscoveryScanner {
  private readonly aggregates = new Map<string, MappingDiscoveryAggregate>();
  private readonly instanceContexts = new Map<string, MappingInstanceContext>();
  private currentEvent: MappingEventContext | null = null;

  shouldConsume(line: string): boolean {
    if (shouldScanMappingLine(line)) {
      return true;
    }

    return Boolean(
      this.currentEvent &&
        !this.currentEvent.overflowed &&
        (line.includes("BP_") || line.includes("DisplayName") || hasAnyIdNeedle(line)),
    );
  }

  consume(line: string, sourceRecordIndex: number): void {
    if (!this.shouldConsume(line)) {
      return;
    }

    this.consumeScannable(line, sourceRecordIndex);
  }

  consumeScannable(line: string, sourceRecordIndex: number): void {
    this.flushEventIfBoundary(line, sourceRecordIndex);

    const sample = createSample(line);
    const ids = extractIdHits(line);
    const names = extractCandidateNames(line);
    const blueprints = extractBlueprints(line);
    const directMap = extractGetMapInfoCandidate(line);
    const directMappings = extractDirectNameIdMappings(line);

    if (directMap) {
      this.recordId(directMap.id, "map", "map", "map", null, 1, "map_info", sourceRecordIndex, sample);
      this.recordCandidate(directMap.id, "map", "map", "map", null, directMap.name, "name", 1, "map_info", "high", sourceRecordIndex, sample);
    }

    directMappings.forEach((mapping) => {
      this.recordId(
        mapping.id,
        mapping.namespace,
        mapping.category,
        mapping.suggestedCategory,
        mapping.subcategory,
        1,
        mapping.evidenceType,
        sourceRecordIndex,
        sample,
      );
      this.recordCandidate(
        mapping.id,
        mapping.namespace,
        mapping.category,
        mapping.suggestedCategory,
        mapping.subcategory,
        mapping.name,
        "name",
        1,
        mapping.evidenceType,
        "high",
        sourceRecordIndex,
        sample,
      );
    });

    ids.forEach((hit) => {
      this.recordId(hit.id, hit.namespace, hit.category, hit.suggestedCategory, hit.subcategory, 1, "typed_field", sourceRecordIndex, sample);
    });

    this.recordDirectCandidates(ids, names, blueprints, sourceRecordIndex, sample);
    this.consumeEventContext(ids, names, blueprints, sourceRecordIndex, sample);
    this.consumeInstanceContexts(line, ids, names, blueprints, sourceRecordIndex, sample);
  }

  finalize(): MappingDiscoveryEntry[] {
    this.flushEventContext();

    return Array.from(this.aggregates.values())
      .sort(
        (left, right) =>
          left.namespace.localeCompare(right.namespace) ||
          left.rawId.localeCompare(right.rawId, undefined, { numeric: true }),
      )
      .map((aggregate) => ({
        id: createMappingKey(aggregate.namespace, aggregate.rawId, aggregate.namespace === "gameplay_tag") ?? `${aggregate.namespace}:${aggregate.rawId}`,
        namespace: aggregate.namespace,
        rawId: aggregate.rawId,
        category: aggregate.category,
        subcategory: aggregate.subcategory,
        suggestedCategory: aggregate.suggestedCategory,
        evidenceType: strongestEvidenceType(aggregate.evidenceTypes),
        confidence: confidenceForEvidence(strongestEvidenceType(aggregate.evidenceTypes)),
        occurrences: aggregate.totalOccurrences,
        sample: aggregate.sample,
        autoConfirm: shouldAutoConfirm(aggregate.evidenceTypes),
        candidates: [
          ...toDiscoveryCandidates(aggregate.candidateNames, "log"),
          ...toDiscoveryCandidates(aggregate.blueprints, "blueprint"),
        ],
      }));
  }

  getAggregateCount(): number {
    return this.aggregates.size;
  }

  private flushEventIfBoundary(line: string, sourceRecordIndex: number): void {
    if (!line.includes("ParseEvent start, event name:")) {
      return;
    }

    this.flushEventContext();
    this.currentEvent = {
      eventType: extractEventType(line),
      ids: [],
      names: new Set(),
      blueprints: new Set(),
      firstRecordIndex: sourceRecordIndex,
      lastRecordIndex: sourceRecordIndex,
      sample: createSample(line),
      overflowed: false,
    };
  }

  private consumeEventContext(
    ids: readonly IdHit[],
    names: readonly string[],
    blueprints: readonly string[],
    sourceRecordIndex: number,
    sample: string,
  ): void {
    if (!this.currentEvent) {
      return;
    }

    this.currentEvent.lastRecordIndex = sourceRecordIndex;
    this.currentEvent.sample ??= sample;
    ids.forEach((hit) => {
      if (!this.currentEvent) {
        return;
      }

      if (this.currentEvent.ids.length >= maxRelationIds) {
        this.currentEvent.overflowed = true;
        return;
      }

      this.currentEvent.ids.push(hit);
    });
    names.forEach((name) => {
      if (!this.currentEvent) {
        return;
      }

      if (this.currentEvent.names.size >= maxRelationNames) {
        this.currentEvent.overflowed = true;
        return;
      }

      this.currentEvent.names.add(name);
    });
    blueprints.forEach((blueprint) => {
      if (!this.currentEvent) {
        return;
      }

      if (this.currentEvent.blueprints.size >= maxRelationBlueprints) {
        this.currentEvent.overflowed = true;
        return;
      }

      this.currentEvent.blueprints.add(blueprint);
    });
  }

  private flushEventContext(): void {
    const event = this.currentEvent;
    this.currentEvent = null;

    if (!event || event.overflowed) {
      return;
    }

    const uniqueIds = uniqueHits(event.ids);

    for (const hit of uniqueIds) {
      for (const name of event.names) {
        this.recordCandidate(
          hit.id,
          hit.namespace,
          hit.category,
          hit.suggestedCategory,
          hit.subcategory,
          name,
          "name",
          1,
          "contextual",
          "medium",
          event.lastRecordIndex,
          event.sample,
        );
      }

      for (const blueprint of event.blueprints) {
        this.recordCandidate(
          hit.id,
          hit.namespace,
          hit.category,
          hit.suggestedCategory,
          hit.subcategory,
          blueprint,
          "blueprint",
          1,
          "bp_class_id",
          "medium",
          event.lastRecordIndex,
          event.sample,
        );
      }
    }
  }

  private consumeInstanceContexts(
    line: string,
    ids: readonly IdHit[],
    names: readonly string[],
    blueprints: readonly string[],
    sourceRecordIndex: number,
    sample: string,
  ): void {
    const instanceKeys = extractInstanceKeys(line);

    if (instanceKeys.length === 0) {
      if (sourceRecordIndex % 1000 === 0) {
        this.pruneInstanceContexts(sourceRecordIndex);
      }
      return;
    }

    for (const key of instanceKeys) {
      const context = this.instanceContexts.get(key) ?? {
        key,
        ids: [],
        names: new Set<string>(),
        blueprints: new Set<string>(),
        lastRecordIndex: sourceRecordIndex,
        sample,
        overflowed: false,
      };

      ids.forEach((hit) => {
        if (context.ids.length >= maxRelationIds) {
          context.overflowed = true;
          return;
        }

        context.ids.push(hit);
      });
      names.forEach((name) => {
        if (context.names.size >= maxRelationNames) {
          context.overflowed = true;
          return;
        }

        context.names.add(name);
      });
      blueprints.forEach((blueprint) => {
        if (context.blueprints.size >= maxRelationBlueprints) {
          context.overflowed = true;
          return;
        }

        context.blueprints.add(blueprint);
      });
      context.lastRecordIndex = sourceRecordIndex;
      context.sample ??= sample;
      this.instanceContexts.set(key, context);

      if (context.overflowed) {
        continue;
      }

      uniqueHits(context.ids).forEach((hit) => {
        context.names.forEach((name) => {
          this.recordCandidate(
            hit.id,
            hit.namespace,
            hit.category,
            hit.suggestedCategory,
            hit.subcategory,
            name,
            "name",
            1,
            "gid_correlation",
            "medium",
            sourceRecordIndex,
            context.sample,
          );
        });
        context.blueprints.forEach((blueprint) => {
          this.recordCandidate(
            hit.id,
            hit.namespace,
            hit.category,
            hit.suggestedCategory,
            hit.subcategory,
            blueprint,
            "blueprint",
            1,
            "bp_class_id",
            "medium",
            sourceRecordIndex,
            context.sample,
          );
        });
      });
    }

    this.pruneInstanceContexts(sourceRecordIndex);
  }

  private recordDirectCandidates(
    ids: readonly IdHit[],
    names: readonly string[],
    blueprints: readonly string[],
    sourceRecordIndex: number,
    sample: string,
  ): void {
    const uniqueIds = uniqueHits(ids);

    for (const category of ["weapon", "ammo", "equipment", "map", "loot"] satisfies MappingCategory[]) {
      const categoryIds = uniqueIds.filter((hit) => hit.category === category);

      if (categoryIds.length !== 1) {
        continue;
      }

      const [hit] = categoryIds;
      const matchingNames = names.filter((name) => nameMatchesCategory(name, category));

      if (matchingNames.length === 1) {
        this.recordCandidate(
          hit.id,
          hit.namespace,
          hit.category,
          hit.suggestedCategory,
          hit.subcategory,
          matchingNames[0],
          "name",
          1,
          "direct_name_id",
          "high",
          sourceRecordIndex,
          sample,
        );
      }
    }

    if (uniqueIds.length === 1) {
      const [hit] = uniqueIds;

      for (const blueprint of blueprints) {
        const blueprintCategory = inferCategoryFromBlueprint(blueprint) ?? hit.category;
        this.recordCandidate(
          hit.id,
          hit.namespace,
          blueprintCategory,
          hit.suggestedCategory,
          hit.subcategory,
          blueprint,
          "blueprint",
          1,
          "bp_class_id",
          "medium",
          sourceRecordIndex,
          sample,
        );
      }
    }

    const bracketMappings = extractBracketMappings(sample);
    bracketMappings.forEach((mapping) => {
      const category = inferCategoryFromLine(sample);
      const namespace = category === "map" ? "map" : "item";
      this.recordId(mapping.id, namespace, category, category, null, 1, "direct_name_id", sourceRecordIndex, sample);
      this.recordCandidate(mapping.id, namespace, category, category, null, mapping.name, "name", 1, "direct_name_id", "high", sourceRecordIndex, sample);
    });
  }

  private recordId(
    id: string,
    namespace: MappingNamespace,
    category: MappingCategory,
    suggestedCategory: MappingCategory | null,
    subcategory: string | null,
    occurrences: number,
    evidenceType: MappingEvidenceType,
    sourceRecordIndex: number,
    sample?: string,
  ): void {
    const aggregate = this.getOrCreateAggregate(id, namespace, category, suggestedCategory, subcategory);
    aggregate.totalOccurrences += occurrences;
    aggregate.evidenceTypes.set(evidenceType, (aggregate.evidenceTypes.get(evidenceType) ?? 0) + occurrences);
    aggregate.firstRecordIndex ??= sourceRecordIndex;
    aggregate.lastRecordIndex = sourceRecordIndex;
    aggregate.sample ??= sample;
  }

  private recordCandidate(
    id: string,
    namespace: MappingNamespace,
    category: MappingCategory,
    suggestedCategory: MappingCategory | null,
    subcategory: string | null,
    value: string,
    kind: "name" | "blueprint",
    occurrences: number,
    evidenceType: MappingEvidenceType,
    confidence: MappingConfidence,
    sourceRecordIndex: number,
    sample?: string,
  ): void {
    const candidate = cleanCandidate(value, kind);

    if (!candidate) {
      return;
    }

    const aggregate = this.getOrCreateAggregate(id, namespace, category, suggestedCategory, subcategory);
    const target = kind === "blueprint" ? aggregate.blueprints : aggregate.candidateNames;
    const current = target.get(candidate);

    if (!current) {
      target.set(candidate, {
        value: candidate,
        occurrences,
        strongestEvidence: evidenceType,
        confidence,
        sample,
      });
    } else {
      current.occurrences += occurrences;

      if (evidenceStrength[evidenceType] > evidenceStrength[current.strongestEvidence]) {
        current.strongestEvidence = evidenceType;
        current.confidence = confidence;
        current.sample = sample ?? current.sample;
      }
    }

    aggregate.evidenceTypes.set(evidenceType, (aggregate.evidenceTypes.get(evidenceType) ?? 0) + occurrences);
    aggregate.firstRecordIndex ??= sourceRecordIndex;
    aggregate.lastRecordIndex = sourceRecordIndex;
    aggregate.sample ??= sample;
  }

  private getOrCreateAggregate(
    id: string,
    namespace: MappingNamespace,
    category: MappingCategory,
    suggestedCategory: MappingCategory | null,
    subcategory: string | null,
  ): MappingDiscoveryAggregate {
    const key = createMappingKey(namespace, id, namespace === "gameplay_tag") ?? `${namespace}:${id}`;
    const current = this.aggregates.get(key);

    if (current) {
      if (current.category === "other" && category !== "other") {
        current.category = category;
      }
      if (current.category === "loot" && category !== "loot") {
        current.category = category;
      }
      current.subcategory ??= subcategory;
      current.suggestedCategory ??= suggestedCategory;
      return current;
    }

    const aggregate: MappingDiscoveryAggregate = {
      rawId: id,
      namespace,
      category,
      subcategory,
      suggestedCategory,
      totalOccurrences: 0,
      candidateNames: new Map(),
      blueprints: new Map(),
      evidenceTypes: new Map(),
    };

    this.aggregates.set(key, aggregate);
    return aggregate;
  }

  private pruneInstanceContexts(sourceRecordIndex: number): void {
    for (const [key, context] of this.instanceContexts) {
      if (sourceRecordIndex - context.lastRecordIndex > instanceTtlRecords) {
        this.instanceContexts.delete(key);
      }
    }

    if (this.instanceContexts.size <= maxInstanceContexts) {
      return;
    }

    const overflow = this.instanceContexts.size - maxInstanceContexts;
    const oldest = Array.from(this.instanceContexts.values())
      .sort((left, right) => left.lastRecordIndex - right.lastRecordIndex)
      .slice(0, overflow);

    oldest.forEach((context) => this.instanceContexts.delete(context.key));
  }
}

export function shouldScanMappingLine(line: string): boolean {
  if (line.includes("BattleResultModule")) {
    return battleResultNeedles.some((needle) => line.includes(needle));
  }

  return (
    line.includes("TeamUpUtil.GetMapInfoStr") ||
    line.includes("ParseEvent start, event name:") ||
    (line.includes("ItemInfo") && hasAnyIdNeedle(line)) ||
    (line.includes("DelItem") && /\b\d{4,}\b/.test(line)) ||
    ((line.includes("BP_") || line.includes("DisplayName")) && hasAnyIdNeedle(line))
  );
}

function hasAnyIdNeedle(line: string): boolean {
  return line.includes("Id") || line.includes("ID") || line.includes("护甲ID");
}

function extractIdHits(line: string): IdHit[] {
  const hits: IdHit[] = [];

  for (const rule of idRules) {
    for (const label of rule.labels) {
      for (const value of extractValuesAfterLabel(line, label)) {
        const id = normalizeId(value, rule.allowZero === true);

        if (id) {
          hits.push({
            id,
            namespace: rule.namespace,
            category: rule.category,
            subcategory: rule.subcategory ?? null,
            suggestedCategory: rule.suggestedCategory ?? rule.category,
          });
        }
      }
    }
  }

  return uniqueHits(hits);
}

function extractCandidateNames(line: string): string[] {
  return uniqueStrings(
    nameLabels
      .flatMap((label) => extractValuesAfterLabel(line, label))
      .map((value) => cleanCandidate(value, "name"))
      .filter(isPresent),
  );
}

function extractBlueprints(line: string): string[] {
  if (!line.includes("BP_")) {
    return [];
  }

  return uniqueStrings(Array.from(line.matchAll(/\bBP_[A-Za-z0-9_]+(?:_C)?\b/g), (match) => match[0]));
}

function extractInstanceKeys(line: string): string[] {
  const objectKeys = uniqueStrings(
    instanceLabels
      .flatMap((label) => extractValuesAfterLabel(line, label))
      .map((value) => value.trim().replace(/^"|"$/g, ""))
      .filter((value) => /^[A-Za-z0-9_-]{4,80}$/.test(value) && !/^\d+$/.test(value)),
  );
  const gidKeys = ["gid", "GID"]
    .flatMap((label) => extractValuesAfterLabel(line, label))
    .map((value) => value.trim().replace(/^"|"$/g, ""))
    .filter((value) => /^-?\d{4,}$/.test(value))
    .map((value) => `gid:${value}`);

  return uniqueStrings([...objectKeys, ...gidKeys]).slice(0, 4);
}

function extractValuesAfterLabel(line: string, label: string): string[] {
  if (!line.includes(label)) {
    return [];
  }

  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`${escaped}\\s*[:=]\\s*("([^"]*)"|'([^']*)'|([^,\\]\\[\\r\\n\\s}]+))`, "gi");
  const values: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    values.push((match[2] ?? match[3] ?? match[4] ?? "").trim());
  }

  return values;
}

function extractGetMapInfoCandidate(line: string): { id: string; name: string } | null {
  if (!line.includes("GetMapInfoStr")) {
    return null;
  }

  const match = line.match(/GetMapInfoStr\s+(\d+)\s+\d+\s+(?:Tactical Ops|Covert Ops)\s+(.+?)\s+(?:Normal|Lockdown Zone|Forbidden Zone)\b/);
  const id = normalizeId(match?.[1], false);
  const name = cleanCandidate(match?.[2], "name");

  return id && name ? { id, name } : null;
}

function extractDirectNameIdMappings(line: string): Array<{
  id: string;
  namespace: MappingNamespace;
  category: MappingCategory;
  subcategory: string | null;
  suggestedCategory: MappingCategory | null;
  name: string;
  evidenceType: MappingEvidenceType;
}> {
  const isDirectContext = /DelItem|ItemInfo|Warehouse|Inventory|Equip|Recommend|DisplayName|ItemName|WeaponName|AmmoName|ArmorName/i.test(line);

  if (!isDirectContext) {
    return [];
  }

  const mappings: Array<{
    id: string;
    namespace: MappingNamespace;
    category: MappingCategory;
    subcategory: string | null;
    suggestedCategory: MappingCategory | null;
    name: string;
    evidenceType: MappingEvidenceType;
  }> = [];

  if (line.includes("ItemInfo")) {
    const id = normalizeId(line.match(/\bid\s*[:=]\s*(\d{4,})\b/i)?.[1], false);
    const name = cleanCandidate(
      nameLabels.flatMap((label) => extractValuesAfterLabel(line, label)).find(Boolean) ??
        line.match(/\|\s*([^|:\r\n]{2,60})\s*$/)?.[1],
      "name",
    );

    if (id && name) {
      mappings.push({
        id,
        namespace: "item",
        category: inferCategoryFromLine(line) === "other" ? "loot" : inferCategoryFromLine(line),
        subcategory: null,
        suggestedCategory: inferCategoryFromLine(line) === "other" ? "loot" : inferCategoryFromLine(line),
        name,
        evidenceType: "item_info",
      });
    }
  }

  for (const match of line.matchAll(/([A-Za-z0-9][A-Za-z0-9 .+\-x×_/']{1,48})\s+(\d{4,})\b/g)) {
    const name = cleanCandidate(trimDirectName(match[1]), "name");
    const id = normalizeId(match[2], false);

    if (!id || !name) {
      continue;
    }

    const category = inferCategoryFromLine(line);
    mappings.push({
      id,
      namespace: category === "map" ? "map" : "item",
      category: category === "other" ? "loot" : category,
      subcategory: null,
      suggestedCategory: category === "other" ? "loot" : category,
      name,
      evidenceType: line.includes("ItemInfo") ? "item_info" : "direct_name_id",
    });
  }

  return mappings;
}

function trimDirectName(value: string): string {
  return value
    .replace(/^.*(?:DelItem|ItemInfo|DisplayName|ItemName|WeaponName|AmmoName|ArmorName)\s*[:=]?\s*/i, "")
    .trim();
}

function extractBracketMappings(line: string): Array<{ id: string; name: string }> {
  if (!line.includes(" [ ")) {
    return [];
  }

  return Array.from(line.matchAll(/\b(\d{4,})\s*\[\s*([^\]\r\n]{2,80})\s*\]/g))
    .map((match) => ({
      id: normalizeId(match[1], false),
      name: cleanCandidate(match[2], "name"),
    }))
    .filter((item): item is { id: string; name: string } => Boolean(item.id && item.name));
}

function extractEventType(line: string): string | null {
  const match = line.match(/ParseEvent start, event name:([A-Za-z0-9_]+)/);
  return match?.[1] ?? null;
}

function normalizeId(value: string | number | null | undefined, allowZero: boolean): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const text = String(value).trim().replace(/^"|"$/g, "");

  if (!/^-?\d+$/.test(text)) {
    return null;
  }

  if (text.startsWith("-")) {
    return null;
  }

  if (!allowZero && text === "0") {
    return null;
  }

  return text;
}

function cleanCandidate(value: string | null | undefined, kind: "name" | "blueprint"): string | null {
  const normalized = value?.trim().replace(/^"|"$/g, "");

  if (!normalized || normalized === "—") {
    return null;
  }

  if (kind === "blueprint") {
    return normalized.startsWith("BP_") && !isIgnoredMappingBlueprint(normalized) ? normalized : null;
  }

  if (/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    return null;
  }

  const lower = normalized.toLowerCase();

  if (rawNamePrefixes.some((prefix) => lower.startsWith(prefix.toLowerCase()))) {
    return null;
  }

  if (lower.includes("unknown")) {
    return null;
  }

  return normalized;
}

function nameMatchesCategory(name: string, category: MappingCategory): boolean {
  const lower = name.toLowerCase();

  if (category === "weapon") {
    return !lower.includes("armor") && !lower.includes("helmet") && !lower.includes("ammo");
  }

  if (category === "equipment") {
    return !lower.includes("ammo");
  }

  return true;
}

function inferCategoryFromLine(line: string): MappingCategory {
  if (/BP_Mag_|magazine|mag\b/i.test(line)) {
    return "magazine";
  }

  if (/BP_Helmet_|helmet/i.test(line)) {
    return "helmet";
  }

  if (/BP_Headsets_|headset/i.test(line)) {
    return "headset";
  }

  if (/BP_Backpack_|backpack/i.test(line)) {
    return "backpack";
  }

  if (/grenade|gas|molotov|throw/i.test(line)) {
    return "throwable";
  }

  if (/painkiller|medkit|first aid|surgical|bandage|heal/i.test(line)) {
    return "medical";
  }

  if (/drink|water|juice|soda/i.test(line)) {
    return "drink";
  }

  if (/food|provision|ration|biscuit/i.test(line)) {
    return "food";
  }

  if (/weapon/i.test(line)) {
    return "weapon";
  }

  if (/ammo|bullet/i.test(line)) {
    return "ammo";
  }

  if (/armor|helmet|护甲/i.test(line)) {
    return "equipment";
  }

  if (/map/i.test(line)) {
    return "map";
  }

  return "other";
}

function inferCategoryFromBlueprint(blueprint: string): MappingCategory | null {
  if (/^BP_Mag_/i.test(blueprint)) {
    return "magazine";
  }

  if (/^BP_Helmet_/i.test(blueprint)) {
    return "helmet";
  }

  if (/^BP_Headsets_/i.test(blueprint)) {
    return "headset";
  }

  if (/^BP_Backpack_/i.test(blueprint)) {
    return "backpack";
  }

  if (/^BP_Vest_|^BP_Armor_/i.test(blueprint)) {
    return "armor";
  }

  if (/^BP_\d+(?:x|×)\d+/i.test(blueprint)) {
    return "ammo";
  }

  return null;
}

function strongestEvidenceType(evidenceTypes: ReadonlyMap<MappingEvidenceType, number>): MappingEvidenceType {
  let selected: MappingEvidenceType = "typed_field";

  for (const type of evidenceTypes.keys()) {
    if (evidenceStrength[type] > evidenceStrength[selected]) {
      selected = type;
    }
  }

  return selected;
}

function confidenceForEvidence(evidenceType: MappingEvidenceType): MappingConfidence {
  if (evidenceStrength[evidenceType] >= 100) {
    return "confirmed";
  }

  if (evidenceStrength[evidenceType] >= 85) {
    return "high";
  }

  if (evidenceStrength[evidenceType] >= 50) {
    return "medium";
  }

  return "low";
}

function shouldAutoConfirm(evidenceTypes: ReadonlyMap<MappingEvidenceType, number>): boolean {
  const strongest = strongestEvidenceType(evidenceTypes);
  return strongest === "direct_name_id" || strongest === "item_info" || strongest === "map_info" || strongest === "direct-id-name";
}

function toDiscoveryCandidates(
  candidates: ReadonlyMap<string, CandidateAggregate>,
  source: MappingCandidateSource,
): MappingDiscoveryCandidate[] {
  return Array.from(candidates.values())
    .sort((left, right) => right.occurrences - left.occurrences || left.value.localeCompare(right.value))
    .map((candidate) => ({
      name: candidate.value,
      occurrences: candidate.occurrences,
      source,
      evidenceType: candidate.strongestEvidence,
      confidence: candidate.confidence,
      sample: candidate.sample,
    }));
}

function uniqueHits(hits: readonly IdHit[]): IdHit[] {
  const byKey = new Map<string, IdHit>();

  hits.forEach((hit) => {
    const key = `${hit.namespace}:${hit.id}:${hit.category}`;
    byKey.set(key, hit);
  });

  return Array.from(byKey.values());
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

function createSample(line: string): string {
  return line.replace(/\s+/g, " ").slice(0, sampleMaxLength);
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
