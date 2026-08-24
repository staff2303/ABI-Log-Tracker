import type { RankDetail } from "../../types/raid";

export interface ParsedRankInfo {
  rank: RankDetail;
  sourceRecordIndex: number;
}

export function parseRankLine(line: string, sourceRecordIndex: number): ParsedRankInfo | null {
  if (!line.includes("AnalyzethRankInfoData") || !line.includes("Score:") || !line.includes("RankLevel:")) {
    return null;
  }

  const match = line.match(
    /Score:\s*(-?\d+)\s+(-?\d+).*?RankLevel:\s*(-?\d+)\s+(-?\d+).*?Upgrade_score:\s*(-?\d+)\s+(-?\d+).*?rank:\s*(-?\d+)\s+(-?\d+)/,
  );

  if (!match) {
    return null;
  }

  const previousScore = Number(match[1]);
  const nextScore = Number(match[2]);
  const previousRankLevel = Number(match[3]);
  const nextRankLevel = Number(match[4]);

  if (
    !Number.isFinite(previousScore) ||
    !Number.isFinite(nextScore) ||
    !Number.isFinite(previousRankLevel) ||
    !Number.isFinite(nextRankLevel)
  ) {
    return null;
  }

  return {
    sourceRecordIndex,
    rank: {
      previousRank: `RankLevel ${previousRankLevel}`,
      nextRank: `RankLevel ${nextRankLevel}`,
      previousScore,
      nextScore,
      delta: nextScore - previousScore,
    },
  };
}

