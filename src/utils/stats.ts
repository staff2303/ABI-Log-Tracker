import { formatMapDisplayName } from "../data/displayNameResolver";
import type { Raid, RaidResult, SquadType } from "../types/raid";
import { formatDateInputValue } from "./format";

export interface RaidFilters {
  date: string;
  map: string;
  mode: string;
  zone: string;
  result: "all" | RaidResult;
  squad: "all" | SquadType;
}

export interface DashboardStats {
  totalRaids: number;
  extracted: number;
  deaths: number;
  extractionRate: number;
  pmcKills: number;
  aiKills: number;
  kd: number;
  totalDamage: number;
  averageDamage: number;
  averageAccuracy: number;
  totalPlayTime: number;
  averageSurvivalTime: number;
  totalLootValue: number;
  averageLootValue: number;
}

export const defaultFilters: RaidFilters = {
  date: "",
  map: "all",
  mode: "all",
  zone: "all",
  result: "all",
  squad: "all",
};

export function filterRaids(
  raids: Raid[],
  filters: RaidFilters,
  resolveMapName: (raid: Raid) => string | null = (raid) => formatMapDisplayName(raid.basic.mapId, raid.basic.map),
): Raid[] {
  return raids.filter((raid) => {
    const raidDate = formatDateInputValue(raid.basic.dateTime);
    const raidMap = resolveMapName(raid);

    return (
      (filters.date === "" || raidDate === filters.date) &&
      (filters.map === "all" || raidMap === filters.map) &&
      (filters.mode === "all" || raid.basic.mode === filters.mode) &&
      (filters.zone === "all" || raid.basic.zone === filters.zone) &&
      (filters.result === "all" || raid.basic.result === filters.result) &&
      (filters.squad === "all" || raid.basic.squad === filters.squad)
    );
  });
}

export function calculateDashboardStats(raids: Raid[]): DashboardStats {
  const totalRaids = raids.length;
  const extracted = raids.filter((raid) => raid.basic.result === "extracted").length;
  const deaths = raids.filter((raid) => raid.basic.result === "dead").length;
  const pmcKills = raids.reduce((sum, raid) => sum + (raid.combat.pmcKills ?? 0), 0);
  const aiKills = raids.reduce((sum, raid) => sum + (raid.combat.aiKills ?? 0), 0);
  const totalDamage = raids.reduce((sum, raid) => sum + (raid.combat.damage ?? 0), 0);
  const totalHits = raids.reduce((sum, raid) => sum + (raid.combat.hits ?? 0), 0);
  const totalShots = raids.reduce((sum, raid) => sum + (raid.combat.shots ?? 0), 0);
  const totalPlayTime = raids.reduce((sum, raid) => sum + (raid.basic.playTimeSeconds ?? 0), 0);
  const totalLootValue = raids.reduce((sum, raid) => sum + (raid.loot.extractedValue ?? 0), 0);

  return {
    totalRaids,
    extracted,
    deaths,
    extractionRate: totalRaids > 0 ? extracted / totalRaids : 0,
    pmcKills,
    aiKills,
    kd: deaths > 0 ? pmcKills / deaths : pmcKills,
    totalDamage,
    averageDamage: totalRaids > 0 ? totalDamage / totalRaids : 0,
    averageAccuracy: totalShots > 0 ? totalHits / totalShots : 0,
    totalPlayTime,
    averageSurvivalTime: totalRaids > 0 ? totalPlayTime / totalRaids : 0,
    totalLootValue,
    averageLootValue: totalRaids > 0 ? totalLootValue / totalRaids : 0,
  };
}

export function getUniqueOptions(raids: Raid[], selector: (raid: Raid) => string | null): string[] {
  return Array.from(new Set(raids.map(selector).filter((value): value is string => Boolean(value)))).sort(
    (a, b) => a.localeCompare(b),
  );
}
