import type { SurvivalFieldPresence } from "../../types/parser";
import type { SurvivalDetail } from "../../types/raid";
import type { ResultMetric, ResultMetricLabel } from "./parseResultMetric";

const survivalMetricToField: Partial<Record<ResultMetricLabel, keyof SurvivalDetail>> = {
  "Total HP Lost": "hpLoss",
  "Total Healed": "healingDone",
  "Broken Limbs": "fractures",
  "Debuffs Removed": "debuffs",
  "Provisions Spent": "foodDrinksConsumed",
  "Kilometers Traveled": "distanceMeters",
  Falls: "falls",
  "Teammates Rescued": "teammatesRescued",
  "Times Rescued": "timesRescued",
  "No. of Support": "supportActions",
};

export function createEmptySurvival(): SurvivalDetail {
  return {
    hpLoss: null,
    healingDone: null,
    fractures: null,
    debuffs: null,
    foodDrinksConsumed: null,
    distanceMeters: null,
    falls: null,
    teammatesRescued: null,
    timesRescued: null,
    supportActions: null,
  };
}

export function createEmptySurvivalFieldPresence(): SurvivalFieldPresence {
  return {
    hpLoss: "missing",
    healingDone: "missing",
    fractures: "missing",
    debuffs: "missing",
    foodDrinksConsumed: "missing",
    distanceMeters: "missing",
    falls: "missing",
    teammatesRescued: "missing",
    timesRescued: "missing",
    supportActions: "missing",
  };
}

export function getSurvivalFieldForMetric(label: ResultMetricLabel): keyof SurvivalDetail | null {
  return survivalMetricToField[label] ?? null;
}

export function applySurvivalMetric(metric: ResultMetric, survival: SurvivalDetail): boolean {
  if (metric.value === null) {
    return false;
  }

  if (metric.label === "Total HP Lost") {
    survival.hpLoss = metric.value;
    return true;
  }

  if (metric.label === "Total Healed") {
    survival.healingDone = metric.value;
    return true;
  }

  if (metric.label === "Broken Limbs") {
    survival.fractures = metric.value;
    return true;
  }

  if (metric.label === "Debuffs Removed") {
    survival.debuffs = metric.value;
    return true;
  }

  if (metric.label === "Provisions Spent") {
    survival.foodDrinksConsumed = metric.value;
    return true;
  }

  if (metric.label === "Kilometers Traveled") {
    survival.distanceMeters = metric.value * 1000;
    return true;
  }

  if (metric.label === "Falls") {
    survival.falls = metric.value;
    return true;
  }

  if (metric.label === "Teammates Rescued") {
    survival.teammatesRescued = metric.value;
    return true;
  }

  if (metric.label === "Times Rescued") {
    survival.timesRescued = metric.value;
    return true;
  }

  if (metric.label === "No. of Support") {
    survival.supportActions = metric.value;
    return true;
  }

  return false;
}
