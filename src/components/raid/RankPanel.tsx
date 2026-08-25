import type { RankDetail } from "../../types/raid";
import { cn } from "../../utils/classNames";
import { emptyValue, formatNumber } from "../../utils/format";
import { StatusBadge } from "../layout/StatusBadge";
import { SectionPanel } from "../layout/SectionPanel";

interface RankPanelProps {
  rank: RankDetail | null;
}

export function RankPanel({ rank }: RankPanelProps) {
  if (!rank) {
    return (
      <SectionPanel title="랭크" eyebrow="Rank">
        <div className="flex items-center justify-between border border-abi-line bg-abi-black px-3 py-2">
          <span className="text-sm font-semibold text-abi-text">Rank 없음</span>
          <StatusBadge>Unranked</StatusBadge>
        </div>
      </SectionPanel>
    );
  }

  const rankLevelDelta =
    rank.previousRankLevel === null || rank.nextRankLevel === null ? null : rank.nextRankLevel - rank.previousRankLevel;
  const rankTone = rankLevelDelta === null || rankLevelDelta === 0 ? "text-abi-text" : rankLevelDelta > 0 ? "text-abi-green" : "text-abi-red";
  const deltaTone = rank.delta === null || rank.delta === 0 ? "text-abi-text" : rank.delta > 0 ? "text-abi-green" : "text-abi-red";

  return (
    <SectionPanel title="랭크" eyebrow="Rank">
      <div className="border border-abi-line bg-abi-black p-3">
        <p className="text-[11px] uppercase text-abi-muted">Rank</p>
        <div className={cn("mt-2 flex flex-wrap items-center gap-3 font-mono text-lg font-semibold", rankTone)}>
          <span>{rank.previousRank ?? emptyValue}</span>
          <span className="text-abi-muted">→</span>
          <span>{rank.nextRank ?? emptyValue}</span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-sm text-abi-text">
          <span>{formatNumber(rank.previousScore)}</span>
          <span className="text-abi-muted">→</span>
          <span>{formatNumber(rank.nextScore)}</span>
        </div>

        <div className="mt-4 border-t border-abi-line pt-3">
          <p className="text-[11px] uppercase text-abi-muted">이번 레이드</p>
          <p className={cn("mt-1 font-mono text-2xl font-semibold", deltaTone)}>{formatRankDelta(rank.delta)}</p>
          {rank.rawScoreDelta !== null && rank.rawScoreDelta !== rank.delta && (
            <p className="mt-1 font-mono text-[11px] text-abi-muted">
              raw score {formatSigned(rank.rawScoreDelta)} / level unit {formatNumber(rank.pointsPerRankLevel)}
            </p>
          )}
        </div>
      </div>
    </SectionPanel>
  );
}

function formatRankDelta(value: number | null): string {
  if (value === null) {
    return emptyValue;
  }

  return `${formatSigned(value)} RP`;
}

function formatSigned(value: number): string {
  return `${value > 0 ? "+" : ""}${formatNumber(value)}`;
}

