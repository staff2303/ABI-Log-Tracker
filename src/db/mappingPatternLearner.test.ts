import { describe, expect, it } from "vitest";
import { applyPatternInference, learnPatternRules } from "./mappingPatternLearner";
import type { MappingCategory, MappingRecord } from "./mappingTypes";

describe("mapping pattern learner", () => {
  it("does not create rules when confirmed samples are insufficient", () => {
    const rules = learnPatternRules([
      createMappingRecord("201050001", "magazine"),
      createMappingRecord("201050002", "magazine"),
    ]);

    expect(rules).toHaveLength(0);
  });

  it("rejects low-purity prefixes", () => {
    const rules = learnPatternRules([
      createMappingRecord("201050001", "magazine"),
      createMappingRecord("201050002", "magazine"),
      createMappingRecord("201050003", "magazine"),
      createMappingRecord("201050004", "magazine"),
      createMappingRecord("201050005", "weapon"),
    ]);

    expect(rules.find((rule) => rule.prefix === "201050")).toBeUndefined();
  });

  it("infers category inside item namespace without generating a display name", () => {
    const confirmed = Array.from({ length: 5 }, (_, index) => createMappingRecord(`20105000${index + 1}`, "magazine"));
    const unresolved = createMappingRecord("201050099", "loot", { status: "typed", name: null, displayName: null, builtinName: null });
    const result = applyPatternInference([...confirmed, unresolved], "2026-08-26T00:00:00.000Z");
    const inferred = result.mappings.find((mapping) => mapping.rawId === "201050099");

    expect(inferred).toMatchObject({
      namespace: "item",
      category: "magazine",
      status: "inferred",
      displayName: null,
      name: null,
    });
  });

  it("never overrides confirmed direct names with pattern inference", () => {
    const confirmed = Array.from({ length: 5 }, (_, index) => createMappingRecord(`20105000${index + 1}`, "magazine"));
    const direct = createMappingRecord("201050099", "weapon", { displayName: "Direct Weapon", name: "Direct Weapon" });
    const result = applyPatternInference([...confirmed, direct]);
    const kept = result.mappings.find((mapping) => mapping.rawId === "201050099");

    expect(kept).toMatchObject({
      category: "weapon",
      status: "confirmed",
      displayName: "Direct Weapon",
    });
  });
});

function createMappingRecord(rawId: string, category: MappingCategory, overrides: Partial<MappingRecord> = {}): MappingRecord {
  return {
    id: `item:${rawId}`,
    namespace: "item",
    rawId,
    category,
    subcategory: null,
    suggestedCategory: category,
    name: `${category}-${rawId}`,
    displayName: `${category}-${rawId}`,
    builtinName: `${category}-${rawId}`,
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
    createdAt: "2026-08-26T00:00:00.000Z",
    updatedAt: "2026-08-26T00:00:00.000Z",
    userEdited: false,
    notes: null,
    candidateNames: [],
    evidence: [],
    ...overrides,
  };
}
