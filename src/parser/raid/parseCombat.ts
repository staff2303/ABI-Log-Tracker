import type { RaidCombat } from "../../types/raid";
import type { ResultMetric } from "./parseResultMetric";

export function createEmptyCombat(): RaidCombat {
  return {
    pmcKills: null,
    aiKills: null,
    damage: null,
    armorDamage: null,
    hits: null,
    shots: null,
    accuracy: null,
    killStreak: null,
  };
}

export function applyCombatMetric(metric: ResultMetric, combat: RaidCombat): boolean {
  if (metric.value === null) {
    return false;
  }

  if (metric.label === "Operators Eliminated") {
    combat.pmcKills = metric.value;
    return true;
  }

  if (metric.label === "Militants Eliminated") {
    combat.aiKills = metric.value;
    return true;
  }

  if (metric.label === "Body Damage") {
    combat.damage = metric.value;
    return true;
  }

  if (metric.label === "Armor Durability Damage") {
    combat.armorDamage = metric.value;
    return true;
  }

  if (metric.label === "Hits") {
    combat.hits = metric.value;
    return true;
  }

  if (metric.label === "Ammo Used") {
    combat.shots = metric.value;
    return true;
  }

  if (metric.label === "Overall Accuracy") {
    combat.accuracy = metric.percent ? metric.value / 100 : metric.value;
    return true;
  }

  if (metric.label === "Longest Kill Streak") {
    combat.killStreak = metric.value;
    return true;
  }

  return false;
}
