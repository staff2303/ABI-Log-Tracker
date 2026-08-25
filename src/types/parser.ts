import type { Raid, RaidTeamType, SurvivalDetail } from "./raid";

export type ParserSectionStatus = "complete" | "partial" | "n/a";
export type FieldPresence = "found" | "missing";
export type SurvivalFieldPresence = Record<keyof SurvivalDetail, FieldPresence>;
export type RaidRankDebugStatus = "parsed" | "n/a" | "unknown";

export type ParserWarningCode =
  | "missing_summary"
  | "kill_count_mismatch"
  | "accuracy_mismatch"
  | "partial_raid_finalized"
  | "parse_error"
  | "killer_name_mismatch"
  | "weapon_id_mismatch"
  | "event_out_of_range"
  | "multiple_death_events"
  | "death_resolution_failed"
  | "death_resolution_tie"
  | "victim_unidentified"
  | "negative_damage"
  | "hits_exceed_shots"
  | "time_range_invalid";

export interface ParserWarning {
  code: ParserWarningCode;
  message: string;
  raidId: string | null;
  sourceRecordIndex: number;
}

export interface RaidSourceRange {
  raidId: string;
  startRecordIndex: number;
  endRecordIndex: number;
}

export interface RaidDebugSummary {
  raidId: string;
  basic: ParserSectionStatus;
  combat: ParserSectionStatus;
  summaryPmcKills: number | null;
  parsedPmcKills: number;
  summaryAiKills: number | null;
  parsedAiKills: number;
  rawKillEvents: number;
  duplicateKillEventsRemoved: number;
  kills: number;
  incomingDamage: number;
  rawIncomingDamageEvents: number;
  duplicateIncomingDamageEventsRemoved: number;
  fatalIncomingDamageEvents: number;
  unavailableKillMetricEvents: number;
  deathCandidateCount: number;
  selectedDeathRecordIndex: number | null;
  deathResolutionMatchedBy: string[];
  finalizedAtEOF: boolean;
  death: ParserSectionStatus;
  team: ParserSectionStatus;
  teamType: RaidTeamType;
  teamMemberCount: number | null;
  teamResolution: string | null;
  loot: ParserSectionStatus;
  survival: ParserSectionStatus;
  survivalFields: SurvivalFieldPresence;
  rank: ParserSectionStatus;
  rankStatus: RaidRankDebugStatus;
  rankSourceRecordIndex: number | null;
  rankResolvedFrom: string | null;
  rankScoreChange: number | null;
  killRankedScoreSum: number;
  warningCount: number;
  startRecordIndex: number;
  endRecordIndex: number;
}

export interface RaidDebugMetrics {
  rawKillEvents: number;
  duplicateKillEventsRemoved: number;
  rawIncomingDamageEvents: number;
  duplicateIncomingDamageEventsRemoved: number;
  fatalIncomingDamageEvents: number;
  unavailableKillMetricEvents: number;
  deathCandidateCount: number;
  selectedDeathRecordIndex: number | null;
  deathResolutionMatchedBy: string[];
  finalizedAtEOF: boolean;
  finalizedAsPartial: boolean;
  survivalFields: SurvivalFieldPresence;
  teamType: RaidTeamType;
  teamMemberCount: number | null;
  teamResolution: string | null;
  rankStatus: RaidRankDebugStatus;
  rankSourceRecordIndex: number | null;
  rankResolvedFrom: string | null;
  rankScoreChange: number | null;
  killRankedScoreSum: number;
}

export interface ParserDebugInfo {
  detectedRaidCount: number;
  completedRaidCount: number;
  partialRaidCount: number;
  warnings: ParserWarning[];
  unknownRecordCount: number;
  sourceRanges: RaidSourceRange[];
  raidSummaries: RaidDebugSummary[];
}

export interface RaidParseResult {
  raids: Raid[];
  debug: ParserDebugInfo;
}
