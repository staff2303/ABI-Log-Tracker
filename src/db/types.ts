import type { GameId, Raid } from "../types/raid";
import type { MappingDiscoverySummary, MappingRecord } from "./mappingTypes";

export type MatchIdentityType = "room-id" | "fallback";
export type ImportHistoryStatus = "processing" | "completed" | "failed";
export type RaidMergeAction = "INSERT" | "SAME" | "UPDATE" | "KEEP";
export type SectionCompleteness = "missing" | "partial" | "complete";
export type OptionalSectionCompleteness = "not-applicable" | SectionCompleteness;
export type TeamCompleteness = "unknown" | "resolved";

export interface RaidCompleteness {
  basic: boolean;
  combatSummary: boolean;
  killDetails: SectionCompleteness;
  incomingDamage: SectionCompleteness;
  deathDetail: OptionalSectionCompleteness;
  loot: SectionCompleteness;
  survival: SectionCompleteness;
  team: TeamCompleteness;
  rank: OptionalSectionCompleteness;
  score: number;
}

export interface RaidMergeConflict {
  path: string;
  existingValue: unknown;
  incomingValue: unknown;
  resolution: "kept-existing" | "used-incoming" | "kept-preferred";
}

export interface StoredRaid extends Raid {
  matchKey: string;
  matchIdentity: string;
  matchIdentityType: MatchIdentityType;
  parserVersion: string;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  sourceFileIds: string[];
  completeness: RaidCompleteness;
  mergeMeta?: {
    updatedFromDuplicate?: boolean;
    conflicts?: RaidMergeConflict[];
  };
  startedAt: string;
  mapId: GameId | null;
  mode: string | null;
  zone: string | null;
  result: string;
  teamType: string;
}

export interface ImportedSourceFile {
  id: string;
  fileHash: string;
  filename: string;
  fileSize: number;
  lastModified: number | null;
  importedAt: string;
  parserVersion: string;
  mappingScannerVersion: string | null;
}

export interface ImportHistory {
  id: string;
  sourceFileId: string;
  filename: string;
  startedAt: string;
  completedAt: string | null;
  parserVersion: string;
  discoveredRaids: number;
  insertedRaids: number;
  sameRaids: number;
  updatedRaids: number;
  keptExistingRaids: number;
  failedRaids: number;
  status: ImportHistoryStatus;
  errorMessage?: string | null;
}

export interface ImportCommitSummary {
  sourceFile: ImportedSourceFile;
  history: ImportHistory;
  totalStoredRaids: number;
  conflicts: RaidMergeConflict[];
  mappingDiscovery: MappingDiscoverySummary;
}

export interface BackupPayload {
  format: "abi-tracker-backup";
  backupVersion: number;
  schemaVersion: number;
  exportedAt: string;
  raids: StoredRaid[];
  imports: ImportedSourceFile[];
  importHistory: ImportHistory[];
  mappings: MappingRecord[];
  settings: Record<string, unknown>;
}

export interface BackupImportSummary {
  discoveredRaids: number;
  insertedRaids: number;
  sameRaids: number;
  updatedRaids: number;
  keptExistingRaids: number;
  failedRaids: number;
  totalStoredRaids: number;
  importedFiles: number;
  importedMappings: number;
}

export interface StorageInfo {
  persisted: boolean | null;
  usage: number | null;
  quota: number | null;
  dbPath?: string | null;
  dbFolder?: string | null;
  journalMode?: string | null;
}
