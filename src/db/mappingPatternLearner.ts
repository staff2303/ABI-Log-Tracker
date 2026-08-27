import type { MappingCategory, MappingNamespace, MappingRecord } from "./mappingTypes";

export interface MappingPatternRule {
  namespace: MappingNamespace;
  prefix: string;
  prefixLength: number;
  category: MappingCategory;
  sampleCount: number;
  matchingCount: number;
  purity: number;
  status: "candidate" | "active" | "rejected" | "manual";
  generatedAt: string;
  updatedAt: string;
}

export interface PatternInferenceResult {
  mappings: MappingRecord[];
  rules: MappingPatternRule[];
  inferredCount: number;
}

const MIN_CONFIRMED_SAMPLES = 5;
const MIN_CATEGORY_PURITY = 0.95;
const MIN_PREFIX_LENGTH = 3;
const MAX_PREFIX_LENGTH = 6;

export function applyPatternInference(mappings: readonly MappingRecord[], now = new Date().toISOString()): PatternInferenceResult {
  const rules = learnPatternRules(mappings, now);
  let inferredCount = 0;
  const next = mappings.map((mapping) => {
    if (!canInferMapping(mapping)) {
      return mapping;
    }

    const rule = selectRuleForMapping(mapping, rules);

    if (!rule) {
      return mapping;
    }

    inferredCount += 1;
    return {
      ...mapping,
      category: rule.category,
      suggestedCategory: mapping.suggestedCategory ?? rule.category,
      status: "inferred" as const,
      confidence: "medium" as const,
      updatedAt: now,
      evidence: [
        ...mapping.evidence,
        {
          type: "id_pattern" as const,
          value: `${rule.namespace}:${rule.prefix}* -> ${rule.category}`,
          occurrences: 1,
          sourceFileId: null,
          observedCategory: rule.category,
        },
      ].slice(-20),
    };
  });

  return {
    mappings: next,
    rules,
    inferredCount,
  };
}

export function learnPatternRules(mappings: readonly MappingRecord[], now = new Date().toISOString()): MappingPatternRule[] {
  const confirmed = mappings.filter((mapping) => mapping.status === "confirmed" && mapping.namespace !== "unknown");
  const byNamespacePrefix = new Map<string, { namespace: MappingNamespace; prefix: string; categories: Map<MappingCategory, number> }>();

  confirmed.forEach((mapping) => {
    const maxLength = Math.min(MAX_PREFIX_LENGTH, mapping.rawId.length);

    for (let length = MIN_PREFIX_LENGTH; length <= maxLength; length += 1) {
      const prefix = mapping.rawId.slice(0, length);
      const key = `${mapping.namespace}:${prefix}`;
      const bucket =
        byNamespacePrefix.get(key) ??
        ({
          namespace: mapping.namespace,
          prefix,
          categories: new Map<MappingCategory, number>(),
        } satisfies { namespace: MappingNamespace; prefix: string; categories: Map<MappingCategory, number> });

      bucket.categories.set(mapping.category, (bucket.categories.get(mapping.category) ?? 0) + 1);
      byNamespacePrefix.set(key, bucket);
    }
  });

  return Array.from(byNamespacePrefix.values())
    .map((bucket) => {
      const sampleCount = Array.from(bucket.categories.values()).reduce((total, count) => total + count, 0);
      const [category, matchingCount] =
        Array.from(bucket.categories.entries()).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0] ??
        ["other", 0];
      const purity = sampleCount > 0 ? matchingCount / sampleCount : 0;

      return {
        namespace: bucket.namespace,
        prefix: bucket.prefix,
        prefixLength: bucket.prefix.length,
        category,
        sampleCount,
        matchingCount,
        purity,
        status: sampleCount >= MIN_CONFIRMED_SAMPLES && purity >= MIN_CATEGORY_PURITY ? "active" : "rejected",
        generatedAt: now,
        updatedAt: now,
      } satisfies MappingPatternRule;
    })
    .filter((rule) => rule.status === "active")
    .sort((left, right) => right.prefixLength - left.prefixLength || right.sampleCount - left.sampleCount);
}

function canInferMapping(mapping: MappingRecord): boolean {
  if (mapping.status === "confirmed" || mapping.status === "conflict") {
    return false;
  }

  if (mapping.name || mapping.displayName || mapping.userName || mapping.builtinName) {
    return false;
  }

  return mapping.namespace === "item" && ["other", "loot", "equipment"].includes(mapping.category);
}

function selectRuleForMapping(mapping: MappingRecord, rules: readonly MappingPatternRule[]): MappingPatternRule | null {
  return rules.find((rule) => rule.namespace === mapping.namespace && mapping.rawId.startsWith(rule.prefix)) ?? null;
}
