import type { RankDetail } from "../../types/raid";
import { emptyValue, formatNumber } from "../../utils/format";
import { StatusBadge } from "../layout/StatusBadge";
import { SectionPanel } from "../layout/SectionPanel";
import { InfoGrid } from "./InfoGrid";

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

  return (
    <SectionPanel title="랭크" eyebrow="Rank">
      <InfoGrid
        columns="two"
        items={[
          { label: "이전 랭크", value: rank.previousRank ?? emptyValue },
          { label: "이후 랭크", value: rank.nextRank ?? emptyValue, tone: "lime" },
          { label: "이전 점수", value: formatNumber(rank.previousScore) },
          { label: "이후 점수", value: formatNumber(rank.nextScore), tone: "lime" },
          {
            label: "변화량",
            value: rank.delta === null ? emptyValue : `${rank.delta > 0 ? "+" : ""}${rank.delta}`,
            tone: (rank.delta ?? 0) >= 0 ? "green" : "red",
          },
        ]}
      />
    </SectionPanel>
  );
}
