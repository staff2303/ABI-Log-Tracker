import type { KillDetail, OpponentType } from "../../types/raid";
import { getArmorName } from "../../data/armorMap";
import { getBodyPartName } from "../../data/bodyPartMap";
import { getWeaponName } from "../../data/weaponMap";
import { getNumberAfter, getTextBetween, secondsToClock } from "./parseUtils";

function normalizeOpponentType(enemyIdentity: number | null): OpponentType {
  if (enemyIdentity === 1) {
    return "player";
  }

  if (enemyIdentity === 2 || enemyIdentity === 3) {
    return "ai";
  }

  return "unknown";
}

function normalizeKillCombatMetrics(
  damage: number | null,
  armorDamage: number | null,
  hitCount: number | null,
): Pick<KillDetail, "damage" | "armorDamage" | "hitCount" | "combatMetricsUnavailableReason"> {
  if (damage === 0 && armorDamage === 0 && hitCount === 0) {
    return {
      damage: null,
      armorDamage: null,
      hitCount: null,
      combatMetricsUnavailableReason: "unreliable-zero-kill-metrics",
    };
  }

  return {
    damage,
    armorDamage,
    hitCount,
    combatMetricsUnavailableReason: null,
  };
}

export function parseKill(line: string, sourceRecordIndex: number | null = null): KillDetail | null {
  if (!line.includes("Parse KillEnemyEvent ")) {
    return null;
  }

  const enemyGid = getTextBetween(line, "gid:", ", name:");
  const opponentNickname = getTextBetween(line, "name:", ", timeStamp:") ?? "Unknown";
  const killTimestamp = getNumberAfter("timeStamp", line);
  const enemyIdentity = getNumberAfter("enemyIdentity", line);
  const opponentType = normalizeOpponentType(enemyIdentity);
  const weaponId = getNumberAfter("weaponId", line);
  const bodyPartId = getNumberAfter("hitBodyPartId", line);
  const liveTime = getNumberAfter("liveTime", line);
  const rankLevel = getNumberAfter("rankLevel", line);
  const armorId = getNumberAfter("armorId", line);
  const totalValue = getNumberAfter("totalValue", line);
  const totalEquipValue = getNumberAfter("totalEquipValue", line);
  const rawDamage = getNumberAfter("totalDamage", line);
  const rawArmorDamage = getNumberAfter("armorDamage", line);
  const rawHitCount = getNumberAfter("hitCount", line);
  const combatMetrics = normalizeKillCombatMetrics(rawDamage, rawArmorDamage, rawHitCount);
  const weaponName = getWeaponName(weaponId);
  const bodyPartName = getBodyPartName(bodyPartId);
  const armorName = getArmorName(armorId);

  return {
    sourceRecordIndex,
    time: secondsToClock(liveTime),
    killTimestamp,
    enemyGid,
    opponentNickname,
    opponentType,
    enemyIdentity,
    weaponId,
    weaponName,
    weapon: weaponName ?? (weaponId === null ? null : `weaponId ${weaponId}`),
    hitBodyPartId: bodyPartId,
    bodyPartName,
    bodyPart: bodyPartName ?? (bodyPartId === null ? null : `bodyPartId ${bodyPartId}`),
    opponentLevel: getNumberAfter("level", line),
    opponentRankLevel: rankLevel,
    opponentRank: rankLevel === null || rankLevel === 0 ? null : `rankLevel ${rankLevel}`,
    opponentRankScore: getNumberAfter("rankScore", line) ?? getNumberAfter("rankSorce", line),
    damage: combatMetrics.damage,
    armorDamage: combatMetrics.armorDamage,
    hitCount: combatMetrics.hitCount,
    rawDamage,
    rawArmorDamage,
    rawHitCount,
    combatMetricsUnavailableReason: combatMetrics.combatMetricsUnavailableReason,
    armorId,
    armorName,
    opponentArmor: armorName ?? (armorId === null ? null : `armorId ${armorId}`),
    opponentValue: totalValue,
    opponentGearValue: totalEquipValue,
    rankScoreGained: getNumberAfter("addRankedScore", line),
    deathType: getNumberAfter("deathType", line),
  };
}
