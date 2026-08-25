export type MappingCategory =
  | "weapon"
  | "ammo"
  | "armor"
  | "helmet"
  | "rig"
  | "backpack"
  | "headset"
  | "attachment"
  | "throwable"
  | "medical"
  | "provision"
  | "key"
  | "currency"
  | "loot"
  | "map"
  | "bodyPart"
  | "equipment"
  | "other";

export type MappingStatus = "confirmed" | "unconfirmed" | "conflict";
export type MappingSource = "builtin" | "log" | "user" | "imported";
export type MappingConfidence = "high" | "medium" | "low" | null;
export type MappingEvidenceType = "direct-name" | "battle-result" | "blueprint" | "user" | "imported" | "id-usage";

export interface MappingCandidateName {
  name: string;
  occurrences: number;
  source: MappingSource;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
}

export interface MappingEvidence {
  type: MappingEvidenceType;
  value: string | null;
  occurrences: number;
  sourceFileId: string | null;
  sample?: string;
}

export interface MappingRecord {
  id: string;
  category: MappingCategory;
  suggestedCategory: MappingCategory | null;
  name: string | null;
  builtinName: string | null;
  userName: string | null;
  status: MappingStatus;
  source: MappingSource;
  aliases: string[];
  rawBlueprint: string | null;
  confidence: MappingConfidence;
  occurrenceCount: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  sourceFileIds: string[];
  createdAt: string;
  updatedAt: string;
  userEdited: boolean;
  notes: string | null;
  candidateNames: MappingCandidateName[];
  evidence: MappingEvidence[];
}

export interface MappingDiscoveryEntry {
  id: string;
  category: MappingCategory;
  suggestedCategory?: MappingCategory | null;
  candidateName?: string | null;
  rawBlueprint?: string | null;
  confidence?: MappingConfidence;
  evidenceType: MappingEvidenceType;
  autoConfirm?: boolean;
}

export interface MappingDiscoverySummary {
  newIds: number;
  rediscoveredIds: number;
  autoConfirmed: number;
  unconfirmed: number;
  conflicts: number;
  processedOccurrences: number;
}

export interface MappingBackupPayload {
  format: "abi-mappings";
  version: 1;
  exportedAt: string;
  mappings: MappingRecord[];
}

export interface MappingImportSummary {
  imported: number;
  inserted: number;
  updated: number;
  conflicts: number;
  kept: number;
}

export interface MappingSummary {
  total: number;
  confirmed: number;
  unconfirmed: number;
  conflict: number;
  byCategory: Record<MappingCategory, number>;
  bySource: Record<MappingSource, number>;
}

export interface MappingUsageStats {
  kills: number;
  deaths: number;
  incoming: number;
  maps: number;
}
