import type { RankDetail } from "../../types/raid";

export const POINTS_PER_RANK_LEVEL = 100;

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

  const previousProgress = previousRankLevel * POINTS_PER_RANK_LEVEL + previousScore;
  const nextProgress = nextRankLevel * POINTS_PER_RANK_LEVEL + nextScore;

  return {
    sourceRecordIndex,
    rank: {
      previousRank: `RankLevel ${previousRankLevel}`,
      nextRank: `RankLevel ${nextRankLevel}`,
      previousRankLevel,
      nextRankLevel,
      previousScore,
      nextScore,
      rawScoreDelta: nextScore - previousScore,
      delta: nextProgress - previousProgress,
      pointsPerRankLevel: POINTS_PER_RANK_LEVEL,
    },
  };
}
