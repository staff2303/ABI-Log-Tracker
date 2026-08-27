export type MappingNamespace =
  | "item"
  | "map"
  | "skin"
  | "gameplay_tag"
  | "actor_instance"
  | "net_guid"
  | "gid"
  | "unknown";

export type MappingCategory =
  | "weapon"
  | "ammo"
  | "magazine"
  | "armor"
  | "helmet"
  | "rig"
  | "backpack"
  | "headset"
  | "attachment"
  | "throwable"
  | "medical"
  | "provision"
  | "food"
  | "drink"
  | "key"
  | "currency"
  | "loot"
  | "map"
  | "bodyPart"
  | "equipment"
  | "other";

export type MappingStatus = "unresolved" | "typed" | "inferred" | "confirmed" | "unconfirmed" | "conflict";
export type MappingSource = "builtin" | "log" | "user" | "imported";
export type MappingCandidateSource = MappingSource | "blueprint";
export type MappingConfidence = "confirmed" | "high" | "medium" | "low" | null;
export type MappingEvidenceType =
  | "confirmed_multi"
  | "direct_name_id"
  | "item_info"
  | "bp_class_id"
  | "map_info"
  | "typed_field"
  | "gid_correlation"
  | "contextual"
  | "id_pattern"
  | "manual"
  | "direct-name"
  | "direct-id-name"
  | "same-event"
  | "same-instance"
  | "battle-result"
  | "blueprint"
  | "proximity"
  | "user"
  | "imported"
  | "id-usage";

export interface MappingCandidateName {
  name: string;
  occurrences: number;
  source: MappingCandidateSource;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  sourceFileIds: string[];
}

export interface MappingEvidence {
  type: MappingEvidenceType;
  value: string | null;
  occurrences: number;
  sourceFileId: string | null;
  sample?: string;
  sourceEvent?: string | null;
  sourceModule?: string | null;
  rawLine?: string | null;
  rawContext?: string | null;
  observedName?: string | null;
  observedInternalName?: string | null;
  observedCategory?: MappingCategory | null;
  gid?: string | null;
  actorInstance?: string | null;
  timestamp?: string | null;
}

export interface MappingDiscoveryCandidate {
  name: string;
  occurrences: number;
  source: MappingCandidateSource;
  evidenceType: MappingEvidenceType;
  confidence: MappingConfidence;
  sample?: string;
}

export interface MappingRecord {
  id: string;
  namespace: MappingNamespace;
  rawId: string;
  category: MappingCategory;
  subcategory: string | null;
  suggestedCategory: MappingCategory | null;
  name: string | null;
  displayName: string | null;
  builtinName: string | null;
  userName: string | null;
  internalName: string | null;
  canonicalInternalName: string | null;
  status: MappingStatus;
  source: MappingSource;
  aliases: string[];
  rawBlueprint: string | null;
  confidence: MappingConfidence;
  confirmationType: string | null;
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
  namespace?: MappingNamespace;
  rawId?: string | null;
  category: MappingCategory;
  subcategory?: string | null;
  suggestedCategory?: MappingCategory | null;
  candidateName?: string | null;
  internalName?: string | null;
  canonicalInternalName?: string | null;
  rawBlueprint?: string | null;
  confidence?: MappingConfidence;
  evidenceType: MappingEvidenceType;
  autoConfirm?: boolean;
  occurrences?: number;
  sample?: string;
  candidateSource?: MappingCandidateSource;
  candidates?: MappingDiscoveryCandidate[];
}

export interface MappingDiscoverySummary {
  scannerVersion: string | null;
  discoveredIds: number;
  newIds: number;
  rediscoveredIds: number;
  nameCandidates: number;
  blueprintCandidates: number;
  evidenceRecords: number;
  autoConfirmed: number;
  typed: number;
  inferred: number;
  unresolved: number;
  unconfirmed: number;
  conflicts: number;
  patternInferred: number;
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
  typed: number;
  inferred: number;
  unresolved: number;
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
