import { CURRENT_PARSER_VERSION, CURRENT_SCHEMA_VERSION } from "./constants";
import { calculateRaidCompleteness } from "./completeness";
import { createRaidMatchIdentity } from "./matchKey";
import type { Raid } from "../types/raid";
import type { ImportedSourceFile, RaidMergeAction, RaidMergeConflict, StoredRaid } from "./types";

export interface RaidMergeDecision {
  action: RaidMergeAction;
  raid: StoredRaid;
  conflicts: RaidMergeConflict[];
}

export function createStoredRaid(raid: Raid, sourceFileId: string, now = new Date().toISOString()): StoredRaid {
  const identity = createRaidMatchIdentity(raid);
  const completeness = calculateRaidCompleteness(raid);

  return {
    ...cloneRaid(raid),
    matchKey: identity.matchKey,
    matchIdentity: identity.matchIdentity,
    matchIdentityType: identity.matchIdentityType,
    parserVersion: CURRENT_PARSER_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    sourceFileIds: [sourceFileId],
    completeness,
    mergeMeta: {
      updatedFromDuplicate: false,
      conflicts: [],
    },
    startedAt: raid.basic.startedAt,
    mapId: raid.basic.mapId,
    mode: raid.basic.mode,
    zone: raid.basic.zone,
    result: raid.basic.result,
    teamType: raid.team.type,
  };
}

export function mergeStoredRaid(
  existing: StoredRaid | null,
  incoming: StoredRaid,
  sourceFile: ImportedSourceFile,
  now = new Date().toISOString(),
): RaidMergeDecision {
  if (!existing) {
    return {
      action: "INSERT",
      raid: {
        ...incoming,
        sourceFileIds: uniqueStrings([...incoming.sourceFileIds, sourceFile.id]),
        createdAt: incoming.createdAt || now,
        updatedAt: now,
      },
      conflicts: [],
    };
  }

  const sourceFileIds = uniqueStrings([...existing.sourceFileIds, ...incoming.sourceFileIds, sourceFile.id]);
  const equal = stableStringify(stripStorageMeta(existing)) === stableStringify(stripStorageMeta(incoming));
  const conflicts = collectTopLevelConflicts(existing, incoming);
  const incomingScore = incoming.completeness.score;
  const existingScore = existing.completeness.score;
  const action: RaidMergeAction = equal
    ? "SAME"
    : incomingScore > existingScore
      ? "UPDATE"
      : incomingScore < existingScore
        ? "KEEP"
        : "KEEP";

  if (action === "UPDATE") {
    const merged = mergePreferredRaid(incoming, existing, conflicts);
    return {
      action,
      raid: {
        ...merged,
        createdAt: existing.createdAt,
        updatedAt: now,
        sourceFileIds,
        completeness: calculateRaidCompleteness(merged),
        mergeMeta: {
          updatedFromDuplicate: true,
          conflicts,
        },
        startedAt: merged.basic.startedAt,
        mapId: merged.basic.mapId,
        mode: merged.basic.mode,
        zone: merged.basic.zone,
        result: merged.basic.result,
        teamType: merged.team.type,
      },
      conflicts,
    };
  }

  return {
    action,
    raid: {
      ...existing,
      updatedAt: sourceFileIds.length === existing.sourceFileIds.length ? existing.updatedAt : now,
      sourceFileIds,
      mergeMeta: {
        ...existing.mergeMeta,
        conflicts: uniqueConflicts([...(existing.mergeMeta?.conflicts ?? []), ...conflicts]),
      },
    },
    conflicts,
  };
}

function mergePreferredRaid(preferred: StoredRaid, fallback: StoredRaid, conflicts: RaidMergeConflict[]): StoredRaid {
  const merged = mergeNullish(preferred, fallback, "", conflicts) as StoredRaid;

  merged.kills = chooseArray(preferred.kills, fallback.kills);
  merged.incomingDamage = chooseArray(preferred.incomingDamage, fallback.incomingDamage);
  merged.death = chooseNullableObject(preferred.death, fallback.death);
  merged.rank = chooseNullableObject(preferred.rank, fallback.rank);
  merged.team = preferred.completeness.team === "resolved" ? preferred.team : fallback.team;

  return merged;
}

function mergeNullish(preferred: unknown, fallback: unknown, path: string, conflicts: RaidMergeConflict[]): unknown {
  if (preferred === null || preferred === undefined || preferred === "") {
    return cloneValue(fallback);
  }

  if (fallback === null || fallback === undefined || fallback === "") {
    return cloneValue(preferred);
  }

  if (Array.isArray(preferred) || Array.isArray(fallback)) {
    return cloneValue(preferred);
  }

  if (isPlainObject(preferred) && isPlainObject(fallback)) {
    const result: Record<string, unknown> = {};
    const keys = new Set([...Object.keys(preferred), ...Object.keys(fallback)]);

    keys.forEach((key) => {
      result[key] = mergeNullish(
        preferred[key],
        fallback[key],
        path ? `${path}.${key}` : key,
        conflicts,
      );
    });

    return result;
  }

  if (preferred !== fallback) {
    conflicts.push({
      path,
      existingValue: fallback,
      incomingValue: preferred,
      resolution: "kept-preferred",
    });
  }

  return cloneValue(preferred);
}

function chooseArray<T>(preferred: T[], fallback: T[]): T[] {
  return cloneValue(preferred.length >= fallback.length ? preferred : fallback);
}

function chooseNullableObject<T>(preferred: T | null, fallback: T | null): T | null {
  if (!preferred) {
    return cloneValue(fallback);
  }

  if (!fallback) {
    return cloneValue(preferred);
  }

  return cloneValue(preferred);
}

function collectTopLevelConflicts(existing: StoredRaid, incoming: StoredRaid): RaidMergeConflict[] {
  const conflicts: RaidMergeConflict[] = [];
  const fields = [
    ["basic.result", existing.basic.result, incoming.basic.result],
    ["basic.playTimeSeconds", existing.basic.playTimeSeconds, incoming.basic.playTimeSeconds],
    ["combat.pmcKills", existing.combat.pmcKills, incoming.combat.pmcKills],
    ["combat.aiKills", existing.combat.aiKills, incoming.combat.aiKills],
    ["combat.damage", existing.combat.damage, incoming.combat.damage],
    ["death.killerNickname", existing.death?.killerNickname ?? null, incoming.death?.killerNickname ?? null],
    ["death.finalDamage", existing.death?.finalDamage ?? null, incoming.death?.finalDamage ?? null],
  ] as const;

  fields.forEach(([path, existingValue, incomingValue]) => {
    if (
      existingValue !== null &&
      existingValue !== undefined &&
      incomingValue !== null &&
      incomingValue !== undefined &&
      existingValue !== incomingValue
    ) {
      conflicts.push({
        path,
        existingValue,
        incomingValue,
        resolution: incoming.completeness.score > existing.completeness.score ? "used-incoming" : "kept-existing",
      });
    }
  });

  return conflicts;
}

function stripStorageMeta(raid: StoredRaid): Raid {
  return {
    id: raid.id,
    basic: raid.basic,
    combat: raid.combat,
    kills: raid.kills,
    incomingDamage: raid.incomingDamage,
    death: raid.death,
    loot: raid.loot,
    survival: raid.survival,
    team: raid.team,
    rank: raid.rank,
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function uniqueConflicts(conflicts: RaidMergeConflict[]): RaidMergeConflict[] {
  const seen = new Set<string>();

  return conflicts.filter((conflict) => {
    const key = `${conflict.path}|${String(conflict.existingValue)}|${String(conflict.incomingValue)}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneRaid(raid: Raid): Raid {
  return cloneValue(raid);
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
