import { createBuiltInMappingRecords } from "./mappingBuiltins";
import { collectMappingDiscoveriesFromRaids } from "./mappingDiscovery";
import {
  getAllFromStore,
  getSetting,
  putSetting,
  requestToPromise,
  runMappingTransaction,
} from "./database";
import type { Raid } from "../types/raid";
import type {
  MappingBackupPayload,
  MappingCandidateName,
  MappingCategory,
  MappingDiscoveryEntry,
  MappingDiscoverySummary,
  MappingEvidence,
  MappingImportSummary,
  MappingRecord,
  MappingSource,
  MappingStatus,
  MappingSummary,
} from "./mappingTypes";

export interface SaveMappingInput {
  id: string;
  category: MappingCategory;
  name: string;
  status: MappingStatus;
  aliases: string[];
  notes: string | null;
}

export async function getAllMappings(): Promise<MappingRecord[]> {
  const mappings = await getAllFromStore<MappingRecord>("mappings");
  return mappings.sort((left, right) => left.id.localeCompare(right.id, undefined, { numeric: true }));
}

export async function ensureBuiltInMappingsSeeded(): Promise<{ inserted: number; updated: number; totalBuiltIn: number }> {
  const builtIns = createBuiltInMappingRecords();
  let inserted = 0;
  let updated = 0;

  await runMappingTransaction(async (store) => {
    for (const builtIn of builtIns) {
      const existing = ((await requestToPromise(store.get(builtIn.id))) as MappingRecord | undefined) ?? null;

      if (!existing) {
        inserted += 1;
        await requestToPromise(store.put(builtIn));
        continue;
      }

      const next = mergeBuiltInMapping(existing, builtIn);

      if (JSON.stringify(next) !== JSON.stringify(existing)) {
        updated += 1;
        await requestToPromise(store.put(next));
      }
    }
  });

  return {
    inserted,
    updated,
    totalBuiltIn: builtIns.length,
  };
}

export async function recordMappingDiscoveriesFromRaids(
  raids: readonly Raid[],
  sourceFileId: string | null,
): Promise<MappingDiscoverySummary> {
  return recordMappingDiscoveries(collectMappingDiscoveriesFromRaids(raids), sourceFileId);
}

export async function discoverMappingsForExistingRaidsOnce(raids: readonly Raid[]): Promise<MappingDiscoverySummary | null> {
  const settingKey = "mappingDiscovery.existingRaids.v1";
  const completed = await getSetting<{ completedAt: string; raidCount: number }>(settingKey);

  if (completed || raids.length === 0) {
    return null;
  }

  const summary = await recordMappingDiscoveriesFromRaids(raids, "existing-local-raids");
  await putSetting(settingKey, {
    completedAt: new Date().toISOString(),
    raidCount: raids.length,
  });
  return summary;
}

export async function rediscoverMappingsForExistingRaids(raids: readonly Raid[]): Promise<MappingDiscoverySummary> {
  return recordMappingDiscoveriesFromRaids(raids, "existing-local-raids");
}

export async function recordMappingDiscoveries(
  entries: readonly MappingDiscoveryEntry[],
  sourceFileId: string | null,
): Promise<MappingDiscoverySummary> {
  const now = new Date().toISOString();
  const grouped = groupDiscoveryEntries(entries);
  const summary: MappingDiscoverySummary = {
    newIds: 0,
    rediscoveredIds: 0,
    autoConfirmed: 0,
    unconfirmed: 0,
    conflicts: 0,
    processedOccurrences: entries.length,
  };

  await runMappingTransaction(async (store) => {
    for (const entry of grouped) {
      const existing = ((await requestToPromise(store.get(entry.id))) as MappingRecord | undefined) ?? null;

      if (!existing) {
        const created = createDiscoveredMappingRecord(entry, sourceFileId, now);
        summary.newIds += 1;
        incrementStatusSummary(summary, created.status);
        await requestToPromise(store.put(created));
        continue;
      }

      const next = mergeDiscoveryIntoMapping(existing, entry, sourceFileId, now);

      summary.rediscoveredIds += 1;
      incrementStatusSummary(summary, next.status);

      if (existing.status !== "conflict" && next.status === "conflict") {
        summary.conflicts += 1;
      }

      await requestToPromise(store.put(next));
    }
  });

  return summary;
}

export async function saveMapping(input: SaveMappingInput): Promise<MappingRecord> {
  const now = new Date().toISOString();
  const id = input.id.trim();

  if (!id) {
    throw new Error("Mapping ID is required.");
  }

  if (!input.name.trim()) {
    throw new Error("Mapping name is required.");
  }

  let saved: MappingRecord | null = null;

  await runMappingTransaction(async (store) => {
    const existing = ((await requestToPromise(store.get(id))) as MappingRecord | undefined) ?? null;
    const base = existing ?? createUserMappingRecord(id, input.category, now);
    const next: MappingRecord = {
      ...base,
      category: input.category,
      name: input.name.trim(),
      userName: input.name.trim(),
      status: input.status,
      source: base.source === "builtin" ? "builtin" : "user",
      aliases: normalizeAliases(input.aliases),
      notes: input.notes?.trim() || null,
      updatedAt: now,
      userEdited: true,
      confidence: input.status === "confirmed" ? "high" : base.confidence,
      evidence: mergeEvidence(base.evidence, {
        type: "user",
        value: input.name.trim(),
        occurrences: 1,
        sourceFileId: null,
      }),
    };

    saved = next;
    await requestToPromise(store.put(next));
  });

  if (!saved) {
    throw new Error("Failed to save mapping.");
  }

  return saved;
}

export async function resetOrDeleteMapping(id: string): Promise<"deleted" | "reset"> {
  let action: "deleted" | "reset" = "deleted";
  const now = new Date().toISOString();

  await runMappingTransaction(async (store) => {
    const existing = ((await requestToPromise(store.get(id))) as MappingRecord | undefined) ?? null;

    if (!existing) {
      return;
    }

    if (existing.builtinName) {
      action = "reset";
      await requestToPromise(
        store.put({
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
        } satisfies MappingRecord),
      );
      return;
    }

    if (existing.occurrenceCount > 0 || existing.sourceFileIds.length > 0) {
      action = "reset";
      await requestToPromise(
        store.put({
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
        } satisfies MappingRecord),
      );
      return;
    }

    await requestToPromise(store.delete(id));
  });

  return action;
}

export async function bulkUpdateMappingCategory(ids: readonly string[], category: MappingCategory): Promise<number> {
  const now = new Date().toISOString();
  let updated = 0;

  await runMappingTransaction(async (store) => {
    for (const id of ids) {
      const existing = ((await requestToPromise(store.get(id))) as MappingRecord | undefined) ?? null;

      if (!existing) {
        continue;
      }

      updated += 1;
      await requestToPromise(
        store.put({
          ...existing,
          category,
          updatedAt: now,
          userEdited: true,
          evidence: mergeEvidence(existing.evidence, {
            type: "user",
            value: `category:${category}`,
            occurrences: 1,
            sourceFileId: null,
          }),
        } satisfies MappingRecord),
      );
    }
  });

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
  const summary: MappingImportSummary = {
    imported: mappings.length,
    inserted: 0,
    updated: 0,
    conflicts: 0,
    kept: 0,
  };

  await runMappingTransaction(async (store) => {
    for (const incoming of mappings) {
      const existing = ((await requestToPromise(store.get(incoming.id))) as MappingRecord | undefined) ?? null;
      const normalizedIncoming = normalizeImportedMapping(incoming, now);

      if (!existing) {
        summary.inserted += 1;
        await requestToPromise(store.put(normalizedIncoming));
        continue;
      }

      const existingDisplayName = getEffectiveMappingName(existing);
      const incomingDisplayName = getEffectiveMappingName(normalizedIncoming);

      if (existing.userEdited && incomingDisplayName && existingDisplayName && existingDisplayName !== incomingDisplayName) {
        summary.conflicts += 1;
        await requestToPromise(
          store.put({
            ...existing,
            status: "conflict",
            candidateNames: mergeCandidateName(existing.candidateNames, incomingDisplayName, "imported", now),
            updatedAt: now,
          } satisfies MappingRecord),
        );
        continue;
      }

      summary.updated += 1;
      await requestToPromise(store.put(mergeImportedMapping(existing, normalizedIncoming, now)));
    }
  });

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
    unconfirmed: mappings.filter((mapping) => mapping.status === "unconfirmed").length,
    conflict: mappings.filter((mapping) => mapping.status === "conflict").length,
    byCategory,
    bySource,
  };
}

function mergeBuiltInMapping(existing: MappingRecord, builtIn: MappingRecord): MappingRecord {
  const next: MappingRecord = {
    ...existing,
    builtinName: builtIn.builtinName,
    suggestedCategory: existing.suggestedCategory ?? builtIn.category,
    evidence: mergeEvidence(existing.evidence, builtIn.evidence[0]),
  };

  if (!existing.userEdited) {
    next.name = builtIn.name;
    next.category = existing.source === "log" && existing.category !== builtIn.category ? existing.category : builtIn.category;
    next.status = "confirmed";
    next.source = "builtin";
    next.confidence = "high";
  }

  return next;
}

function groupDiscoveryEntries(entries: readonly MappingDiscoveryEntry[]): Array<MappingDiscoveryEntry & { occurrenceCount: number }> {
  const byId = new Map<string, MappingDiscoveryEntry & { occurrenceCount: number }>();

  entries.forEach((entry) => {
    const current = byId.get(entry.id);

    if (!current) {
      byId.set(entry.id, { ...entry, occurrenceCount: 1 });
      return;
    }

    current.occurrenceCount += 1;

    if (!current.candidateName && entry.candidateName) {
      current.candidateName = entry.candidateName;
    }
  });

  return Array.from(byId.values());
}

function createDiscoveredMappingRecord(
  entry: MappingDiscoveryEntry & { occurrenceCount?: number },
  sourceFileId: string | null,
  now: string,
): MappingRecord {
  const confirmed = entry.autoConfirm === true && Boolean(entry.candidateName);
  const name = confirmed ? entry.candidateName ?? null : null;

  return {
    id: entry.id,
    category: entry.category,
    suggestedCategory: entry.suggestedCategory ?? entry.category,
    name,
    builtinName: null,
    userName: null,
    status: confirmed ? "confirmed" : "unconfirmed",
    source: "log",
    aliases: [],
    rawBlueprint: entry.rawBlueprint ?? null,
    confidence: entry.confidence ?? (confirmed ? "medium" : "low"),
    occurrenceCount: entry.occurrenceCount ?? 1,
    firstSeenAt: now,
    lastSeenAt: now,
    sourceFileIds: sourceFileId ? [sourceFileId] : [],
    createdAt: now,
    updatedAt: now,
    userEdited: false,
    notes: null,
    candidateNames: entry.candidateName && !confirmed ? mergeCandidateName([], entry.candidateName, "log", now) : [],
    evidence: [
      {
        type: entry.evidenceType,
        value: entry.candidateName ?? entry.rawBlueprint ?? null,
        occurrences: entry.occurrenceCount ?? 1,
        sourceFileId,
      },
    ],
  };
}

function mergeDiscoveryIntoMapping(
  existing: MappingRecord,
  entry: MappingDiscoveryEntry & { occurrenceCount?: number },
  sourceFileId: string | null,
  now: string,
): MappingRecord {
  const occurrenceCount = entry.occurrenceCount ?? 1;
  const next: MappingRecord = {
    ...existing,
    suggestedCategory: existing.suggestedCategory ?? entry.suggestedCategory ?? entry.category,
    occurrenceCount: existing.occurrenceCount + occurrenceCount,
    firstSeenAt: existing.firstSeenAt ?? now,
    lastSeenAt: now,
    sourceFileIds: mergeUnique(existing.sourceFileIds, sourceFileId ? [sourceFileId] : []),
    rawBlueprint: existing.rawBlueprint ?? entry.rawBlueprint ?? null,
    updatedAt: now,
    evidence: mergeEvidence(existing.evidence, {
      type: entry.evidenceType,
      value: entry.candidateName ?? entry.rawBlueprint ?? null,
      occurrences: occurrenceCount,
      sourceFileId,
    }),
  };

  if (entry.candidateName) {
    const displayName = getEffectiveMappingName(existing);

    if (entry.autoConfirm && existing.status === "confirmed" && displayName && displayName !== entry.candidateName && !existing.userEdited) {
      next.status = "conflict";
    } else if (!displayName || displayName !== entry.candidateName) {
      next.candidateNames = mergeCandidateName(existing.candidateNames, entry.candidateName, "log", now);
    }
  }

  return next;
}

function createUserMappingRecord(id: string, category: MappingCategory, now: string): MappingRecord {
  return {
    id,
    category,
    suggestedCategory: category,
    name: null,
    builtinName: null,
    userName: null,
    status: "confirmed",
    source: "user",
    aliases: [],
    rawBlueprint: null,
    confidence: "high",
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
  return {
    ...mapping,
    id: String(mapping.id),
    source: mapping.source === "builtin" ? "imported" : mapping.source,
    createdAt: mapping.createdAt || now,
    updatedAt: now,
    aliases: normalizeAliases(mapping.aliases ?? []),
    candidateNames: mapping.candidateNames ?? [],
    evidence: mapping.evidence ?? [],
    sourceFileIds: mapping.sourceFileIds ?? [],
    userEdited: mapping.userEdited || mapping.source === "user" || mapping.source === "imported",
  };
}

function mergeImportedMapping(existing: MappingRecord, incoming: MappingRecord, now: string): MappingRecord {
  const incomingName = getEffectiveMappingName(incoming);

  return {
    ...existing,
    category: incoming.category,
    suggestedCategory: existing.suggestedCategory ?? incoming.suggestedCategory,
    name: incomingName ?? existing.name,
    userName: incoming.userEdited ? incomingName : existing.userName,
    status: incoming.status,
    source: incoming.source === "builtin" ? existing.source : incoming.source,
    aliases: mergeUnique(existing.aliases, incoming.aliases),
    rawBlueprint: existing.rawBlueprint ?? incoming.rawBlueprint,
    confidence: incoming.confidence ?? existing.confidence,
    sourceFileIds: mergeUnique(existing.sourceFileIds, incoming.sourceFileIds),
    userEdited: existing.userEdited || incoming.userEdited,
    notes: incoming.notes ?? existing.notes,
    candidateNames: mergeCandidateNames(existing.candidateNames, incoming.candidateNames, now),
    evidence: mergeEvidenceList(existing.evidence, incoming.evidence),
    updatedAt: now,
  };
}

function getEffectiveMappingName(mapping: MappingRecord): string | null {
  return mapping.userName ?? mapping.name ?? mapping.builtinName ?? null;
}

function incrementStatusSummary(summary: MappingDiscoverySummary, status: MappingStatus): void {
  if (status === "confirmed") {
    summary.autoConfirmed += 1;
  } else if (status === "unconfirmed") {
    summary.unconfirmed += 1;
  } else {
    summary.conflicts += 1;
  }
}

function mergeCandidateNames(
  existing: readonly MappingCandidateName[],
  incoming: readonly MappingCandidateName[],
  now: string,
): MappingCandidateName[] {
  return incoming.reduce(
    (next, candidate) => mergeCandidateName(next, candidate.name, candidate.source, now, candidate.occurrences),
    [...existing],
  );
}

function mergeCandidateName(
  candidates: readonly MappingCandidateName[],
  name: string,
  source: MappingSource,
  now: string,
  occurrences = 1,
): MappingCandidateName[] {
  const current = candidates.find((candidate) => candidate.name === name);

  if (!current) {
    return [
      ...candidates,
      {
        name,
        occurrences,
        source,
        firstSeenAt: now,
        lastSeenAt: now,
      },
    ];
  }

  return candidates.map((candidate) =>
    candidate.name === name
      ? {
          ...candidate,
          occurrences: candidate.occurrences + occurrences,
          lastSeenAt: now,
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
      next.push(evidence);
      return;
    }

    next[currentIndex] = {
      ...next[currentIndex],
      occurrences: next[currentIndex].occurrences + evidence.occurrences,
    };
  });

  return next.slice(-20);
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
    armor: 0,
    helmet: 0,
    rig: 0,
    backpack: 0,
    headset: 0,
    attachment: 0,
    throwable: 0,
    medical: 0,
    provision: 0,
    key: 0,
    currency: 0,
    loot: 0,
    map: 0,
    bodyPart: 0,
    equipment: 0,
    other: 0,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
