import type {
  DeathDetail,
  IncomingDamageDetail,
  KillDetail,
  RaidResult,
  RaidTeamType,
  SquadType,
  TeamMember,
  TeamMemberStatus,
  Vector3,
} from "../types/raid";
import type { MappingCandidateName, MappingEvidence, MappingRecord } from "./mappingTypes";
import { identityFromMappingInput, namespaceForCategory, parseRawIdFromCompositeId } from "./mappingIdentity";
import type {
  ImportedSourceFile,
  ImportHistory,
  RaidCompleteness,
  RaidMergeConflict,
  StoredRaid,
  StorageInfo,
} from "./types";
import { invokeCommand } from "./tauriClient";

type SqliteRow = Record<string, unknown>;

interface RawTrackerState {
  dbInfo: SqliteDatabaseInfo;
  raids: SqliteRow[];
  raidSourceFiles: SqliteRow[];
  raidConflicts: SqliteRow[];
  kills: SqliteRow[];
  incomingDamage: SqliteRow[];
  deaths: SqliteRow[];
  teamMembers: SqliteRow[];
  sourceFiles: SqliteRow[];
  importHistory: SqliteRow[];
  mappings: SqliteRow[];
  mappingAliases: SqliteRow[];
  mappingEvidence: SqliteRow[];
  mappingCandidates: SqliteRow[];
  mappingSourceFiles: SqliteRow[];
  settings: SqliteRow[];
}

export interface SqliteDatabaseInfo {
  path: string;
  folder: string;
  filename: string;
  schemaVersion: string;
  dbSize: number;
  journalMode: string;
  raidCount: number;
  killCount: number;
  incomingDamageCount: number;
  deathCount: number;
  mappingCount: number;
  unconfirmedMappingCount: number;
  conflictMappingCount: number;
  importCount: number;
}

export interface TrackerState {
  dbInfo: SqliteDatabaseInfo;
  raids: StoredRaid[];
  sourceFiles: ImportedSourceFile[];
  importHistory: ImportHistory[];
  mappings: MappingRecord[];
  settings: Record<string, unknown>;
}

export async function loadTrackerState(): Promise<TrackerState> {
  return normalizeTrackerState(await invokeCommand<RawTrackerState>("get_tracker_state"));
}

export async function loadDatabaseInfo(): Promise<SqliteDatabaseInfo> {
  return normalizeDatabaseInfo(await invokeCommand<SqliteDatabaseInfo>("get_database_info"));
}

export function storageInfoFromDatabaseInfo(info: SqliteDatabaseInfo): StorageInfo {
  return {
    persisted: true,
    usage: info.dbSize,
    quota: null,
    dbPath: info.path,
    dbFolder: info.folder,
    journalMode: info.journalMode,
  };
}

function normalizeTrackerState(raw: RawTrackerState): TrackerState {
  return {
    dbInfo: normalizeDatabaseInfo(raw.dbInfo),
    raids: reconstructRaids(raw),
    sourceFiles: raw.sourceFiles.map(toSourceFile),
    importHistory: raw.importHistory.map(toImportHistory),
    mappings: reconstructMappings(raw),
    settings: Object.fromEntries(raw.settings.map((row) => [text(row, "key") ?? "", parseSettingValue(row)])),
  };
}

function normalizeDatabaseInfo(info: SqliteDatabaseInfo): SqliteDatabaseInfo {
  return {
    path: String(info.path ?? ""),
    folder: String(info.folder ?? ""),
    filename: String(info.filename ?? "abi-tracker.db"),
    schemaVersion: String(info.schemaVersion ?? ""),
    dbSize: Number(info.dbSize ?? 0),
    journalMode: String(info.journalMode ?? "unknown"),
    raidCount: Number(info.raidCount ?? 0),
    killCount: Number(info.killCount ?? 0),
    incomingDamageCount: Number(info.incomingDamageCount ?? 0),
    deathCount: Number(info.deathCount ?? 0),
    mappingCount: Number(info.mappingCount ?? 0),
    unconfirmedMappingCount: Number(info.unconfirmedMappingCount ?? 0),
    conflictMappingCount: Number(info.conflictMappingCount ?? 0),
    importCount: Number(info.importCount ?? 0),
  };
}

function reconstructRaids(raw: RawTrackerState): StoredRaid[] {
  const sourceFilesByRaid = groupRows(raw.raidSourceFiles, "raid_match_key");
  const conflictsByRaid = groupRows(raw.raidConflicts, "raid_match_key");
  const killsByRaid = groupRows(raw.kills, "raid_match_key");
  const incomingByRaid = groupRows(raw.incomingDamage, "raid_match_key");
  const deathByRaid = new Map(raw.deaths.map((row) => [text(row, "raid_match_key") ?? "", row]));
  const teamMembersByRaid = groupRows(raw.teamMembers, "raid_match_key");

  return raw.raids.map((row) => {
    const matchKey = text(row, "match_key") ?? "";
    const sourceFileIds = sourceFilesByRaid.get(matchKey)?.map((item) => text(item, "source_file_id")).filter(isPresent) ?? [];
    const conflicts = conflictsByRaid.get(matchKey)?.map(toRaidConflict) ?? [];
    const members = teamMembersByRaid.get(matchKey)?.map(toTeamMember) ?? [];
    const rank = bool(row, "rank_present") ? {
      previousRank: text(row, "rank_previous_rank"),
      nextRank: text(row, "rank_next_rank"),
      previousRankLevel: number(row, "rank_previous_rank_level"),
      nextRankLevel: number(row, "rank_next_rank_level"),
      previousScore: number(row, "rank_previous_score"),
      nextScore: number(row, "rank_next_score"),
      rawScoreDelta: number(row, "rank_raw_score_delta"),
      delta: number(row, "rank_delta"),
      pointsPerRankLevel: number(row, "rank_points_per_rank_level"),
    } : null;

    return {
      id: text(row, "raid_id") ?? matchKey,
      matchKey,
      matchIdentity: text(row, "match_identity") ?? matchKey,
      matchIdentityType: (text(row, "match_identity_type") === "room-id" ? "room-id" : "fallback"),
      parserVersion: text(row, "parser_version") ?? "",
      schemaVersion: number(row, "schema_version") ?? 0,
      createdAt: text(row, "created_at") ?? "",
      updatedAt: text(row, "updated_at") ?? "",
      sourceFileIds,
      completeness: toCompleteness(row),
      mergeMeta: {
        updatedFromDuplicate: bool(row, "merge_updated_from_duplicate") ?? false,
        conflicts,
      },
      startedAt: text(row, "started_at") ?? text(row, "basic_started_at") ?? "",
      mapId: id(row, "map_id"),
      mode: text(row, "mode"),
      zone: text(row, "zone"),
      result: toRaidResult(text(row, "result")),
      teamType: text(row, "team_type") ?? "unknown",
      basic: {
        startedAt: text(row, "basic_started_at") ?? text(row, "started_at") ?? "",
        endedAt: text(row, "basic_ended_at") ?? "",
        dateTime: text(row, "basic_date_time") ?? text(row, "basic_started_at") ?? text(row, "started_at") ?? "",
        mapId: id(row, "basic_map_id"),
        mapUnlockId: id(row, "basic_map_unlock_id"),
        mapName: text(row, "basic_map_name"),
        map: text(row, "basic_map"),
        modeId: id(row, "basic_mode_id"),
        mode: text(row, "basic_mode") ?? text(row, "mode"),
        zone: text(row, "basic_zone") ?? text(row, "zone"),
        teamType: id(row, "basic_team_type"),
        hasTeammate: bool(row, "basic_has_teammate"),
        localPlayerNickname: text(row, "basic_local_player_nickname"),
        squad: toSquad(text(row, "basic_squad")),
        playTimeSeconds: number(row, "basic_play_time_seconds"),
        durationSeconds: number(row, "basic_duration_seconds"),
        result: toRaidResult(text(row, "basic_result") ?? text(row, "result")),
      },
      combat: {
        pmcKills: number(row, "combat_pmc_kills"),
        aiKills: number(row, "combat_ai_kills"),
        damage: number(row, "combat_damage"),
        armorDamage: number(row, "combat_armor_damage"),
        hits: number(row, "combat_hits"),
        shots: number(row, "combat_shots"),
        accuracy: number(row, "combat_accuracy"),
        killStreak: number(row, "combat_kill_streak"),
      },
      kills: killsByRaid.get(matchKey)?.map(toKillDetail) ?? [],
      incomingDamage: incomingByRaid.get(matchKey)?.map(toIncomingDamage) ?? [],
      death: deathByRaid.has(matchKey) ? toDeathDetail(deathByRaid.get(matchKey)!) : null,
      loot: {
        extractedValue: number(row, "loot_extracted_value"),
        itemsFound: number(row, "loot_items_found"),
        weaponsFound: number(row, "loot_weapons_found"),
        attachmentsFound: number(row, "loot_attachments_found"),
        gearFound: number(row, "loot_gear_found"),
        containers: number(row, "loot_containers"),
        premiumContainers: number(row, "loot_premium_containers"),
        xpFromLooting: number(row, "loot_xp_from_looting"),
        xpFromUnlocking: number(row, "loot_xp_from_unlocking"),
        extractionXp: number(row, "loot_extraction_xp"),
      },
      survival: {
        hpLoss: number(row, "survival_hp_loss"),
        healingDone: number(row, "survival_healing_done"),
        fractures: number(row, "survival_fractures"),
        debuffs: number(row, "survival_debuffs"),
        foodDrinksConsumed: number(row, "survival_food_drinks_consumed"),
        distanceMeters: number(row, "survival_distance_meters"),
        falls: number(row, "survival_falls"),
        teammatesRescued: number(row, "survival_teammates_rescued"),
        timesRescued: number(row, "survival_times_rescued"),
        supportActions: number(row, "survival_support_actions"),
      },
      team: {
        type: toTeamType(text(row, "team_detail_type")),
        isTeam: bool(row, "team_is_team") ?? false,
        memberCount: number(row, "team_member_count"),
        members,
        localPlayerNickname: text(row, "team_local_player_nickname"),
        resolution: text(row, "team_resolution"),
        teammateRescues: number(row, "team_teammate_rescues"),
        rescuedByTeammate: number(row, "team_rescued_by_teammate"),
        supportActions: number(row, "team_support_actions"),
      },
      rank,
    };
  });
}

function reconstructMappings(raw: RawTrackerState): MappingRecord[] {
  const aliasesByMapping = groupRows(raw.mappingAliases, "mapping_id");
  const sourceFilesByMapping = groupRows(raw.mappingSourceFiles, "mapping_id");
  const evidenceByMapping = groupRows(raw.mappingEvidence, "mapping_id");
  const candidatesByMapping = groupRows(raw.mappingCandidates, "mapping_id");

  return raw.mappings.map((row) => {
    const mappingId = text(row, "id") ?? "";
    const category = (text(row, "category") ?? "other") as MappingRecord["category"];
    const identity =
      identityFromMappingInput({
        id: mappingId,
        namespace: text(row, "namespace") as MappingRecord["namespace"],
        rawId: text(row, "raw_id"),
        category,
      }) ?? null;
    const namespace = identity?.namespace ?? (text(row, "namespace") as MappingRecord["namespace"]) ?? namespaceForCategory(category);
    const rawId = identity?.rawId ?? text(row, "raw_id") ?? parseRawIdFromCompositeId(mappingId) ?? mappingId;

    return {
      id: identity?.id ?? mappingId,
      namespace,
      rawId,
      category,
      subcategory: text(row, "subcategory"),
      suggestedCategory: text(row, "suggested_category") as MappingRecord["suggestedCategory"],
      name: text(row, "name"),
      displayName: text(row, "display_name") ?? text(row, "name"),
      builtinName: text(row, "builtin_name"),
      userName: text(row, "user_name"),
      internalName: text(row, "internal_name") ?? text(row, "raw_blueprint"),
      canonicalInternalName: text(row, "canonical_internal_name"),
      status: (text(row, "status") ?? "unconfirmed") as MappingRecord["status"],
      source: (text(row, "source") ?? "log") as MappingRecord["source"],
      aliases: aliasesByMapping.get(mappingId)?.map((item) => text(item, "alias")).filter(isPresent) ?? [],
      rawBlueprint: text(row, "raw_blueprint"),
      confidence: text(row, "confidence") as MappingRecord["confidence"],
      confirmationType: text(row, "confirmation_type"),
      occurrenceCount: number(row, "occurrence_count") ?? 0,
      firstSeenAt: text(row, "first_seen_at"),
      lastSeenAt: text(row, "last_seen_at"),
      sourceFileIds: sourceFilesByMapping.get(mappingId)?.map((item) => text(item, "source_file_id")).filter(isPresent) ?? [],
      createdAt: text(row, "created_at") ?? "",
      updatedAt: text(row, "updated_at") ?? "",
      userEdited: bool(row, "user_edited") ?? false,
      notes: text(row, "notes"),
      candidateNames: candidatesByMapping.get(mappingId)?.map(toMappingCandidate) ?? [],
      evidence: evidenceByMapping.get(mappingId)?.map(toMappingEvidence) ?? [],
    };
  });
}

function toKillDetail(row: SqliteRow): KillDetail {
  return {
    sourceRecordIndex: number(row, "source_record_index"),
    time: text(row, "time") ?? "",
    killTimestamp: number(row, "kill_timestamp"),
    enemyGid: text(row, "enemy_gid"),
    opponentNickname: text(row, "opponent_nickname") ?? "Unknown",
    opponentType: (text(row, "opponent_type") ?? "unknown") as KillDetail["opponentType"],
    enemyIdentity: number(row, "enemy_identity"),
    weaponId: id(row, "weapon_id"),
    weaponName: text(row, "weapon_name"),
    weapon: text(row, "weapon"),
    hitBodyPartId: id(row, "hit_body_part_id"),
    bodyPartName: text(row, "body_part_name"),
    bodyPart: text(row, "body_part"),
    opponentLevel: number(row, "opponent_level"),
    opponentRankLevel: number(row, "opponent_rank_level"),
    opponentRank: text(row, "opponent_rank"),
    opponentRankScore: number(row, "opponent_rank_score"),
    damage: number(row, "damage"),
    armorDamage: number(row, "armor_damage"),
    hitCount: number(row, "hit_count"),
    rawDamage: number(row, "raw_damage"),
    rawArmorDamage: number(row, "raw_armor_damage"),
    rawHitCount: number(row, "raw_hit_count"),
    combatMetricsUnavailableReason: text(row, "combat_metrics_unavailable_reason") as KillDetail["combatMetricsUnavailableReason"],
    armorId: id(row, "armor_id"),
    armorName: text(row, "armor_name"),
    opponentArmor: text(row, "opponent_armor"),
    opponentValue: number(row, "opponent_value"),
    opponentGearValue: number(row, "opponent_gear_value"),
    rankScoreGained: number(row, "rank_score_gained"),
    deathType: number(row, "death_type"),
  };
}

function toIncomingDamage(row: SqliteRow): IncomingDamageDetail {
  return {
    sourceRecordStart: number(row, "source_record_start"),
    sourceRecordEnd: number(row, "source_record_end"),
    attackerNickname: text(row, "attacker_nickname"),
    attackerGidInternal: text(row, "attacker_gid_internal"),
    attackerType: (text(row, "attacker_type") ?? "unknown") as IncomingDamageDetail["attackerType"],
    deathCauserId: id(row, "death_causer_id"),
    penetration: bool(row, "penetration"),
    armorId: id(row, "armor_id"),
    armorDurability: number(row, "armor_durability"),
    armorMaxDurability: number(row, "armor_max_durability"),
    damage: number(row, "damage"),
    armorAbsorbedDamage: number(row, "armor_absorbed_damage"),
    penetrationRate: number(row, "penetration_rate"),
    targetStateRaw: number(row, "target_state_raw"),
    bodyPenetrated: bool(row, "body_penetrated"),
    finalHitDamage: number(row, "final_hit_damage"),
    consumedArmorDurability: number(row, "consumed_armor_durability"),
    lastHitReducedDamage: number(row, "last_hit_reduced_damage"),
    armReducedDamage: number(row, "arm_reduced_damage"),
    isFatalAttacker: bool(row, "is_fatal_attacker") ?? false,
    dedupFingerprint: text(row, "dedup_fingerprint") ?? "",
  };
}

function toDeathDetail(row: SqliteRow): DeathDetail {
  return {
    victimName: text(row, "victim_name"),
    killerNickname: text(row, "killer_nickname"),
    killerType: text(row, "killer_type") as DeathDetail["killerType"],
    killerLevel: number(row, "killer_level"),
    killerRank: text(row, "killer_rank"),
    weaponId: id(row, "weapon_id"),
    weaponName: text(row, "weapon_name"),
    weapon: text(row, "weapon"),
    deathCauserId: id(row, "death_causer_id"),
    ammoId: id(row, "ammo_id"),
    ammoName: text(row, "ammo_name"),
    ammoOrCause: text(row, "ammo_or_cause"),
    hitBodyPartId: id(row, "hit_body_part_id"),
    hitBodyPartName: text(row, "hit_body_part_name"),
    hitBodyPart: text(row, "hit_body_part"),
    finalDamage: number(row, "final_damage"),
    penetrated: bool(row, "penetrated"),
    armorId: id(row, "armor_id"),
    armorName: text(row, "armor_name"),
    armor: text(row, "armor"),
    armorDurability: {
      beforeHit: number(row, "armor_before_hit"),
      atHit: number(row, "armor_at_hit"),
      max: number(row, "armor_max"),
    },
    faceHit: bool(row, "face_hit"),
    dbno: bool(row, "dbno"),
    playerPosition: toVector(row, "player"),
    killerPosition: toVector(row, "killer"),
    deathServerTime: number(row, "death_server_time"),
    replayDemoStartTime: number(row, "replay_demo_start_time"),
    replayDemoEndTime: number(row, "replay_demo_end_time"),
  };
}

function toSourceFile(row: SqliteRow): ImportedSourceFile {
  return {
    id: text(row, "id") ?? "",
    fileHash: text(row, "file_hash") ?? "",
    filename: text(row, "filename") ?? "",
    fileSize: number(row, "file_size") ?? 0,
    lastModified: number(row, "last_modified"),
    importedAt: text(row, "imported_at") ?? "",
    parserVersion: text(row, "parser_version") ?? "",
    mappingScannerVersion: text(row, "mapping_scanner_version"),
  };
}

function toImportHistory(row: SqliteRow): ImportHistory {
  return {
    id: text(row, "id") ?? "",
    sourceFileId: text(row, "source_file_id") ?? "",
    filename: text(row, "filename") ?? "",
    startedAt: text(row, "started_at") ?? "",
    completedAt: text(row, "completed_at"),
    parserVersion: text(row, "parser_version") ?? "",
    discoveredRaids: number(row, "discovered_raids") ?? 0,
    insertedRaids: number(row, "inserted_raids") ?? 0,
    sameRaids: number(row, "same_raids") ?? 0,
    updatedRaids: number(row, "updated_raids") ?? 0,
    keptExistingRaids: number(row, "kept_existing_raids") ?? 0,
    failedRaids: number(row, "failed_raids") ?? 0,
    status: (text(row, "status") ?? "failed") as ImportHistory["status"],
    errorMessage: text(row, "error_message"),
  };
}

function toRaidConflict(row: SqliteRow): RaidMergeConflict {
  return {
    path: text(row, "path") ?? "",
    existingValue: parseJsonText(text(row, "existing_value")),
    incomingValue: parseJsonText(text(row, "incoming_value")),
    resolution: (text(row, "resolution") ?? "kept-existing") as RaidMergeConflict["resolution"],
  };
}

function toTeamMember(row: SqliteRow): TeamMember {
  return {
    nickname: text(row, "nickname"),
    status: (text(row, "status") ?? "unknown") as TeamMemberStatus,
  };
}

function toMappingEvidence(row: SqliteRow): MappingEvidence {
  return {
    type: (text(row, "evidence_type") ?? "id-usage") as MappingEvidence["type"],
    value: text(row, "value"),
    occurrences: number(row, "occurrences") ?? 1,
    sourceFileId: text(row, "source_file_id"),
    sample: text(row, "sample") ?? undefined,
    sourceEvent: text(row, "source_event"),
    sourceModule: text(row, "source_module"),
    rawLine: text(row, "raw_line"),
    rawContext: text(row, "raw_context"),
    observedName: text(row, "observed_name"),
    observedInternalName: text(row, "observed_internal_name"),
    observedCategory: text(row, "observed_category") as MappingEvidence["observedCategory"],
    gid: text(row, "gid"),
    actorInstance: text(row, "actor_instance"),
    timestamp: text(row, "timestamp"),
  };
}

function toMappingCandidate(row: SqliteRow): MappingCandidateName {
  return {
    name: text(row, "candidate_name") ?? "",
    source: (text(row, "candidate_source") ?? "log") as MappingCandidateName["source"],
    occurrences: number(row, "occurrences") ?? 1,
    firstSeenAt: text(row, "first_seen_at"),
    lastSeenAt: text(row, "last_seen_at"),
    sourceFileIds: parseStringArray(text(row, "source_file_ids")),
  };
}

function parseStringArray(value: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function toCompleteness(row: SqliteRow): RaidCompleteness {
  return {
    basic: bool(row, "completeness_basic") ?? false,
    combatSummary: bool(row, "completeness_combat_summary") ?? false,
    killDetails: (text(row, "completeness_kill_details") ?? "missing") as RaidCompleteness["killDetails"],
    incomingDamage: (text(row, "completeness_incoming_damage") ?? "missing") as RaidCompleteness["incomingDamage"],
    deathDetail: (text(row, "completeness_death_detail") ?? "missing") as RaidCompleteness["deathDetail"],
    loot: (text(row, "completeness_loot") ?? "missing") as RaidCompleteness["loot"],
    survival: (text(row, "completeness_survival") ?? "missing") as RaidCompleteness["survival"],
    team: (text(row, "completeness_team") ?? "unknown") as RaidCompleteness["team"],
    rank: (text(row, "completeness_rank") ?? "missing") as RaidCompleteness["rank"],
    score: number(row, "completeness_score") ?? 0,
  };
}

function toVector(row: SqliteRow, prefix: "player" | "killer"): Vector3 | null {
  const x = number(row, `${prefix}_x`);
  const y = number(row, `${prefix}_y`);
  const z = number(row, `${prefix}_z`);

  if (x === null && y === null && z === null) {
    return null;
  }

  return { x, y, z };
}

function groupRows(rows: SqliteRow[], key: string): Map<string, SqliteRow[]> {
  const grouped = new Map<string, SqliteRow[]>();

  rows.forEach((row) => {
    const groupKey = text(row, key);

    if (!groupKey) {
      return;
    }

    grouped.set(groupKey, [...(grouped.get(groupKey) ?? []), row]);
  });

  return grouped;
}

function text(row: SqliteRow, key: string): string | null {
  const value = row[key];

  if (value === null || value === undefined || value === "") {
    return null;
  }

  return String(value);
}

function id(row: SqliteRow, key: string): string | null {
  return text(row, key);
}

function number(row: SqliteRow, key: string): number | null {
  const value = row[key];

  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function bool(row: SqliteRow, key: string): boolean | null {
  const value = row[key];

  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return Number(value) !== 0;
}

function toRaidResult(value: string | null): RaidResult {
  return value === "extracted" ? "extracted" : "dead";
}

function toSquad(value: string | null): SquadType {
  return value === "team" ? "team" : "solo";
}

function toTeamType(value: string | null): RaidTeamType {
  if (value === "solo" || value === "team") {
    return value;
  }

  return "unknown";
}

function parseJsonText(value: string | null): unknown {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function parseSettingValue(row: SqliteRow): unknown {
  return parseJsonText(text(row, "value"));
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
