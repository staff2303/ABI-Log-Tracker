import type { LootDetail } from "../../types/raid";
import type { ResultMetric } from "./parseResultMetric";

export function createEmptyLoot(): LootDetail {
  return {
    extractedValue: null,
    itemsFound: null,
    weaponsFound: null,
    attachmentsFound: null,
    gearFound: null,
    containers: null,
    premiumContainers: null,
    xpFromLooting: null,
    xpFromUnlocking: null,
    extractionXp: null,
  };
}

export function applyLootMetric(metric: ResultMetric, loot: LootDetail): boolean {
  if (metric.value === null) {
    return false;
  }

  if (metric.label === "total_out_value") {
    loot.extractedValue = metric.value;
    return true;
  }

  if (metric.label === "Containers Searched") {
    loot.containers = metric.value;
    return true;
  }

  if (metric.label === "Premium Containers Searched") {
    loot.premiumContainers = metric.value;
    return true;
  }

  if (metric.label === "XP from looting") {
    loot.xpFromLooting = metric.value;
    return true;
  }

  if (metric.label === "XP from unlocking") {
    loot.xpFromUnlocking = metric.value;
    return true;
  }

  if (metric.label === "Extraction XP") {
    loot.extractionXp = metric.value;
    return true;
  }

  if (metric.label === "Loot Found") {
    loot.itemsFound = metric.value;
    return true;
  }

  if (metric.label === "Weapons Found") {
    loot.weaponsFound = metric.value;
    return true;
  }

  if (metric.label === "Attachments Found") {
    loot.attachmentsFound = metric.value;
    return true;
  }

  if (metric.label === "Equipment Found") {
    loot.gearFound = metric.value;
    return true;
  }

  return false;
}
