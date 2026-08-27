import { collectMappingDiscoveriesFromRaids } from "./mappingDiscovery";
import { isIgnoredMappingBlueprint } from "./mappingCandidateFilters";
import { createMappingIdentity, createMappingKey, identityFromMappingInput, namespaceForCategory } from "./mappingIdentity";
import { applyPatternInference } from "./mappingPatternLearner";
import { loadTrackerState } from "./sqliteState";
import { invokeCommand } from "./tauriClient";
import { CURRENT_MAPPING_SCANNER_VERSION } from "./constants";
import type { Raid } from "../types/raid";
import type {
  MappingBackupPayload,
  MappingCandidateName,
  MappingCandidateSource,
  MappingCategory,
  MappingConfidence,
  MappingDiscoveryCandidate,
  MappingDiscoveryEntry,
  MappingDiscoverySummary,
  MappingEvidence,
  MappingEvidenceType,
  MappingImportSummary,
  MappingNamespace,
  MappingRecord,
  MappingSource,
  MappingStatus,
  MappingSummary,
} from "./mappingTypes";

export interface SaveMappingInput {
  id?: string;
  namespace: MappingNamespace;
  rawId: string;
  category: MappingCategory;
  name: string;
  status: MappingStatus;
  aliases: string[];
  notes: string | null;
}

export async function getAllMappings(): Promise<MappingRecord[]> {
  const state = await loadTrackerState();
  return state.mappings.sort(
    (left, right) =>
      left.namespace.localeCompare(right.namespace) ||
      left.rawId.localeCompare(right.rawId, undefined, { numeric: true }) ||
      left.category.localeCompare(right.category),
  );
}

export async function ensureBuiltInMappingsSeeded(): Promise<{ inserted: number; updated: number; totalBuiltIn: number }> {
  return invokeCommand("sync_builtin_mappings");
}

export async function recordMappingDiscoveriesFromRaids(
  raids: readonly Raid[],
  sourceFileId: string | null,
): Promise<MappingDiscoverySummary> {
  return recordMappingDiscoveries(collectMappingDiscoveriesFromRaids(raids), sourceFileId, null);
}

export async function discoverMappingsForExistingRaidsOnce(raids: readonly Raid[]): Promise<MappingDiscoverySummary | null> {
  void raids;
  return null;
}

export async function rediscoverMappingsForExistingRaids(raids: readonly Raid[]): Promise<MappingDiscoverySummary> {
  return recordMappingDiscoveriesFromRaids(raids, "existing-local-raids");
}

export async function recordMappingDiscoveries(
  entries: readonly MappingDiscoveryEntry[],
  sourceFileId: string | null,
  scannerVersion: string | null = CURRENT_MAPPING_SCANNER_VERSION,
): Promise<MappingDiscoverySummary> {
  const now = new Date().toISOString();
  const grouped = groupDiscoveryEntries(entries);
  const mappings = await getAllMappings();
  const byId = new Map(mappings.map((mapping) => [mapping.id, mapping]));
  const summary = createEmptyDiscoverySummary(scannerVersion);
  summary.discoveredIds = grouped.length;

  for (const entry of grouped) {
    const existing = byId.get(entry.id) ?? null;

    if (!existing) {
      const created = createDiscoveredMappingRecord(entry, sourceFileId, now);
      summary.newIds += 1;
      incrementStatusSummary(summary, created.status);
      byId.set(created.id, created);
      continue;
    }

    const next = mergeDiscoveryIntoMapping(existing, entry, sourceFileId, now);

    summary.rediscoveredIds += 1;
    incrementStatusSummary(summary, next.status);

    if (existing.status !== "conflict" && next.status === "conflict") {
      summary.conflicts += 1;
    }

    byId.set(next.id, next);
  }

  const patternResult = applyPatternInference(Array.from(byId.values()), now);
  await persistMappings(patternResult.mappings);
  summary.patternInferred = patternResult.inferredCount;
  summary.processedOccurrences = grouped.reduce((total, entry) => total + entry.occurrenceCount, 0);
  summary.nameCandidates = grouped.reduce(
    (total, entry) => total + entry.candidates.filter((candidate) => candidate.source !== "blueprint").length,
    0,
  );
  summary.blueprintCandidates = grouped.reduce(
    (total, entry) => total + entry.candidates.filter((candidate) => candidate.source === "blueprint").length,
    0,
  );
  summary.evidenceRecords = grouped.reduce((total, entry) => total + entry.evidence.length, 0);
  return summary;
}

export async function saveMapping(input: SaveMappingInput): Promise<MappingRecord> {
  const now = new Date().toISOString();
  const identity = createMappingIdentity(input.namespace, input.rawId, input.namespace === "gameplay_tag");

  if (!identity) {
    throw new Error("Mapping ID is required.");
  }

  if (!input.name.trim()) {
    throw new Error("Mapping name is required.");
  }

  const mappings = await getAllMappings();
  const existing = mappings.find((mapping) => mapping.id === identity.id) ?? null;
  const base = existing ?? createUserMappingRecord(identity.namespace, identity.rawId, input.category, now);
  const saved: MappingRecord = {
    ...base,
    namespace: identity.namespace,
    rawId: identity.rawId,
    category: input.category,
    name: input.name.trim(),
    displayName: input.name.trim(),
    userName: input.name.trim(),
    status: input.status,
    source: base.source === "builtin" ? "builtin" : "user",
    aliases: normalizeAliases(input.aliases),
    notes: input.notes?.trim() || null,
    updatedAt: now,
    userEdited: true,
    confidence: input.status === "confirmed" ? "confirmed" : base.confidence,
    confirmationType: input.status === "confirmed" ? "manual" : base.confirmationType,
    evidence: mergeEvidence(base.evidence, {
      type: "manual",
      value: input.name.trim(),
      occurrences: 1,
      sourceFileId: null,
      observedName: input.name.trim(),
    }),
  };

  await persistMappings(upsertMappingRecord(mappings, saved));
  return saved;
}

export async function resetOrDeleteMapping(id: string): Promise<"deleted" | "reset"> {
  const mappings = await getAllMappings();
  const existing = mappings.find((mapping) => mapping.id === id) ?? null;
  const now = new Date().toISOString();

  if (!existing) {
    return "deleted";
  }

  if (existing.builtinName) {
    await persistMappings(
      upsertMappingRecord(mappings, {
        ...existing,
        name: existing.builtinName,
        userName: null,
        status: "confirmed",
        source: "builtin",
        aliases: [],
        notes: null,
        confidence: "high",
        updatedAt: now,
        userEdited: false,
      }),
    );
    return "reset";
  }

  if (existing.occurrenceCount > 0 || existing.sourceFileIds.length > 0) {
    await persistMappings(
      upsertMappingRecord(mappings, {
        ...existing,
        name: null,
        userName: null,
        status: "unconfirmed",
        source: existing.source === "user" ? "log" : existing.source,
        aliases: [],
        notes: null,
        confidence: existing.confidence ?? "low",
        updatedAt: now,
        userEdited: false,
      }),
    );
    return "reset";
  }

  await persistMappings(mappings.filter((mapping) => mapping.id !== id));
  return "deleted";
}

export async function bulkUpdateMappingCategory(ids: readonly string[], category: MappingCategory): Promise<number> {
  const now = new Date().toISOString();
  const idSet = new Set(ids);
  let updated = 0;
  const mappings = (await getAllMappings()).map((mapping) => {
    if (!idSet.has(mapping.id)) {
      return mapping;
    }

    updated += 1;
    return {
      ...mapping,
      category,
      updatedAt: now,
      userEdited: true,
      evidence: mergeEvidence(mapping.evidence, {
        type: "user",
        value: `category:${category}`,
        occurrences: 1,
        sourceFileId: null,
      }),
    };
  });

  await persistMappings(mappings);
  return updated;
}

export function createMappingBackupPayload(mappings: MappingRecord[]): MappingBackupPayload {
  return {
    format: "abi-mappings",
    version: 1,
    exportedAt: new Date().toISOString(),
    mappings,
  };
}

export async function exportMappingFile(): Promise<void> {
  const payload = createMappingBackupPayload(await getAllMappings());
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = `ABI_Mappings_${payload.exportedAt.slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importMappingFile(file: File): Promise<MappingImportSummary> {
  const text = await file.text();
  return mergeImportedMappings(validateMappingBackupPayload(JSON.parse(text) as unknown).mappings);
}

export function validateMappingBackupPayload(value: unknown): MappingBackupPayload {
  if (!isObject(value) || value.format !== "abi-mappings" || value.version !== 1 || !Array.isArray(value.mappings)) {
    throw new Error("Mapping backup format is invalid.");
  }

  return value as unknown as MappingBackupPayload;
}

export async function mergeImportedMappings(mappings: readonly MappingRecord[]): Promise<MappingImportSummary> {
  const now = new Date().toISOString();
  const existingMappings = await getAllMappings();
  const byId = new Map(existingMappings.map((mapping) => [mapping.id, mapping]));
  const summary: MappingImportSummary = {
    imported: mappings.length,
    inserted: 0,
    updated: 0,
    conflicts: 0,
    kept: 0,
  };

  for (const incoming of mappings) {
    const existing = byId.get(incoming.id) ?? null;
    const normalizedIncoming = normalizeImportedMapping(incoming, now);

    if (!existing) {
      summary.inserted += 1;
      byId.set(normalizedIncoming.id, normalizedIncoming);
      continue;
    }

    const existingDisplayName = getEffectiveMappingName(existing);
    const incomingDisplayName = getEffectiveMappingName(normalizedIncoming);

    if (existing.userEdited && incomingDisplayName && existingDisplayName && existingDisplayName !== incomingDisplayName) {
      summary.conflicts += 1;
      byId.set(existing.id, {
        ...existing,
        status: "conflict",
        candidateNames: mergeCandidateName(existing.candidateNames, incomingDisplayName, "imported", now),
        updatedAt: now,
      });
      continue;
    }

    summary.updated += 1;
    byId.set(existing.id, mergeImportedMapping(existing, normalizedIncoming, now));
  }

  await persistMappings(Array.from(byId.values()));
  return summary;
}

export function summarizeMappings(mappings: readonly MappingRecord[]): MappingSummary {
  const byCategory = createCategoryCounter();
  const bySource: Record<MappingSource, number> = {
    builtin: 0,
    log: 0,
    user: 0,
    imported: 0,
  };

  mappings.forEach((mapping) => {
    byCategory[mapping.category] += 1;
    bySource[mapping.source] += 1;
  });

  return {
    total: mappings.length,
    confirmed: mappings.filter((mapping) => mapping.status === "confirmed").length,
    typed: mappings.filter((mapping) => mapping.status === "typed").length,
    inferred: mappings.filter((mapping) => mapping.status === "inferred").length,
    unresolved: mappings.filter((mapping) => mapping.status === "unresolved").length,
    unconfirmed: mappings.filter((mapping) => mapping.status === "unconfirmed").length,
    conflict: mappings.filter((mapping) => mapping.status === "conflict").length,
    byCategory,
    bySource,
  };
}

async function persistMappings(mappings: MappingRecord[]): Promise<void> {
  await invokeCommand("replace_mappings", { mappings });
}

function createEmptyDiscoverySummary(scannerVersion: string | null): MappingDiscoverySummary {
  return {
    scannerVersion,
    discoveredIds: 0,
    newIds: 0,
    rediscoveredIds: 0,
    nameCandidates: 0,
    blueprintCandidates: 0,
    evidenceRecords: 0,
    autoConfirmed: 0,
    typed: 0,
    inferred: 0,
    unresolved: 0,
    unconfirmed: 0,
    conflicts: 0,
    patternInferred: 0,
    processedOccurrences: 0,
  };
}

function upsertMappingRecord(mappings: readonly MappingRecord[], next: MappingRecord): MappingRecord[] {
  const found = mappings.some((mapping) => mapping.id === next.id);

  if (!found) {
    return [...mappings, next];
  }

  return mappings.map((mapping) => (mapping.id === next.id ? next : mapping));
}

interface GroupedDiscoveryEntry {
  id: string;
  namespace: MappingNamespace;
  rawId: string;
  category: MappingCategory;
  subcategory: string | null;
  suggestedCategory: MappingCategory | null;
  confidence: MappingConfidence;
  autoConfirm: boolean;
  occurrenceCount: number;
  rawBlueprint: string | null;
  internalName: string | null;
  canonicalInternalName: string | null;
  candidates: MappingDiscoveryCandidate[];
  evidence: MappingEvidence[];
}

function groupDiscoveryEntries(entries: readonly MappingDiscoveryEntry[]): GroupedDiscoveryEntry[] {
  const byId = new Map<string, GroupedDiscoveryEntry>();

  entries.forEach((entry) => {
    const identity =
      identityFromMappingInput({
        id: entry.id,
        namespace: entry.namespace,
        rawId: entry.rawId,
        category: entry.category,
      }) ?? null;

    if (!identity) {
      return;
    }

    const occurrenceCount = positiveInteger(entry.occurrences);
    const current =
      byId.get(identity.id) ??
      ({
        id: identity.id,
        namespace: identity.namespace,
        rawId: identity.rawId,
        category: entry.category,
        subcategory: entry.subcategory ?? null,
        suggestedCategory: entry.suggestedCategory ?? entry.category,
        confidence: entry.confidence ?? "low",
        autoConfirm: entry.autoConfirm === true,
        occurrenceCount: 0,
        rawBlueprint: null,
        internalName: null,
        canonicalInternalName: null,
        candidates: [],
        evidence: [],
      } satisfies GroupedDiscoveryEntry);

    current.occurrenceCount += occurrenceCount;
    current.suggestedCategory ??= entry.suggestedCategory ?? entry.category;
    current.subcategory ??= entry.subcategory ?? null;
    current.confidence = strongestConfidence(current.confidence, entry.confidence ?? "low");
    current.autoConfirm = current.autoConfirm || entry.autoConfirm === true;
    current.internalName ??= entry.internalName ?? null;
    current.canonicalInternalName ??= entry.canonicalInternalName ?? null;
    const evidenceToMerge: MappingEvidence[] = [
      {
        type: normalizeEvidenceType(entry.evidenceType),
        value: entry.candidateName ?? entry.rawBlueprint ?? null,
        occurrences: occurrenceCount,
        sourceFileId: null,
        sample: entry.sample,
        rawContext: entry.sample,
        observedName: entry.candidateName ?? null,
        observedInternalName: entry.internalName ?? entry.rawBlueprint ?? null,
        observedCategory: entry.category,
      },
    ];

    const directCandidate = normalizeCandidateInput({
      name: entry.candidateName ?? "",
      occurrences: occurrenceCount,
      source: entry.candidateSource ?? "log",
      evidenceType: normalizeEvidenceType(entry.evidenceType),
      confidence: entry.confidence ?? "low",
      sample: entry.sample,
    });

    if (directCandidate) {
      current.candidates = mergeDiscoveryCandidate(current.candidates, directCandidate);
      evidenceToMerge.push({
        type: directCandidate.evidenceType,
        value: directCandidate.name,
        occurrences: directCandidate.occurrences,
        sourceFileId: null,
        sample: directCandidate.sample,
      });
    }

    const blueprintCandidate = normalizeCandidateInput({
      name: entry.rawBlueprint ?? "",
      occurrences: occurrenceCount,
      source: "blueprint",
      evidenceType: "bp_class_id",
      confidence: entry.confidence ?? "medium",
      sample: entry.sample,
    });

    if (blueprintCandidate) {
      current.rawBlueprint ??= blueprintCandidate.name;
      current.candidates = mergeDiscoveryCandidate(current.candidates, blueprintCandidate);
      evidenceToMerge.push({
        type: normalizeEvidenceType(blueprintCandidate.evidenceType),
        value: blueprintCandidate.name,
        occurrences: blueprintCandidate.occurrences,
        sourceFileId: null,
        sample: blueprintCandidate.sample,
      });
    }

    (entry.candidates ?? []).forEach((candidate) => {
      const normalizedCandidate = normalizeCandidateInput(candidate);

      if (!normalizedCandidate) {
        return;
      }

      if (normalizedCandidate.source === "blueprint") {
        current.rawBlueprint ??= normalizedCandidate.name;
      }

      current.candidates = mergeDiscoveryCandidate(current.candidates, normalizedCandidate);
      evidenceToMerge.push({
        type: normalizeEvidenceType(normalizedCandidate.evidenceType),
        value: normalizedCandidate.name,
        occurrences: normalizedCandidate.occurrences,
        sourceFileId: null,
        sample: normalizedCandidate.sample,
      });
    });

    current.evidence = mergeEvidenceList(current.evidence, evidenceToMerge);

    byId.set(identity.id, current);
  });

  return Array.from(byId.values());
}

function createDiscoveredMappingRecord(
  entry: GroupedDiscoveryEntry,
  sourceFileId: string | null,
  now: string,
): MappingRecord {
  const bestNameCandidate = selectBestCandidate(entry.candidates, "name");
  const confirmed = entry.autoConfirm === true && Boolean(bestNameCandidate);
  const name = confirmed ? bestNameCandidate?.name ?? null : null;
  const internalName = entry.internalName ?? selectBestCandidate(entry.candidates, "blueprint")?.name ?? entry.rawBlueprint ?? null;

  return {
    id: entry.id,
    namespace: entry.namespace,
    rawId: entry.rawId,
    category: entry.category,
    subcategory: entry.subcategory,
    suggestedCategory: entry.suggestedCategory ?? entry.category,
    name,
    displayName: name,
    builtinName: null,
    userName: null,
    internalName,
    canonicalInternalName: entry.canonicalInternalName ?? normalizeInternalName(internalName),
    status: confirmed ? "confirmed" : entry.confidence === "low" ? "typed" : "unresolved",
    source: "log",
    aliases: [],
    rawBlueprint: entry.rawBlueprint ?? null,
    confidence: confirmed ? "confirmed" : entry.confidence ?? "low",
    confirmationType: confirmed ? confirmationTypeForEvidence(bestNameCandidate?.evidenceType ?? null) : null,
    occurrenceCount: entry.occurrenceCount,
    firstSeenAt: now,
    lastSeenAt: now,
    sourceFileIds: sourceFileId ? [sourceFileId] : [],
    createdAt: now,
    updatedAt: now,
    userEdited: false,
    notes: null,
    candidateNames: confirmed ? [] : mergeDiscoveryCandidatesIntoMapping([], entry.candidates, now, sourceFileId),
    evidence: entry.evidence.map((evidence) => ({ ...evidence, sourceFileId })),
  };
}

function mergeDiscoveryIntoMapping(
  existing: MappingRecord,
  entry: GroupedDiscoveryEntry,
  sourceFileId: string | null,
  now: string,
): MappingRecord {
  const sourceAlreadySeen = Boolean(sourceFileId && existing.sourceFileIds.includes(sourceFileId));
  const occurrenceCount = sourceAlreadySeen ? 0 : entry.occurrenceCount;
  const next: MappingRecord = {
    ...existing,
    namespace: existing.namespace ?? entry.namespace,
    rawId: existing.rawId ?? entry.rawId,
    subcategory: existing.subcategory ?? entry.subcategory,
    suggestedCategory: existing.suggestedCategory ?? entry.suggestedCategory ?? entry.category,
    occurrenceCount: existing.occurrenceCount + occurrenceCount,
    firstSeenAt: existing.firstSeenAt ?? now,
    lastSeenAt: now,
    sourceFileIds: mergeUnique(existing.sourceFileIds, sourceFileId ? [sourceFileId] : []),
    rawBlueprint: existing.rawBlueprint ?? entry.rawBlueprint ?? null,
    internalName: existing.internalName ?? entry.internalName ?? entry.rawBlueprint ?? null,
    canonicalInternalName: existing.canonicalInternalName ?? entry.canonicalInternalName ?? normalizeInternalName(entry.internalName ?? entry.rawBlueprint),
    updatedAt: now,
    evidence: mergeEvidenceList(
      existing.evidence,
      entry.evidence.map((evidence) => ({
        ...evidence,
        occurrences: sourceAlreadySeen ? 0 : evidence.occurrences,
        sourceFileId,
      })),
    ),
  };

  next.candidateNames = mergeDiscoveryCandidatesIntoMapping(existing.candidateNames, entry.candidates, now, sourceFileId);

  const bestNameCandidate = selectBestCandidate(entry.candidates, "name");
  const displayName = getEffectiveMappingName(existing);

  if (
    entry.autoConfirm &&
    bestNameCandidate &&
    existing.status === "confirmed" &&
    displayName &&
    displayName !== bestNameCandidate.name &&
    !existing.userEdited
  ) {
    next.status = "conflict";
    next.candidateNames = mergeCandidateName(
      next.candidateNames,
      bestNameCandidate.name,
      bestNameCandidate.source,
      now,
      bestNameCandidate.occurrences,
      sourceFileId,
    );
    next.evidence = mergeEvidence(next.evidence, {
      type: "direct_name_id",
      value: bestNameCandidate.name,
      occurrences: bestNameCandidate.occurrences,
      sourceFileId,
      sample: bestNameCandidate.sample,
      observedName: bestNameCandidate.name,
      observedCategory: entry.category,
    });
    return next;
  }

  if (entry.autoConfirm && bestNameCandidate && !existing.userEdited && existing.status !== "confirmed" && existing.status !== "conflict") {
    next.name = bestNameCandidate.name;
    next.displayName = bestNameCandidate.name;
    next.status = "confirmed";
    next.confidence = "confirmed";
    next.confirmationType = confirmationTypeForEvidence(bestNameCandidate.evidenceType);
  }

  return next;
}

function createUserMappingRecord(namespace: MappingNamespace, rawId: string, category: MappingCategory, now: string): MappingRecord {
  const id = createMappingKey(namespace, rawId, namespace === "gameplay_tag") ?? `${namespace}:${rawId}`;

  return {
    id,
    namespace,
    rawId,
    category,
    subcategory: null,
    suggestedCategory: category,
    name: null,
    displayName: null,
    builtinName: null,
    userName: null,
    internalName: null,
    canonicalInternalName: null,
    status: "confirmed",
    source: "user",
    aliases: [],
    rawBlueprint: null,
    confidence: "confirmed",
    confirmationType: "manual",
    occurrenceCount: 0,
    firstSeenAt: null,
    lastSeenAt: null,
    sourceFileIds: [],
    createdAt: now,
    updatedAt: now,
    userEdited: true,
    notes: null,
    candidateNames: [],
    evidence: [],
  };
}

function normalizeImportedMapping(mapping: MappingRecord, now: string): MappingRecord {
  const identity =
    identityFromMappingInput({
      id: mapping.id,
      namespace: mapping.namespace,
      rawId: mapping.rawId,
      category: mapping.category,
    }) ?? createMappingIdentity(namespaceForCategory(mapping.category), mapping.id, mapping.category === "bodyPart");
  const id = identity?.id ?? String(mapping.id);

  return {
    ...mapping,
    id,
    namespace: identity?.namespace ?? mapping.namespace ?? namespaceForCategory(mapping.category),
    rawId: identity?.rawId ?? mapping.rawId ?? String(mapping.id),
    subcategory: mapping.subcategory ?? null,
    displayName: mapping.displayName ?? mapping.name ?? mapping.userName ?? mapping.builtinName ?? null,
    internalName: mapping.internalName ?? mapping.rawBlueprint ?? null,
    canonicalInternalName: mapping.canonicalInternalName ?? normalizeInternalName(mapping.internalName ?? mapping.rawBlueprint),
    confirmationType: mapping.confirmationType ?? null,
    source: mapping.source === "builtin" ? "imported" : mapping.source,
    createdAt: mapping.createdAt || now,
    updatedAt: now,
    aliases: normalizeAliases(mapping.aliases ?? []),
    candidateNames: (mapping.candidateNames ?? []).map((candidate) => ({
      ...candidate,
      sourceFileIds: candidate.sourceFileIds ?? [],
    })),
    evidence: mapping.evidence ?? [],
    sourceFileIds: mapping.sourceFileIds ?? [],
    userEdited: mapping.userEdited || mapping.source === "user" || mapping.source === "imported",
  };
}

function mergeImportedMapping(existing: MappingRecord, incoming: MappingRecord, now: string): MappingRecord {
  const incomingName = getEffectiveMappingName(incoming);

  return {
    ...existing,
    namespace: existing.namespace ?? incoming.namespace,
    rawId: existing.rawId ?? incoming.rawId,
    category: incoming.category,
    subcategory: incoming.subcategory ?? existing.subcategory,
    suggestedCategory: existing.suggestedCategory ?? incoming.suggestedCategory,
    name: incomingName ?? existing.name,
    displayName: incomingName ?? existing.displayName,
    userName: incoming.userEdited ? incomingName : existing.userName,
    internalName: existing.internalName ?? incoming.internalName,
    canonicalInternalName: existing.canonicalInternalName ?? incoming.canonicalInternalName,
    status: incoming.status,
    source: incoming.source === "builtin" ? existing.source : incoming.source,
    aliases: mergeUnique(existing.aliases, incoming.aliases),
    rawBlueprint: existing.rawBlueprint ?? incoming.rawBlueprint,
    confidence: incoming.confidence ?? existing.confidence,
    confirmationType: incoming.confirmationType ?? existing.confirmationType,
    sourceFileIds: mergeUnique(existing.sourceFileIds, incoming.sourceFileIds),
    userEdited: existing.userEdited || incoming.userEdited,
    notes: incoming.notes ?? existing.notes,
    candidateNames: mergeCandidateNames(existing.candidateNames, incoming.candidateNames, now),
    evidence: mergeEvidenceList(existing.evidence, incoming.evidence),
    updatedAt: now,
  };
}

function getEffectiveMappingName(mapping: MappingRecord): string | null {
  return mapping.userName ?? mapping.displayName ?? mapping.name ?? mapping.builtinName ?? null;
}

function incrementStatusSummary(summary: MappingDiscoverySummary, status: MappingStatus): void {
  if (status === "confirmed") {
    summary.autoConfirmed += 1;
  } else if (status === "typed") {
    summary.typed += 1;
  } else if (status === "inferred") {
    summary.inferred += 1;
  } else if (status === "unresolved") {
    summary.unresolved += 1;
  } else if (status === "unconfirmed") {
    summary.unconfirmed += 1;
  } else {
    summary.conflicts += 1;
  }
}

function mergeDiscoveryCandidatesIntoMapping(
  existing: readonly MappingCandidateName[],
  incoming: readonly MappingDiscoveryCandidate[],
  now: string,
  sourceFileId: string | null,
): MappingCandidateName[] {
  return incoming.reduce(
    (next, candidate) =>
      mergeCandidateName(
        next,
        candidate.name,
        candidate.source,
        now,
        candidate.occurrences,
        sourceFileId,
      ),
    [...existing],
  );
}

function mergeCandidateNames(
  existing: readonly MappingCandidateName[],
  incoming: readonly MappingCandidateName[],
  now: string,
): MappingCandidateName[] {
  return incoming.reduce(
    (next, candidate) =>
      mergeCandidateName(
        next,
        candidate.name,
        candidate.source,
        now,
        candidate.occurrences,
        null,
        candidate.sourceFileIds,
      ),
    [...existing],
  );
}

function mergeCandidateName(
  candidates: readonly MappingCandidateName[],
  name: string,
  source: MappingCandidateSource,
  now: string,
  occurrences = 1,
  sourceFileId: string | null = null,
  sourceFileIds: readonly string[] = [],
): MappingCandidateName[] {
  const current = candidates.find((candidate) => candidate.name === name);
  const nextSourceFileIds = mergeUnique(sourceFileIds, sourceFileId ? [sourceFileId] : []);

  if (!current) {
    return [
      ...candidates,
      {
        name,
        occurrences,
        source,
        firstSeenAt: now,
        lastSeenAt: now,
        sourceFileIds: nextSourceFileIds,
      },
    ];
  }

  const currentSourceFileIds = current.sourceFileIds ?? [];
  const alreadySeenInSource = Boolean(sourceFileId && currentSourceFileIds.includes(sourceFileId));
  const occurrenceIncrement = alreadySeenInSource ? 0 : occurrences;

  return candidates.map((candidate) =>
    candidate.name === name
      ? {
          ...candidate,
          occurrences: candidate.occurrences + occurrenceIncrement,
          lastSeenAt: now,
          sourceFileIds: mergeUnique(currentSourceFileIds, nextSourceFileIds),
        }
      : candidate,
  );
}

function mergeEvidence(existing: readonly MappingEvidence[], evidence: MappingEvidence): MappingEvidence[] {
  return mergeEvidenceList(existing, [evidence]);
}

function mergeEvidenceList(existing: readonly MappingEvidence[], incoming: readonly MappingEvidence[]): MappingEvidence[] {
  const next = [...existing];

  incoming.forEach((evidence) => {
    const currentIndex = next.findIndex(
      (item) => item.type === evidence.type && item.value === evidence.value && item.sourceFileId === evidence.sourceFileId,
    );

    if (currentIndex < 0) {
      if (evidence.occurrences > 0) {
        next.push(evidence);
      }
      return;
    }

    if (evidence.occurrences <= 0) {
      return;
    }

    next[currentIndex] = {
      ...next[currentIndex],
      occurrences:
        evidence.sourceFileId && next[currentIndex].sourceFileId === evidence.sourceFileId
          ? Math.max(next[currentIndex].occurrences, evidence.occurrences)
          : next[currentIndex].occurrences + evidence.occurrences,
      sample: next[currentIndex].sample ?? evidence.sample,
    };
  });

  return next.slice(-20);
}

function normalizeCandidateInput(candidate: MappingDiscoveryCandidate): MappingDiscoveryCandidate | null {
  const name = candidate.name.trim();

  if (!name || name === "—") {
    return null;
  }

  if (candidate.source === "blueprint" && !name.startsWith("BP_")) {
    return null;
  }

  if (candidate.source === "blueprint" && isIgnoredMappingBlueprint(name)) {
    return null;
  }

  if (candidate.source !== "blueprint" && (name.startsWith("BP_") || /^-?\d+(?:\.\d+)?$/.test(name))) {
    return null;
  }

  return {
    ...candidate,
    name,
    occurrences: positiveInteger(candidate.occurrences),
  };
}

function mergeDiscoveryCandidate(
  candidates: readonly MappingDiscoveryCandidate[],
  incoming: MappingDiscoveryCandidate,
): MappingDiscoveryCandidate[] {
  const current = candidates.find((candidate) => candidate.name === incoming.name && candidate.source === incoming.source);

  if (!current) {
    return [...candidates, incoming];
  }

  return candidates.map((candidate) =>
    candidate.name === incoming.name && candidate.source === incoming.source
      ? {
          ...candidate,
          occurrences: candidate.occurrences + incoming.occurrences,
          confidence: strongestConfidence(candidate.confidence, incoming.confidence),
          evidenceType: strongestEvidence(candidate.evidenceType, incoming.evidenceType),
          sample: candidate.sample ?? incoming.sample,
        }
      : candidate,
  );
}

function selectBestCandidate(
  candidates: readonly MappingDiscoveryCandidate[],
  kind: "name" | "blueprint",
): MappingDiscoveryCandidate | null {
  const matching = candidates.filter((candidate) => (kind === "blueprint") === (candidate.source === "blueprint"));

  return (
    matching
      .slice()
      .sort(
        (left, right) =>
          evidenceRank(right.evidenceType) - evidenceRank(left.evidenceType) ||
          right.occurrences - left.occurrences ||
          left.name.localeCompare(right.name),
      )[0] ?? null
  );
}

function positiveInteger(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    return 1;
  }

  return Math.max(1, Math.floor(value));
}

function strongestConfidence(left: MappingConfidence, right: MappingConfidence): MappingConfidence {
  const rank: Record<NonNullable<MappingConfidence>, number> = {
    confirmed: 4,
    high: 3,
    medium: 2,
    low: 1,
  };

  if (!left) {
    return right;
  }

  if (!right) {
    return left;
  }

  return rank[right] > rank[left] ? right : left;
}

function strongestEvidence(left: MappingEvidenceType, right: MappingEvidenceType): MappingEvidenceType {
  return evidenceRank(right) > evidenceRank(left) ? right : left;
}

function evidenceRank(type: MappingEvidenceType): number {
  const rank: Record<MappingEvidenceType, number> = {
    confirmed_multi: 120,
    manual: 115,
    direct_name_id: 110,
    item_info: 108,
    "direct-id-name": 110,
    bp_class_id: 90,
    map_info: 88,
    "battle-result": 88,
    gid_correlation: 75,
    typed_field: 50,
    contextual: 35,
    id_pattern: 20,
    "direct-name": 90,
    "same-event": 35,
    "same-instance": 35,
    blueprint: 50,
    proximity: 20,
    "id-usage": 10,
    user: 100,
    imported: 90,
  };

  return rank[type];
}

function normalizeAliases(aliases: readonly string[]): string[] {
  return mergeUnique(
    [],
    aliases
      .flatMap((alias) => alias.split(","))
      .map((alias) => alias.trim())
      .filter(Boolean),
  );
}

function mergeUnique(existing: readonly string[], incoming: readonly string[]): string[] {
  return Array.from(new Set([...existing, ...incoming]));
}

function createCategoryCounter(): Record<MappingCategory, number> {
  return {
    weapon: 0,
    ammo: 0,
    magazine: 0,
    armor: 0,
    helmet: 0,
    rig: 0,
    backpack: 0,
    headset: 0,
    attachment: 0,
    throwable: 0,
    medical: 0,
    provision: 0,
    food: 0,
    drink: 0,
    key: 0,
    currency: 0,
    loot: 0,
    map: 0,
    bodyPart: 0,
    equipment: 0,
    other: 0,
  };
}

function normalizeEvidenceType(type: MappingEvidenceType): MappingEvidenceType {
  if (type === "direct-id-name") {
    return "direct_name_id";
  }

  if (type === "battle-result") {
    return "map_info";
  }

  if (type === "id-usage") {
    return "typed_field";
  }

  if (type === "blueprint") {
    return "bp_class_id";
  }

  if (type === "same-event" || type === "same-instance" || type === "proximity") {
    return "contextual";
  }

  if (type === "user") {
    return "manual";
  }

  return type;
}

function confirmationTypeForEvidence(type: MappingEvidenceType | null): string | null {
  if (!type) {
    return null;
  }

  const normalized = normalizeEvidenceType(type);

  if (normalized === "manual") {
    return "manual";
  }

  if (normalized === "direct_name_id" || normalized === "item_info" || normalized === "map_info") {
    return "direct";
  }

  if (normalized === "confirmed_multi") {
    return "multi_source";
  }

  return null;
}

function normalizeInternalName(value: string | null | undefined): string | null {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  return normalized.replace(/_C_\d+$/, "").replace(/_C$/, "");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
