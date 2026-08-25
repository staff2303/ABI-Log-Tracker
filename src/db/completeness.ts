import type { Raid } from "../types/raid";
import type { OptionalSectionCompleteness, RaidCompleteness, SectionCompleteness, TeamCompleteness } from "./types";

export function calculateRaidCompleteness(raid: Raid): RaidCompleteness {
  const deathDetail: OptionalSectionCompleteness =
    raid.basic.result === "extracted"
      ? "not-applicable"
      : raid.death
        ? sectionStatus([
            raid.death.killerNickname,
            raid.death.weaponId ?? raid.death.weapon,
            raid.death.deathCauserId ?? raid.death.ammoId ?? raid.death.ammoOrCause,
            raid.death.hitBodyPartId ?? raid.death.hitBodyPart,
            raid.death.finalDamage,
            raid.death.playerPosition,
            raid.death.killerPosition,
          ])
        : "missing";
  const rank: OptionalSectionCompleteness = raid.rank
    ? sectionStatus([
        raid.rank.previousRankLevel ?? raid.rank.previousRank,
        raid.rank.nextRankLevel ?? raid.rank.nextRank,
        raid.rank.previousScore,
        raid.rank.nextScore,
        raid.rank.delta,
      ])
    : raid.basic.mode === "Covert Ops"
      ? "not-applicable"
      : "missing";
  const team: TeamCompleteness = raid.team.type === "unknown" ? "unknown" : "resolved";
  const completeness: Omit<RaidCompleteness, "score"> = {
    basic: isComplete([raid.basic.startedAt, raid.basic.endedAt, raid.basic.result, raid.basic.playTimeSeconds]),
    combatSummary: isComplete([raid.combat.pmcKills, raid.combat.aiKills, raid.combat.damage, raid.combat.hits]),
    killDetails: raid.kills.length > 0 ? "complete" : "missing",
    incomingDamage: raid.incomingDamage.length > 0 ? "complete" : raid.basic.result === "dead" ? "partial" : "missing",
    deathDetail,
    loot: sectionStatus([raid.loot.extractedValue, raid.loot.containers, raid.loot.premiumContainers]),
    survival: sectionStatus([raid.survival.hpLoss, raid.survival.healingDone, raid.survival.distanceMeters]),
    team,
    rank,
  };

  return {
    ...completeness,
    score: scoreCompleteness(completeness),
  };
}

export function scoreCompleteness(completeness: Omit<RaidCompleteness, "score">): number {
  return (
    booleanScore(completeness.basic) * 12 +
    booleanScore(completeness.combatSummary) * 12 +
    sectionScore(completeness.killDetails) * 14 +
    sectionScore(completeness.incomingDamage) * 10 +
    optionalSectionScore(completeness.deathDetail) * 14 +
    sectionScore(completeness.loot) * 8 +
    sectionScore(completeness.survival) * 10 +
    (completeness.team === "resolved" ? 8 : 0) +
    optionalSectionScore(completeness.rank) * 8
  );
}

function sectionStatus(values: unknown[]): SectionCompleteness {
  const known = values.filter((value) => value !== null && value !== undefined && value !== "").length;

  if (known === 0) {
    return "missing";
  }

  return known === values.length ? "complete" : "partial";
}

function isComplete(values: unknown[]): boolean {
  return values.every((value) => value !== null && value !== undefined && value !== "");
}

function booleanScore(value: boolean): number {
  return value ? 1 : 0;
}

function sectionScore(value: SectionCompleteness): number {
  if (value === "complete") {
    return 1;
  }

  if (value === "partial") {
    return 0.5;
  }

  return 0;
}

function optionalSectionScore(value: OptionalSectionCompleteness): number {
  return value === "not-applicable" ? 1 : sectionScore(value);
}
