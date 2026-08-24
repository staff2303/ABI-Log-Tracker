import type { ParserDebugInfo } from "../../types/parser";
import type { StreamingDecoderStats } from "../../types/streamDecoder";
import { emptyValue, formatNumber } from "../../utils/format";
import { SectionPanel } from "../layout/SectionPanel";
import { StatusBadge } from "../layout/StatusBadge";

interface ParserDebugPanelProps {
  debugInfo: ParserDebugInfo | null;
  decoderStats: StreamingDecoderStats | null;
}

export function ParserDebugPanel({ debugInfo, decoderStats }: ParserDebugPanelProps) {
  if (!debugInfo) {
    return (
      <SectionPanel title="Parser Debug" eyebrow="debug=1">
        <div className="border border-abi-line bg-abi-black px-3 py-2 text-sm text-abi-muted">
          아직 분석된 로그가 없습니다.
        </div>
      </SectionPanel>
    );
  }

  return (
    <SectionPanel
      title="Parser Debug"
      eyebrow="debug=1"
      action={<StatusBadge tone={debugInfo.warnings.length > 0 ? "amber" : "green"}>{debugInfo.warnings.length} warnings</StatusBadge>}
    >
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <DebugStat label="Raid" value={debugInfo.detectedRaidCount} />
        <DebugStat label="01 03" value={decoderStats?.mode03Records ?? 0} />
        <DebugStat label="01 04" value={decoderStats?.mode04Records ?? 0} />
        <DebugStat label="01 07 Header" value={decoderStats?.headerRecords ?? 0} />
        <DebugStat label="Unknown" value={decoderStats?.unknownRecords ?? debugInfo.unknownRecordCount} />
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <DebugStat label="Completed" value={debugInfo.completedRaidCount} />
        <DebugStat label="Partial" value={debugInfo.partialRaidCount} />
        <DebugStat label="Basic Complete" value={countStatus(debugInfo, "basic", "complete")} />
        <DebugStat label="Combat Complete" value={countStatus(debugInfo, "combat", "complete")} />
        <DebugStat label="Raw Kills" value={debugInfo.raidSummaries.reduce((sum, raid) => sum + raid.rawKillEvents, 0)} />
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <DebugStat label="Deduped Kills" value={debugInfo.raidSummaries.reduce((sum, raid) => sum + raid.kills, 0)} />
        <DebugStat label="Kills Removed" value={debugInfo.raidSummaries.reduce((sum, raid) => sum + raid.duplicateKillEventsRemoved, 0)} />
        <DebugStat label="Engagements Parsed" value={debugInfo.raidSummaries.reduce((sum, raid) => sum + raid.engagements, 0)} />
        <DebugStat label="Death Candidates" value={debugInfo.raidSummaries.reduce((sum, raid) => sum + raid.deathCandidateCount, 0)} />
        <DebugStat label="Death Parsed" value={debugInfo.raidSummaries.filter((raid) => raid.death !== "n/a").length} />
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <DebugStat label="Loot Complete" value={countStatus(debugInfo, "loot", "complete")} />
        <DebugStat label="Survival Complete" value={countStatus(debugInfo, "survival", "complete")} />
        <DebugStat label="Team Complete" value={countStatus(debugInfo, "team", "complete")} />
        <DebugStat label="Rank Complete" value={countStatus(debugInfo, "rank", "complete")} />
        <DebugStat label="Source ranges" value={debugInfo.sourceRanges.length} />
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <DebugStat label="EOF Finalized" value={debugInfo.raidSummaries.filter((raid) => raid.finalizedAtEOF).length} />
        <DebugStat label="Team Resolved" value={debugInfo.raidSummaries.filter((raid) => raid.teamMemberCount !== null).length} />
        <DebugStat label="Rank Parsed" value={debugInfo.raidSummaries.filter((raid) => raid.rankStatus === "parsed").length} />
        <DebugStat label="Parser Warnings" value={debugInfo.warnings.length} />
      </div>

      {debugInfo.raidSummaries.length > 0 && (
        <div className="thin-scrollbar mt-3 overflow-auto border border-abi-line bg-abi-black">
          <table className="min-w-[1700px] w-full border-collapse">
            <thead>
              <tr>
                <th className="table-head">Raid</th>
                <th className="table-head">Basic</th>
                <th className="table-head">Combat</th>
                <th className="table-head text-right">PMC S/P</th>
                <th className="table-head text-right">AI S/P</th>
                <th className="table-head text-right">Raw</th>
                <th className="table-head text-right">Removed</th>
                <th className="table-head text-right">Kills</th>
                <th className="table-head text-right">Engagements</th>
                <th className="table-head text-right">Death Cand.</th>
                <th className="table-head text-right">Selected</th>
                <th className="table-head">Death</th>
                <th className="table-head">Loot</th>
                <th className="table-head">Survival</th>
                <th className="table-head">Surv Fields</th>
                <th className="table-head">Team</th>
                <th className="table-head">Type</th>
                <th className="table-head text-right">Members</th>
                <th className="table-head">Rank</th>
                <th className="table-head text-right">Rank Δ</th>
                <th className="table-head text-right">Rank Src</th>
                <th className="table-head">Matched By</th>
                <th className="table-head">Team Source</th>
                <th className="table-head text-right">Warnings</th>
                <th className="table-head text-right">Range</th>
              </tr>
            </thead>
            <tbody>
              {debugInfo.raidSummaries.map((raid, index) => (
                <tr key={raid.raidId} className="bg-abi-panel">
                  <td className="table-cell font-mono">Raid {index + 1}</td>
                  <td className="table-cell"><SectionStatus value={raid.basic} /></td>
                  <td className="table-cell"><SectionStatus value={raid.combat} /></td>
                  <td className="table-cell text-right font-mono">
                    {formatNumber(raid.summaryPmcKills)} / {formatNumber(raid.parsedPmcKills)}
                  </td>
                  <td className="table-cell text-right font-mono">
                    {formatNumber(raid.summaryAiKills)} / {formatNumber(raid.parsedAiKills)}
                  </td>
                  <td className="table-cell text-right font-mono">{formatNumber(raid.rawKillEvents)}</td>
                  <td className="table-cell text-right font-mono">{formatNumber(raid.duplicateKillEventsRemoved)}</td>
                  <td className="table-cell text-right font-mono">{formatNumber(raid.kills)}</td>
                  <td className="table-cell text-right font-mono">{formatNumber(raid.engagements)}</td>
                  <td className="table-cell text-right font-mono">{formatNumber(raid.deathCandidateCount)}</td>
                  <td className="table-cell text-right font-mono">{formatNumber(raid.selectedDeathRecordIndex)}</td>
                  <td className="table-cell"><SectionStatus value={raid.death} /></td>
                  <td className="table-cell"><SectionStatus value={raid.loot} /></td>
                  <td className="table-cell"><SectionStatus value={raid.survival} /></td>
                  <td className="table-cell font-mono text-[11px] text-abi-muted">{formatSurvivalFields(raid.survivalFields)}</td>
                  <td className="table-cell"><SectionStatus value={raid.team} /></td>
                  <td className="table-cell font-mono">{raid.teamType}</td>
                  <td className="table-cell text-right font-mono">{formatNumber(raid.teamMemberCount)}</td>
                  <td className="table-cell"><SectionStatus value={raid.rank} /></td>
                  <td className="table-cell text-right font-mono">
                    {raid.rankScoreChange === null ? emptyValue : `${raid.rankScoreChange > 0 ? "+" : ""}${raid.rankScoreChange}`}
                  </td>
                  <td className="table-cell text-right font-mono">{formatNumber(raid.rankSourceRecordIndex)}</td>
                  <td className="table-cell max-w-48 truncate text-xs text-abi-muted">
                    {raid.deathResolutionMatchedBy.join(", ") || "-"}
                  </td>
                  <td className="table-cell max-w-56 truncate text-xs text-abi-muted">
                    {raid.teamResolution ?? emptyValue}
                  </td>
                  <td className="table-cell text-right font-mono">{formatNumber(raid.warningCount)}</td>
                  <td className="table-cell text-right font-mono">
                    {formatNumber(raid.startRecordIndex)}-{formatNumber(raid.endRecordIndex)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {debugInfo.warnings.length > 0 && (
        <div className="mt-3 space-y-2">
          {debugInfo.warnings.slice(0, 20).map((warning, index) => (
            <div key={`${warning.code}-${warning.sourceRecordIndex}-${index}`} className="border border-abi-line bg-abi-black px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone="amber">{warning.code}</StatusBadge>
                <span className="font-mono text-xs text-abi-muted">record {formatNumber(warning.sourceRecordIndex)}</span>
                {warning.raidId && <span className="truncate font-mono text-xs text-abi-muted">{warning.raidId}</span>}
              </div>
              <p className="mt-2 text-xs text-abi-text">{warning.message}</p>
            </div>
          ))}
        </div>
      )}

      {debugInfo.sourceRanges.length > 0 && (
        <div className="thin-scrollbar mt-3 max-h-48 overflow-auto border border-abi-line bg-abi-black">
          {debugInfo.sourceRanges.slice(0, 50).map((range) => (
            <div key={range.raidId} className="grid grid-cols-[minmax(0,1fr)_120px_120px] gap-2 border-b border-abi-line px-3 py-2 text-xs">
              <span className="truncate font-mono text-abi-text">{range.raidId}</span>
              <span className="text-right font-mono text-abi-muted">{formatNumber(range.startRecordIndex)}</span>
              <span className="text-right font-mono text-abi-muted">{formatNumber(range.endRecordIndex)}</span>
            </div>
          ))}
        </div>
      )}
    </SectionPanel>
  );
}

function DebugStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-abi-line bg-abi-black px-3 py-2">
      <p className="text-[11px] uppercase text-abi-muted">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold text-abi-lime">{formatNumber(value)}</p>
    </div>
  );
}

function SectionStatus({ value }: { value: "complete" | "partial" | "n/a" }) {
  if (value === "complete") {
    return <StatusBadge tone="green">Complete</StatusBadge>;
  }

  if (value === "partial") {
    return <StatusBadge tone="amber">Partial</StatusBadge>;
  }

  return <StatusBadge tone="muted">N/A</StatusBadge>;
}

function formatSurvivalFields(fields: ParserDebugInfo["raidSummaries"][number]["survivalFields"]): string {
  return [
    ["HP", fields.hpLoss],
    ["Heal", fields.healingDone],
    ["Frac", fields.fractures],
    ["Debuf", fields.debuffs],
    ["Food", fields.foodDrinksConsumed],
    ["Dist", fields.distanceMeters],
    ["Fall", fields.falls],
    ["Save", fields.teammatesRescued],
    ["Resc", fields.timesRescued],
    ["Sup", fields.supportActions],
  ]
    .map(([label, status]) => (status === "found" ? label : `${label}-`))
    .join(" ");
}

function countStatus(
  debugInfo: ParserDebugInfo,
  key: "basic" | "combat" | "death" | "loot" | "survival" | "team" | "rank",
  status: "complete" | "partial" | "n/a",
): number {
  return debugInfo.raidSummaries.filter((raid) => raid[key] === status).length;
}
