import { Download, Plus, RotateCcw, Save, Search, Trash2, Upload } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { mappingCategories, mappingCategoryLabels, mappingStatusLabels } from "../../db/mappingLabels";
import { isIgnoredMappingBlueprint } from "../../db/mappingCandidateFilters";
import { createMappingKey } from "../../db/mappingIdentity";
import type { SaveMappingInput } from "../../db/mappingRepository";
import { summarizeMappings } from "../../db/mappingRepository";
import type { MappingCategory, MappingNamespace, MappingRecord, MappingStatus, MappingUsageStats } from "../../db/mappingTypes";
import type { StoredRaid } from "../../db/types";
import { getConfirmedDisplayName } from "../../data/mappingResolver";
import { cn } from "../../utils/classNames";
import { displayValue, emptyValue, formatDateTime, formatNumber } from "../../utils/format";
import { SectionPanel } from "../layout/SectionPanel";
import { StatusBadge } from "../layout/StatusBadge";

type StatusFilter = "all" | MappingStatus;
type SortKey = "rawId" | "name" | "category" | "occurrenceCount" | "lastSeenAt" | "status" | "namespace";

interface MappingManagementPageProps {
  mappings: MappingRecord[];
  raids: StoredRaid[];
  onSave: (input: SaveMappingInput) => Promise<void>;
  onResetOrDelete: (id: string) => Promise<void>;
  onBulkCategory: (ids: string[], category: MappingCategory) => Promise<void>;
  onExportMappings: () => void;
  onImportMappings: (file: File) => Promise<void>;
  onSyncBuiltIns: () => Promise<void>;
  onDiscoverFromRaids: () => Promise<void>;
}

interface MappingDraft {
  namespace: MappingNamespace;
  rawId: string;
  category: MappingCategory;
  name: string;
  status: MappingStatus;
  aliases: string;
  notes: string;
}

const defaultDraft: MappingDraft = {
  namespace: "item",
  rawId: "",
  category: "weapon",
  name: "",
  status: "confirmed",
  aliases: "",
  notes: "",
};

export function MappingManagementPage({
  mappings,
  raids,
  onSave,
  onResetOrDelete,
  onBulkCategory,
  onExportMappings,
  onImportMappings,
  onSyncBuiltIns,
  onDiscoverFromRaids,
}: MappingManagementPageProps) {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | MappingCategory>("all");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("occurrenceCount");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<MappingDraft>(defaultDraft);
  const [bulkCategory, setBulkCategory] = useState<MappingCategory>("equipment");
  const [isSaving, setIsSaving] = useState(false);
  const [isMaintenanceRunning, setIsMaintenanceRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const summary = useMemo(() => summarizeMappings(mappings), [mappings]);
  const usageById = useMemo(() => calculateMappingUsage(raids), [raids]);
  const selectedMapping = editingId && editingId !== "new" ? mappings.find((mapping) => mapping.id === editingId) ?? null : null;

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
    const id = params.get("id");
    const status = params.get("status");

    if (isMappingStatus(status)) {
      setStatusFilter(status);
    }

    if (id) {
      setQuery(id);
      const mapping = mappings.find((item) => item.id === id || item.rawId === id) ?? null;
      setEditingId(mapping?.id ?? id);
      setDraft(mapping ? createDraftFromMapping(mapping) : { ...defaultDraft, rawId: id });
    }
  }, [mappings]);

  const filteredMappings = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return mappings
      .filter((mapping) => statusFilter === "all" || mapping.status === statusFilter)
      .filter((mapping) => categoryFilter === "all" || mapping.category === categoryFilter)
      .filter((mapping) => {
        if (!normalizedQuery) {
          return true;
        }

        const haystack = [
          mapping.id,
          mapping.namespace,
          mapping.rawId,
          getDisplayName(mapping),
          mapping.builtinName,
          mapping.userName,
          mapping.internalName,
          mapping.canonicalInternalName,
          mapping.rawBlueprint,
          mapping.aliases.join(" "),
          mapping.candidateNames.map((candidate) => candidate.name).join(" "),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedQuery);
      })
      .sort((left, right) => compareMappings(left, right, sortKey));
  }, [categoryFilter, mappings, query, sortKey, statusFilter]);

  const visibleIds = filteredMappings.map((mapping) => mapping.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  const openMapping = (mapping: MappingRecord) => {
    setEditingId(mapping.id);
    setDraft(createDraftFromMapping(mapping));
  };

  const openNewMapping = () => {
    setEditingId("new");
    setDraft(defaultDraft);
  };

  const saveDraft = async () => {
    setIsSaving(true);
    try {
      await onSave({
        namespace: draft.namespace,
        rawId: draft.rawId,
        category: draft.category,
        name: draft.name,
        status: draft.status,
        aliases: draft.aliases.split(","),
        notes: draft.notes,
      });
      setEditingId(null);
      setDraft(defaultDraft);
    } finally {
      setIsSaving(false);
    }
  };

  const resetOrDelete = async () => {
    if (!selectedMapping) {
      return;
    }

    await onResetOrDelete(selectedMapping.id);
    setEditingId(null);
    setDraft(defaultDraft);
  };

  const runMaintenance = async (message: string, action: () => Promise<void>) => {
    setIsMaintenanceRunning(true);
    setNotice(null);

    try {
      await action();
      setNotice(message);
    } finally {
      setIsMaintenanceRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="panel p-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] uppercase text-abi-muted">Local Mapping DB</p>
            <h1 className="mt-1 text-xl font-semibold text-abi-text">Mapping Management</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="secondary-button"
              disabled={isMaintenanceRunning}
              onClick={() => {
                void runMaintenance("기본 매핑을 SQLite에 저장/동기화했습니다.", onSyncBuiltIns);
              }}
            >
              <Save size={16} aria-hidden="true" />
              기본 매핑 저장
            </button>
            <button
              className="secondary-button"
              disabled={isMaintenanceRunning || raids.length === 0}
              onClick={() => {
                void runMaintenance("기존 Raid에서 매핑 ID를 재수집했습니다.", onDiscoverFromRaids);
              }}
            >
              <RotateCcw size={16} aria-hidden="true" />
              기존 Raid 재수집
            </button>
            <button className="secondary-button" onClick={openNewMapping}>
              <Plus size={16} aria-hidden="true" />
              매핑 추가
            </button>
            <button className="secondary-button" onClick={onExportMappings}>
              <Download size={16} aria-hidden="true" />
              매핑 내보내기
            </button>
            <button className="secondary-button" onClick={() => importInputRef.current?.click()}>
              <Upload size={16} aria-hidden="true" />
              매핑 가져오기
            </button>
            <input
              ref={importInputRef}
              className="hidden"
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) {
                  void onImportMappings(file);
                  event.currentTarget.value = "";
                }
              }}
            />
          </div>
        </div>
      </section>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4">
          {notice && (
            <div className="border border-abi-green/60 bg-abi-green/10 px-3 py-2 text-xs text-abi-green">
              {notice}
            </div>
          )}

          <SummaryStrip summary={summary} />

          <SectionPanel title="Mappings" eyebrow="List">
            <div className="mb-3 grid gap-2 xl:grid-cols-[auto_auto_minmax(240px,1fr)_180px]">
              <SegmentedStatus value={statusFilter} onChange={setStatusFilter} />
              <select
                className="border border-abi-line bg-abi-black px-3 py-2 text-xs text-abi-text"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value as "all" | MappingCategory)}
              >
                <option value="all">전체 카테고리</option>
                {mappingCategories.map((category) => (
                  <option key={category} value={category}>
                    {mappingCategoryLabels[category]}
                  </option>
                ))}
              </select>
              <label className="flex min-w-0 items-center gap-2 border border-abi-line bg-abi-black px-3 py-2 text-xs">
                <Search size={14} aria-hidden="true" className="text-abi-muted" />
                <input
                  className="min-w-0 flex-1 bg-transparent text-abi-text outline-none placeholder:text-abi-muted"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="ID, 이름, alias, blueprint 검색"
                />
              </label>
              <select
                className="border border-abi-line bg-abi-black px-3 py-2 text-xs text-abi-text"
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SortKey)}
              >
                <option value="occurrenceCount">발견 횟수</option>
                <option value="lastSeenAt">최근 발견</option>
                <option value="rawId">ID</option>
                <option value="namespace">Namespace</option>
                <option value="name">이름</option>
                <option value="category">카테고리</option>
                <option value="status">상태</option>
              </select>
            </div>

            {selectedIds.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-2 border border-abi-line bg-abi-black px-3 py-2 text-xs">
                <span className="text-abi-muted">선택 {formatNumber(selectedIds.length)}</span>
                <select
                  className="border border-abi-line bg-abi-panel px-2 py-1 text-abi-text"
                  value={bulkCategory}
                  onChange={(event) => setBulkCategory(event.target.value as MappingCategory)}
                >
                  {mappingCategories.map((category) => (
                    <option key={category} value={category}>
                      {mappingCategoryLabels[category]}
                    </option>
                  ))}
                </select>
                <button
                  className="secondary-button h-7"
                  onClick={() => {
                    void onBulkCategory(selectedIds, bulkCategory).then(() => setSelectedIds([]));
                  }}
                >
                  카테고리 지정
                </button>
              </div>
            )}

            <div className="thin-scrollbar overflow-x-auto">
              <table className="min-w-[1240px] w-full border-collapse">
                <thead>
                  <tr>
                    <th className="table-head w-10">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={(event) => {
                          setSelectedIds(event.target.checked ? visibleIds : []);
                        }}
                      />
                    </th>
                    <th className="table-head">Namespace</th>
                    <th className="table-head">ID</th>
                    <th className="table-head">이름</th>
                    <th className="table-head">Internal</th>
                    <th className="table-head">카테고리</th>
                    <th className="table-head">상태</th>
                    <th className="table-head text-right">발견</th>
                    <th className="table-head text-right">로그</th>
                    <th className="table-head">최근 발견</th>
                    <th className="table-head">후보</th>
                    <th className="table-head text-right">Used In</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMappings.map((mapping) => {
                    const usage = usageById.get(mapping.id) ?? createEmptyUsage();
                    const checked = selectedIds.includes(mapping.id);
                    const nameCandidates = getNameCandidates(mapping);
                    const blueprintCandidates = getBlueprintCandidates(mapping);

                    return (
                      <tr
                        key={mapping.id}
                        className={cn(
                          "cursor-pointer bg-abi-panel transition hover:bg-abi-panel2",
                          editingId === mapping.id && "bg-abi-panel2",
                        )}
                        onClick={() => openMapping(mapping)}
                      >
                        <td className="table-cell">
                          <input
                            type="checkbox"
                            checked={checked}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => {
                              setSelectedIds((current) =>
                                event.target.checked
                                  ? [...current, mapping.id]
                                  : current.filter((id) => id !== mapping.id),
                              );
                            }}
                          />
                        </td>
                        <td className="table-cell font-mono">{mapping.namespace}</td>
                        <td className="table-cell font-mono">{mapping.rawId}</td>
                        <td className="table-cell max-w-64 truncate font-semibold">{displayValue(getDisplayName(mapping))}</td>
                        <td className="table-cell max-w-56 truncate font-mono">{displayValue(mapping.canonicalInternalName ?? mapping.internalName)}</td>
                        <td className="table-cell">{mappingCategoryLabels[mapping.category]}</td>
                        <td className="table-cell">
                          <MappingStatusBadge status={mapping.status} />
                        </td>
                        <td className="table-cell text-right font-mono">{formatNumber(mapping.occurrenceCount)}</td>
                        <td className="table-cell text-right font-mono">{formatNumber(mapping.sourceFileIds.length)}</td>
                        <td className="table-cell font-mono">{formatOptionalDate(mapping.lastSeenAt)}</td>
                        <td className="table-cell max-w-52 truncate">
                          {nameCandidates.length > 0
                            ? nameCandidates.map((candidate) => `${candidate.name} (${candidate.occurrences})`).join(", ")
                            : blueprintCandidates.length > 0
                              ? blueprintCandidates.map((candidate) => `${candidate.name} (${candidate.occurrences})`).join(", ")
                            : emptyValue}
                        </td>
                        <td className="table-cell text-right font-mono">
                          {formatNumber(usage.kills + usage.deaths + usage.incoming + usage.maps)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionPanel>
        </div>

        <MappingEditor
          mapping={selectedMapping}
          draft={draft}
          isNew={editingId === "new"}
          isSaving={isSaving}
          usage={selectedMapping ? usageById.get(selectedMapping.id) ?? createEmptyUsage() : createEmptyUsage()}
          onDraftChange={setDraft}
          onSave={() => void saveDraft()}
          onResetOrDelete={() => void resetOrDelete()}
        />
      </div>
    </div>
  );
}

function SummaryStrip({ summary }: { summary: ReturnType<typeof summarizeMappings> }) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
      <SummaryMetric label="Total" value={summary.total} />
      <SummaryMetric label="Confirmed" value={summary.confirmed} tone="green" />
      <SummaryMetric label="Typed" value={summary.typed} />
      <SummaryMetric label="Inferred" value={summary.inferred} tone="amber" />
      <SummaryMetric label="Unresolved" value={summary.unresolved + summary.unconfirmed} tone="amber" />
      <SummaryMetric label="Conflict" value={summary.conflict} tone="red" />
      <SummaryMetric label="Built-in" value={summary.bySource.builtin} />
      <SummaryMetric label="Log" value={summary.bySource.log} />
    </div>
  );
}

function SummaryMetric({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "green" | "amber" | "red" }) {
  const toneClass = {
    default: "text-abi-text",
    green: "text-abi-green",
    amber: "text-abi-amber",
    red: "text-abi-red",
  }[tone];

  return (
    <div className="border border-abi-line bg-abi-black px-3 py-2">
      <p className="text-[11px] uppercase text-abi-muted">{label}</p>
      <p className={`mt-1 font-mono text-xl font-semibold ${toneClass}`}>{formatNumber(value)}</p>
    </div>
  );
}

function SegmentedStatus({ value, onChange }: { value: StatusFilter; onChange: (value: StatusFilter) => void }) {
  const items: Array<{ value: StatusFilter; label: string }> = [
    { value: "all", label: "전체" },
    { value: "unresolved", label: "미해결" },
    { value: "typed", label: "유형" },
    { value: "inferred", label: "추론" },
    { value: "confirmed", label: "확인됨" },
    { value: "conflict", label: "충돌" },
  ];

  return (
    <div className="grid grid-cols-6 border border-abi-line bg-abi-black text-xs">
      {items.map((item) => (
        <button
          key={item.value}
          className={cn(
            "px-3 py-2 transition",
            value === item.value ? "bg-abi-panel2 text-abi-lime" : "text-abi-muted hover:text-abi-text",
          )}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function MappingEditor({
  mapping,
  draft,
  isNew,
  isSaving,
  usage,
  onDraftChange,
  onSave,
  onResetOrDelete,
}: {
  mapping: MappingRecord | null;
  draft: MappingDraft;
  isNew: boolean;
  isSaving: boolean;
  usage: MappingUsageStats;
  onDraftChange: (draft: MappingDraft) => void;
  onSave: () => void;
  onResetOrDelete: () => void;
}) {
  if (!mapping && !isNew) {
    return (
      <SectionPanel title="Mapping Detail" eyebrow="Editor">
        <div className="border border-abi-line bg-abi-black px-4 py-10 text-center text-sm text-abi-muted">
          Row를 선택하면 매핑을 수정할 수 있습니다.
        </div>
      </SectionPanel>
    );
  }

  return (
    <SectionPanel
      title={isNew ? "새 매핑 추가" : "Mapping Detail"}
      eyebrow="Editor"
      action={mapping && <MappingStatusBadge status={mapping.status} />}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Namespace">
            <select
              className="w-full border border-abi-line bg-abi-black px-3 py-2 text-xs text-abi-text"
              value={draft.namespace}
              disabled={!isNew}
              onChange={(event) => onDraftChange({ ...draft, namespace: event.target.value as MappingNamespace })}
            >
              <option value="item">item</option>
              <option value="map">map</option>
              <option value="skin">skin</option>
              <option value="gameplay_tag">gameplay_tag</option>
              <option value="unknown">unknown</option>
            </select>
          </Field>
          <Field label="ID">
            <input
              className="w-full border border-abi-line bg-abi-black px-3 py-2 font-mono text-xs text-abi-text outline-none"
              value={draft.rawId}
              disabled={!isNew}
              onChange={(event) => onDraftChange({ ...draft, rawId: event.target.value })}
            />
          </Field>
        </div>
        <Field label="이름">
          <input
            className="w-full border border-abi-line bg-abi-black px-3 py-2 text-xs text-abi-text outline-none"
            value={draft.name}
            onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
            placeholder="표시 이름"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="카테고리">
            <select
              className="w-full border border-abi-line bg-abi-black px-3 py-2 text-xs text-abi-text"
              value={draft.category}
              onChange={(event) => onDraftChange({ ...draft, category: event.target.value as MappingCategory })}
            >
              {mappingCategories.map((category) => (
                <option key={category} value={category}>
                  {mappingCategoryLabels[category]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="상태">
            <select
              className="w-full border border-abi-line bg-abi-black px-3 py-2 text-xs text-abi-text"
              value={draft.status}
              onChange={(event) => onDraftChange({ ...draft, status: event.target.value as MappingStatus })}
            >
              <option value="unresolved">Unresolved</option>
              <option value="typed">Typed</option>
              <option value="inferred">Inferred</option>
              <option value="confirmed">Confirmed</option>
              <option value="unconfirmed">Unconfirmed</option>
              <option value="conflict">Conflict</option>
            </select>
          </Field>
        </div>
        <Field label="Aliases">
          <input
            className="w-full border border-abi-line bg-abi-black px-3 py-2 text-xs text-abi-text outline-none"
            value={draft.aliases}
            onChange={(event) => onDraftChange({ ...draft, aliases: event.target.value })}
            placeholder="쉼표로 구분"
          />
        </Field>
        <Field label="Notes">
          <textarea
            className="min-h-20 w-full resize-none border border-abi-line bg-abi-black px-3 py-2 text-xs text-abi-text outline-none"
            value={draft.notes}
            onChange={(event) => onDraftChange({ ...draft, notes: event.target.value })}
          />
        </Field>

        {mapping && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Detail label="Builtin" value={mapping.builtinName} />
            <Detail label="Namespace" value={mapping.namespace} />
            <Detail label="Raw ID" value={mapping.rawId} />
            <Detail label="Source" value={mapping.source} />
            <Detail label="Confidence" value={mapping.confidence} />
            <Detail label="Internal" value={mapping.canonicalInternalName ?? mapping.internalName} />
            <Detail label="Occurrences" value={formatNumber(mapping.occurrenceCount)} />
            <Detail label="Source Logs" value={formatNumber(mapping.sourceFileIds.length)} />
            <Detail label="Last Seen" value={formatOptionalDate(mapping.lastSeenAt)} />
            <Detail label="Evidence" value={formatNumber(mapping.evidence.length)} />
            <Detail label="Kills" value={formatNumber(usage.kills)} />
            <Detail label="Deaths" value={formatNumber(usage.deaths)} />
            <Detail label="Incoming" value={formatNumber(usage.incoming)} />
            <Detail label="Maps" value={formatNumber(usage.maps)} />
          </div>
        )}

        {mapping && getNameCandidates(mapping).length > 0 ? (
          <div className="border border-abi-line bg-abi-black p-3 text-xs">
            <p className="text-[11px] uppercase text-abi-muted">Name Candidates</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {getNameCandidates(mapping).map((candidate) => (
                <button
                  key={candidate.name}
                  className="border border-abi-line px-2 py-1 text-abi-text hover:border-abi-olive"
                  onClick={() => onDraftChange({ ...draft, name: candidate.name, status: "confirmed" })}
                >
                  {candidate.name} ({formatNumber(candidate.occurrences)} / {formatNumber(candidate.sourceFileIds.length)} logs)
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {mapping && getBlueprintCandidates(mapping).length > 0 ? (
          <div className="border border-abi-line bg-abi-black p-3 text-xs">
            <p className="text-[11px] uppercase text-abi-muted">Blueprint Candidates</p>
            <div className="mt-2 space-y-1">
              {getBlueprintCandidates(mapping).map((candidate) => (
                <div key={candidate.name} className="flex items-center justify-between gap-3 border border-abi-line px-2 py-1">
                  <span className="truncate font-mono text-abi-text">{candidate.name}</span>
                  <span className="shrink-0 font-mono text-abi-muted">
                    {formatNumber(candidate.occurrences)} / {formatNumber(candidate.sourceFileIds.length)} logs
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {mapping?.evidence.length ? (
          <div className="border border-abi-line bg-abi-black p-3 text-xs">
            <p className="text-[11px] uppercase text-abi-muted">Evidence</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {summarizeEvidence(mapping).map((item) => (
                <div key={`${item.type}:${item.value ?? ""}`} className="border border-abi-line px-2 py-1">
                  <p className="truncate text-abi-muted">{item.type}</p>
                  <p className="mt-1 truncate font-mono text-abi-text">{formatNumber(item.occurrences)}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex gap-2">
          <button className="secondary-button flex-1 justify-center border-abi-olive text-abi-lime" disabled={isSaving} onClick={onSave}>
            <Save size={16} aria-hidden="true" />
            매핑 저장
          </button>
          {!isNew && (
            <button className="secondary-button justify-center border-abi-amber text-abi-amber" onClick={onResetOrDelete}>
              {mapping?.builtinName || (mapping?.occurrenceCount ?? 0) > 0 ? (
                <RotateCcw size={16} aria-hidden="true" />
              ) : (
                <Trash2 size={16} aria-hidden="true" />
              )}
              {mapping?.builtinName || (mapping?.occurrenceCount ?? 0) > 0 ? "복원" : "삭제"}
            </button>
          )}
        </div>
      </div>
    </SectionPanel>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs">
      <span className="mb-1 block text-[11px] uppercase text-abi-muted">{label}</span>
      {children}
    </label>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0 border border-abi-line bg-abi-black px-3 py-2">
      <p className="truncate text-[11px] uppercase text-abi-muted">{label}</p>
      <p className="mt-1 truncate font-mono text-abi-text">{displayValue(value)}</p>
    </div>
  );
}

function MappingStatusBadge({ status }: { status: MappingStatus }) {
  if (status === "confirmed") {
    return <StatusBadge tone="green">{mappingStatusLabels[status]}</StatusBadge>;
  }

  if (status === "conflict") {
    return <StatusBadge tone="red">{mappingStatusLabels[status]}</StatusBadge>;
  }

  if (status === "typed") {
    return <StatusBadge tone="muted">{mappingStatusLabels[status]}</StatusBadge>;
  }

  return <StatusBadge tone="amber">{mappingStatusLabels[status]}</StatusBadge>;
}

function createDraftFromMapping(mapping: MappingRecord): MappingDraft {
  return {
    namespace: mapping.namespace,
    rawId: mapping.rawId,
    category: mapping.category,
    name: getDisplayName(mapping) ?? "",
    status: mapping.status,
    aliases: mapping.aliases.join(", "),
    notes: mapping.notes ?? "",
  };
}

function getDisplayName(mapping: MappingRecord): string | null {
  return getConfirmedDisplayName(mapping) ?? mapping.displayName ?? mapping.name ?? mapping.userName ?? mapping.builtinName ?? null;
}

function getNameCandidates(mapping: MappingRecord) {
  return mapping.candidateNames.filter((candidate) => candidate.source !== "blueprint");
}

function getBlueprintCandidates(mapping: MappingRecord) {
  return mapping.candidateNames.filter((candidate) => candidate.source === "blueprint" && !isIgnoredMappingBlueprint(candidate.name));
}

function summarizeEvidence(mapping: MappingRecord): Array<{ type: string; value: string | null; occurrences: number }> {
  const byType = new Map<string, { type: string; value: string | null; occurrences: number }>();

  mapping.evidence.forEach((evidence) => {
    const key = `${evidence.type}:${evidence.value ?? ""}`;
    const current = byType.get(key);

    if (!current) {
      byType.set(key, { type: evidence.type, value: evidence.value, occurrences: evidence.occurrences });
      return;
    }

    current.occurrences += evidence.occurrences;
  });

  return Array.from(byType.values())
    .sort((left, right) => right.occurrences - left.occurrences)
    .slice(0, 8);
}

function compareMappings(left: MappingRecord, right: MappingRecord, sortKey: SortKey): number {
  if (sortKey === "occurrenceCount") {
    return right.occurrenceCount - left.occurrenceCount || compareMappings(left, right, "rawId");
  }

  if (sortKey === "lastSeenAt") {
    return dateValue(right.lastSeenAt) - dateValue(left.lastSeenAt) || compareMappings(left, right, "rawId");
  }

  const leftValue = sortKey === "name" ? getDisplayName(left) ?? "" : String(left[sortKey] ?? "");
  const rightValue = sortKey === "name" ? getDisplayName(right) ?? "" : String(right[sortKey] ?? "");

  return leftValue.localeCompare(rightValue, undefined, { numeric: true });
}

function calculateMappingUsage(raids: readonly StoredRaid[]): Map<string, MappingUsageStats> {
  const usage = new Map<string, MappingUsageStats>();

  raids.forEach((raid) => {
    incrementUsage(usage, "map", raid.basic.mapId, "maps");
    raid.kills.forEach((kill) => {
      incrementUsage(usage, "item", kill.weaponId, "kills");
      incrementUsage(usage, "item", kill.armorId, "kills");
      incrementUsage(usage, "gameplay_tag", kill.hitBodyPartId, "kills");
    });
    raid.incomingDamage.forEach((event) => {
      incrementUsage(usage, "item", event.deathCauserId, "incoming");
      incrementUsage(usage, "item", event.armorId, "incoming");
    });
    if (raid.death) {
      incrementUsage(usage, "item", raid.death.weaponId, "deaths");
      incrementUsage(usage, "item", raid.death.deathCauserId ?? raid.death.ammoId, "deaths");
      incrementUsage(usage, "item", raid.death.armorId, "deaths");
      incrementUsage(usage, "gameplay_tag", raid.death.hitBodyPartId, "deaths");
    }
  });

  return usage;
}

function incrementUsage(
  usage: Map<string, MappingUsageStats>,
  namespace: MappingNamespace,
  id: string | number | null | undefined,
  key: keyof MappingUsageStats,
): void {
  if (id === null || id === undefined || id === "" || String(id) === "0") {
    return;
  }

  const idText = createMappingKey(namespace, id, namespace === "gameplay_tag") ?? `${namespace}:${String(id)}`;
  const current = usage.get(idText) ?? createEmptyUsage();
  current[key] += 1;
  usage.set(idText, current);
}

function createEmptyUsage(): MappingUsageStats {
  return {
    kills: 0,
    deaths: 0,
    incoming: 0,
    maps: 0,
  };
}

function formatOptionalDate(value: string | null): string {
  return value ? formatDateTime(value) : emptyValue;
}

function dateValue(value: string | null): number {
  return value ? new Date(value).getTime() : 0;
}

function isMappingStatus(value: string | null): value is MappingStatus {
  return value === "unresolved" || value === "typed" || value === "inferred" || value === "confirmed" || value === "unconfirmed" || value === "conflict";
}
