import { getWeaponName } from "../../data/weaponMap";
import type { ParserWarning, RaidDebugMetrics, RaidSourceRange, SurvivalFieldPresence } from "../../types/parser";
import type {
  DeathDetail,
  KillDetail,
  Raid,
  RaidBasic,
  RankDetail,
} from "../../types/raid";
import { applyCombatMetric, createEmptyCombat } from "./parseCombat";
import { applyDeathLine, createEmptyDeath, type ParsedReplayDeathInfo } from "./parseDeath";
import { parseMapInfo } from "./parseBasic";
import { parseKill } from "./parseKill";
import { applyLootMetric, createEmptyLoot } from "./parseLoot";
import { IncomingDamageCollector, linkIncomingDamageToDeath } from "./parseIncomingDamage";
import { parseRankLine, type ParsedRankInfo } from "./parseRank";
import { parseResultMetric } from "./parseResultMetric";
import {
  applySurvivalMetric,
  createEmptySurvival,
  createEmptySurvivalFieldPresence,
  getSurvivalFieldForMetric,
} from "./parseSurvival";
import { createTeamDetail, type TeamResolution } from "./parseTeam";
import { getLuaLineNumber, parseLogTimestamp } from "./parseUtils";

interface RaidBuilderOptions {
  roomId: string | null;
  basic: RaidBasic;
  killerName: string | null;
  killerIsAi: boolean | null;
  killerWeaponId: number | null;
  replayDeath: ParsedReplayDeathInfo | null;
  teamResolution: TeamResolution;
  startRecordIndex: number;
}

export interface RaidFinalizeResult {
  raid: Raid;
  warnings: ParserWarning[];
  sourceRange: RaidSourceRange;
  debug: RaidDebugMetrics;
}

interface DeathCandidate {
  detail: DeathDetail;
  firstRecordIndex: number;
  lastRecordIndex: number;
  logTimestamp: string | null;
}

interface ScoredDeathCandidate {
  candidate: DeathCandidate;
  score: number;
  matchedBy: string[];
}

interface RankResolution {
  rank: RankDetail | null;
  status: "parsed" | "n/a" | "unknown";
  sourceRecordIndex: number | null;
  resolvedFrom: string | null;
}

function createRaidId(roomId: string | null, dateTime: string): string {
  const stableRoom = roomId && roomId !== "0" ? roomId : "unknown-room";
  return `${stableRoom}-${dateTime}`.replace(/[^A-Za-z0-9_-]+/g, "-");
}

function createUnknownDeathIfNeeded(
  basic: RaidBasic,
  killerName: string | null,
  killerIsAi: boolean | null,
  killerWeaponId: number | null,
): DeathDetail | null {
  return basic.result === "dead" ? createEmptyDeath(killerName, killerIsAi, killerWeaponId) : null;
}

export class RaidBuilder {
  private readonly id: string;
  private readonly basic: RaidBasic;
  private readonly seedDeath: DeathDetail | null;
  private readonly replayDeath: ParsedReplayDeathInfo | null;
  private readonly teamResolution: TeamResolution;
  private readonly kills: KillDetail[] = [];
  private readonly incomingDamage = new IncomingDamageCollector();
  private readonly warnings: ParserWarning[] = [];
  private readonly startRecordIndex: number;
  private readonly deathCandidates: DeathCandidate[] = [];
  private endRecordIndex: number;
  private combat = createEmptyCombat();
  private loot = createEmptyLoot();
  private survival = createEmptySurvival();
  private survivalFields: SurvivalFieldPresence = createEmptySurvivalFieldPresence();
  private rankInfo: ParsedRankInfo | null = null;
  private death: DeathDetail | null = null;
  private resultMetricsApplied = false;
  private currentDeathCandidate: DeathCandidate | null = null;
  private rawKillEvents = 0;
  private duplicateKillEventsRemoved = 0;
  private selectedDeathRecordIndex: number | null = null;
  private deathResolutionMatchedBy: string[] = [];

  constructor(options: RaidBuilderOptions) {
    this.basic = options.basic;
    this.id = createRaidId(options.roomId, options.basic.dateTime);
    this.startRecordIndex = options.startRecordIndex;
    this.endRecordIndex = options.startRecordIndex;
    this.seedDeath = createUnknownDeathIfNeeded(
      options.basic,
      options.killerName,
      options.killerIsAi,
      options.killerWeaponId,
    );
    this.replayDeath = options.replayDeath;
    this.teamResolution = options.teamResolution;
  }

  get raidId(): string {
    return this.id;
  }

  consume(line: string, sourceRecordIndex: number): void {
    this.endRecordIndex = sourceRecordIndex;
    this.applyMapInfoLine(line);

    const kill = parseKill(line, sourceRecordIndex);
    if (kill) {
      this.rawKillEvents += 1;

      if (this.isDuplicateKill(kill)) {
        this.duplicateKillEventsRemoved += 1;
        return;
      }

      this.kills.push(kill);
      return;
    }

    if (this.applyDeathCandidateLine(line, sourceRecordIndex)) {
      return;
    }

    this.applyRankLine(line, sourceRecordIndex);
    this.incomingDamage.consume(line, sourceRecordIndex);
    this.applyResultMetricLine(line);
  }

  finalize(finalizedAtEOF: boolean, sourceRecordIndex: number): RaidFinalizeResult {
    this.endRecordIndex = Math.max(this.endRecordIndex, sourceRecordIndex);
    this.incomingDamage.finalize();
    this.deriveCombatFromEvents();
    this.death = this.resolveDeath(sourceRecordIndex);
    const incomingDamage = linkIncomingDamageToDeath(this.incomingDamage.getEvents(), this.death?.killerNickname ?? null);
    const rankResolution = this.resolveRank();

    const finalizedAsPartial = finalizedAtEOF && !this.hasCompletionEvidence();
    this.validate(finalizedAsPartial, sourceRecordIndex);

    const raid: Raid = {
      id: this.id,
      basic: this.basic,
      combat: this.combat,
      kills: this.kills,
      incomingDamage,
      death: this.basic.result === "dead" ? this.death : null,
      loot: this.loot,
      survival: this.survival,
      team: createTeamDetail(this.basic, this.survival, this.teamResolution),
      rank: rankResolution.rank,
    };

    return {
      raid,
      warnings: [...this.warnings],
      sourceRange: {
        raidId: this.id,
        startRecordIndex: this.startRecordIndex,
        endRecordIndex: this.endRecordIndex,
      },
      debug: {
        rawKillEvents: this.rawKillEvents,
        duplicateKillEventsRemoved: this.duplicateKillEventsRemoved,
        deathCandidateCount: this.deathCandidates.length,
        selectedDeathRecordIndex: this.selectedDeathRecordIndex,
        deathResolutionMatchedBy: [...this.deathResolutionMatchedBy],
        rawIncomingDamageEvents: this.incomingDamage.getRawEventCount(),
        duplicateIncomingDamageEventsRemoved: this.incomingDamage.getDuplicateRemovedCount(),
        fatalIncomingDamageEvents: incomingDamage.filter((event) => event.isFatalAttacker).length,
        unavailableKillMetricEvents: this.kills.filter((kill) => kill.combatMetricsUnavailableReason !== null).length,
        finalizedAtEOF,
        finalizedAsPartial,
        survivalFields: { ...this.survivalFields },
        teamType: this.teamResolution.type,
        teamMemberCount: this.teamResolution.memberCount,
        teamResolution: this.teamResolution.resolution,
        rankStatus: rankResolution.status,
        rankSourceRecordIndex: rankResolution.sourceRecordIndex,
        rankResolvedFrom: rankResolution.resolvedFrom,
        rankScoreChange: rankResolution.rank?.delta ?? null,
        killRankedScoreSum: this.kills.reduce((sum, kill) => sum + (kill.rankScoreGained ?? 0), 0),
      },
    };
  }

  private applyMapInfoLine(line: string): void {
    const mapInfo = parseMapInfo(line);

    if (!mapInfo || mapInfo.mapUnlockId !== this.basic.mapUnlockId) {
      return;
    }

    this.basic.mapName ??= mapInfo.mapName;
    this.basic.map ??= mapInfo.mapName;
    this.basic.mode ??= mapInfo.modeName;
    this.basic.zone ??= mapInfo.zone;
  }

  private applyResultMetricLine(line: string): void {
    const metric = parseResultMetric(line);

    if (!metric) {
      return;
    }

    const combatApplied = applyCombatMetric(metric, this.combat);
    const lootApplied = applyLootMetric(metric, this.loot);
    const survivalApplied = applySurvivalMetric(metric, this.survival);
    const survivalField = getSurvivalFieldForMetric(metric.label);

    if (survivalApplied && survivalField) {
      this.survivalFields[survivalField] = "found";
    }

    this.resultMetricsApplied ||= combatApplied || lootApplied || survivalApplied;
  }

  private applyRankLine(line: string, sourceRecordIndex: number): void {
    const rankInfo = parseRankLine(line, sourceRecordIndex);

    if (!rankInfo) {
      return;
    }

    this.rankInfo = rankInfo;
  }

  private resolveRank(): RankResolution {
    if (this.basic.mode === "Covert Ops") {
      return {
        rank: null,
        status: "n/a",
        sourceRecordIndex: this.rankInfo?.sourceRecordIndex ?? null,
        resolvedFrom: "Covert Ops result does not apply raid rank",
      };
    }

    if (this.rankInfo) {
      return {
        rank: this.rankInfo.rank,
        status: "parsed",
        sourceRecordIndex: this.rankInfo.sourceRecordIndex,
        resolvedFrom: "BattleResultDataUtil.AnalyzethRankInfoData",
      };
    }

    return {
      rank: null,
      status: "unknown",
      sourceRecordIndex: null,
      resolvedFrom: "No raid-result rank line found",
    };
  }

  private applyDeathCandidateLine(line: string, sourceRecordIndex: number): boolean {
    if (!line.includes("Parse BeKilledEvents")) {
      return false;
    }

    const luaLine = getLuaLineNumber(line, "BeKilledEventObject.lua");

    if (luaLine === 47 || !this.currentDeathCandidate) {
      this.currentDeathCandidate = {
        detail: createEmptyDeath(null, null, null),
        firstRecordIndex: sourceRecordIndex,
        lastRecordIndex: sourceRecordIndex,
        logTimestamp: parseLogTimestamp(line),
      };
      this.deathCandidates.push(this.currentDeathCandidate);
    }

    this.currentDeathCandidate.lastRecordIndex = sourceRecordIndex;
    this.currentDeathCandidate.detail =
      applyDeathLine(this.currentDeathCandidate.detail, line) ?? this.currentDeathCandidate.detail;

    return true;
  }

  private isDuplicateKill(nextKill: KillDetail): boolean {
    return this.kills.some((existingKill) => isDuplicateKillEvent(existingKill, nextKill));
  }

  private deriveCombatFromEvents(): void {
    const playerKills = this.kills.filter((kill) => kill.opponentType === "player").length;
    const aiKills = this.kills.filter((kill) => kill.opponentType === "ai").length;
    const eventDamage = this.kills.reduce((sum, kill) => sum + (kill.damage ?? 0), 0);
    const eventArmorDamage = this.kills.reduce((sum, kill) => sum + (kill.armorDamage ?? 0), 0);
    const eventHits = this.kills.reduce((sum, kill) => sum + (kill.hitCount ?? 0), 0);

    this.combat.pmcKills ??= playerKills;
    this.combat.aiKills ??= aiKills;
    this.combat.damage ??= eventDamage || null;
    this.combat.armorDamage ??= eventArmorDamage || null;
    this.combat.hits ??= eventHits || null;
    this.combat.killStreak ??= this.kills.length > 0 ? this.kills.length : null;
  }

  private resolveDeath(sourceRecordIndex: number): DeathDetail | null {
    if (this.basic.result !== "dead") {
      return null;
    }

    if (this.deathCandidates.length === 0) {
      const fallback = this.mergeFinalDeath(null);

      if (!fallback?.killerNickname) {
        this.warnings.push({
          code: "death_resolution_failed",
          message: "No BeKilledEvent candidate or replay death information could identify the final death.",
          raidId: this.id,
          sourceRecordIndex,
        });
      }

      this.deathResolutionMatchedBy = fallback ? ["resultOrReplay"] : [];
      return fallback;
    }

    const scored = this.deathCandidates
      .map((candidate) => this.scoreDeathCandidate(candidate))
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return distanceToRaidEnd(left.candidate.logTimestamp, this.basic.endedAt) - distanceToRaidEnd(right.candidate.logTimestamp, this.basic.endedAt);
      });

    const selected = scored[0] ?? null;
    const second = scored[1] ?? null;

    if (!selected) {
      this.warnings.push({
        code: "death_resolution_failed",
        message: "Death candidates existed but no candidate could be selected.",
        raidId: this.id,
        sourceRecordIndex,
      });
      return this.mergeFinalDeath(null);
    }

    if (second && selected.score === second.score && !isSameDeathCandidate(selected.candidate, second.candidate)) {
      this.warnings.push({
        code: "death_resolution_tie",
        message: "Two death candidates had the same confidence score.",
        raidId: this.id,
        sourceRecordIndex,
      });
    }

    this.selectedDeathRecordIndex = selected.candidate.firstRecordIndex;
    this.deathResolutionMatchedBy = selected.matchedBy;
    this.recordSelectedDeathConflicts(selected.candidate, sourceRecordIndex);

    return this.mergeFinalDeath(selected.candidate.detail);
  }

  private scoreDeathCandidate(candidate: DeathCandidate): ScoredDeathCandidate {
    const matchedBy: string[] = [];
    let score = 0;

    if (this.replayDeath?.killerNickname && candidate.detail.killerNickname === this.replayDeath.killerNickname) {
      score += 30;
      matchedBy.push("replayKiller");
    }

    if (this.replayDeath?.weaponId !== null && this.replayDeath?.weaponId !== undefined && candidate.detail.weaponId === this.replayDeath.weaponId) {
      score += 25;
      matchedBy.push("replayWeapon");
    }

    if (this.seedDeath?.killerNickname && candidate.detail.killerNickname === this.seedDeath.killerNickname) {
      score += 20;
      matchedBy.push("resultKiller");
    }

    if (this.seedDeath?.weaponId !== null && this.seedDeath?.weaponId !== undefined && candidate.detail.weaponId === this.seedDeath.weaponId) {
      score += 15;
      matchedBy.push("resultWeapon");
    }

    const raidEndDistance = distanceToRaidEnd(candidate.logTimestamp, this.basic.endedAt);

    if (raidEndDistance <= 30_000) {
      score += 10;
      matchedBy.push("raidEndTime");
    } else if (raidEndDistance <= 120_000) {
      score += 5;
      matchedBy.push("nearRaidEndTime");
    }

    if (candidate.detail.finalDamage !== null) {
      score += 2;
      matchedBy.push("finalDamage");
    }

    if (candidate.detail.hitBodyPartId !== null) {
      score += 1;
      matchedBy.push("bodyPart");
    }

    if (this.replayDeath?.victimName) {
      matchedBy.push("replayVictim");
    } else {
      matchedBy.push("victimUnknown");
    }

    return { candidate, score, matchedBy };
  }

  private mergeFinalDeath(candidate: DeathDetail | null): DeathDetail | null {
    const base = cloneDeath(candidate ?? this.seedDeath ?? createEmptyDeath(null, null, null));

    if (this.seedDeath) {
      mergeMissingDeathFields(base, this.seedDeath);
    }

    if (this.replayDeath) {
      base.victimName = this.replayDeath.victimName ?? base.victimName;
      base.killerNickname = this.replayDeath.killerNickname ?? base.killerNickname;
      base.playerPosition = this.replayDeath.playerPosition ?? base.playerPosition;
      base.killerPosition = this.replayDeath.killerPosition ?? base.killerPosition;
      base.deathServerTime = this.replayDeath.deathServerTime ?? base.deathServerTime;
      base.replayDemoStartTime = this.replayDeath.replayDemoStartTime ?? base.replayDemoStartTime;
      base.replayDemoEndTime = this.replayDeath.replayDemoEndTime ?? base.replayDemoEndTime;

      if (this.replayDeath.weaponId !== null && this.replayDeath.weaponId !== 0) {
        base.weaponId = this.replayDeath.weaponId;
        base.weaponName = getWeaponName(this.replayDeath.weaponId);
        base.weapon = base.weaponName ?? `weaponId ${this.replayDeath.weaponId}`;
      }
    }

    return base;
  }

  private recordSelectedDeathConflicts(candidate: DeathCandidate, sourceRecordIndex: number): void {
    if (
      this.replayDeath?.killerNickname &&
      candidate.detail.killerNickname &&
      candidate.detail.killerNickname !== this.replayDeath.killerNickname
    ) {
      this.warnings.push({
        code: "killer_name_mismatch",
        message: `Selected death killer ${candidate.detail.killerNickname} differs from replay killer ${this.replayDeath.killerNickname}.`,
        raidId: this.id,
        sourceRecordIndex,
      });
    }

    if (
      this.replayDeath?.weaponId !== null &&
      this.replayDeath?.weaponId !== undefined &&
      candidate.detail.weaponId !== null &&
      candidate.detail.weaponId !== this.replayDeath.weaponId
    ) {
      this.warnings.push({
        code: "weapon_id_mismatch",
        message: `Selected death weaponId ${candidate.detail.weaponId} differs from replay weaponId ${this.replayDeath.weaponId}.`,
        raidId: this.id,
        sourceRecordIndex,
      });
    }

    if (!this.replayDeath?.victimName) {
      this.warnings.push({
        code: "victim_unidentified",
        message: "Replay death did not include a victim name.",
        raidId: this.id,
        sourceRecordIndex,
      });
    }
  }

  private hasCompletionEvidence(): boolean {
    return this.resultMetricsApplied && this.basic.result !== null;
  }

  private validate(partial: boolean, sourceRecordIndex: number): void {
    const eventPlayerKills = this.kills.filter((kill) => kill.opponentType === "player").length;
    const eventAiKills = this.kills.filter((kill) => kill.opponentType === "ai").length;

    if (this.combat.pmcKills !== null && this.combat.pmcKills !== eventPlayerKills) {
      this.warnings.push({
        code: "kill_count_mismatch",
        message: `PMC kill summary ${this.combat.pmcKills} differs from deduped KillEnemyEvent player count ${eventPlayerKills}.`,
        raidId: this.id,
        sourceRecordIndex,
      });
    }

    if (this.combat.aiKills !== null && this.combat.aiKills !== eventAiKills) {
      this.warnings.push({
        code: "kill_count_mismatch",
        message: `AI kill summary ${this.combat.aiKills} differs from deduped KillEnemyEvent AI count ${eventAiKills}.`,
        raidId: this.id,
        sourceRecordIndex,
      });
    }

    if (new Date(this.basic.endedAt).getTime() < new Date(this.basic.startedAt).getTime()) {
      this.warnings.push({
        code: "time_range_invalid",
        message: "Raid endedAt is earlier than startedAt.",
        raidId: this.id,
        sourceRecordIndex,
      });
    }

    if (!this.resultMetricsApplied) {
      this.warnings.push({
        code: "missing_summary",
        message: "No BattleResult metric lines were found inside this raid range.",
        raidId: this.id,
        sourceRecordIndex,
      });
    }

    if (partial) {
      this.warnings.push({
        code: "partial_raid_finalized",
        message: "Raid was finalized at end of stream without result summary evidence.",
        raidId: this.id,
        sourceRecordIndex,
      });
    }

    if (this.combat.shots !== null && this.combat.hits !== null && this.combat.accuracy !== null) {
      if (this.combat.hits > this.combat.shots) {
        this.warnings.push({
          code: "hits_exceed_shots",
          message: `Hits ${this.combat.hits} exceeds shots ${this.combat.shots}.`,
          raidId: this.id,
          sourceRecordIndex,
        });
      }

      const expected = this.combat.shots > 0 ? this.combat.hits / this.combat.shots : 0;

      if (Math.abs(expected - this.combat.accuracy) > 0.02) {
        this.warnings.push({
          code: "accuracy_mismatch",
          message: `Accuracy ${this.combat.accuracy} differs from hits/shots ${expected.toFixed(3)}.`,
          raidId: this.id,
          sourceRecordIndex,
        });
      }
    }

    for (const value of this.collectDamageValues()) {
      if (value.value !== null && value.value < 0) {
        this.warnings.push({
          code: "negative_damage",
          message: `${value.label} is negative: ${value.value}.`,
          raidId: this.id,
          sourceRecordIndex,
        });
      }
    }
  }

  private collectDamageValues(): Array<{ label: string; value: number | null }> {
    return [
      { label: "combat.damage", value: this.combat.damage },
      { label: "combat.armorDamage", value: this.combat.armorDamage },
      { label: "death.finalDamage", value: this.death?.finalDamage ?? null },
      ...this.kills.flatMap((kill, index) => [
        { label: `kills[${index}].damage`, value: kill.damage },
        { label: `kills[${index}].armorDamage`, value: kill.armorDamage },
      ]),
      ...this.incomingDamage.getEvents().flatMap((event, index) => [
        { label: `incomingDamage[${index}].damage`, value: event.damage },
        { label: `incomingDamage[${index}].armorAbsorbedDamage`, value: event.armorAbsorbedDamage },
      ]),
    ];
  }
}

function isDuplicateKillEvent(left: KillDetail, right: KillDetail): boolean {
  const leftIdentity = left.enemyGid ?? `name:${left.opponentNickname}`;
  const rightIdentity = right.enemyGid ?? `name:${right.opponentNickname}`;

  return (
    leftIdentity === rightIdentity &&
    withinTolerance(left.killTimestamp, right.killTimestamp, 1) &&
    nullableEqual(left.weaponId, right.weaponId) &&
    nullableEqual(left.hitBodyPartId, right.hitBodyPartId) &&
    nullableEqual(left.enemyIdentity, right.enemyIdentity) &&
    nullableEqual(left.damage, right.damage) &&
    nullableEqual(left.armorDamage, right.armorDamage) &&
    nullableEqual(left.opponentValue, right.opponentValue) &&
    nullableEqual(left.opponentGearValue, right.opponentGearValue) &&
    nullableEqual(left.deathType, right.deathType) &&
    nullableEqual(left.rankScoreGained, right.rankScoreGained)
  );
}

function nullableEqual(left: number | null, right: number | null): boolean {
  return left === right;
}

function withinTolerance(left: number | null, right: number | null, tolerance: number): boolean {
  if (left === null || right === null) {
    return left === right;
  }

  return Math.abs(left - right) <= tolerance;
}

function isSameDeathCandidate(left: DeathCandidate, right: DeathCandidate): boolean {
  return (
    left.detail.killerNickname === right.detail.killerNickname &&
    left.detail.weaponId === right.detail.weaponId &&
    left.detail.deathCauserId === right.detail.deathCauserId &&
    left.detail.finalDamage === right.detail.finalDamage &&
    left.detail.hitBodyPartId === right.detail.hitBodyPartId
  );
}

function distanceToRaidEnd(logTimestamp: string | null, endedAt: string): number {
  if (!logTimestamp) {
    return Number.POSITIVE_INFINITY;
  }

  const logTime = new Date(logTimestamp).getTime();
  const endTime = new Date(endedAt).getTime();

  if (Number.isNaN(logTime) || Number.isNaN(endTime)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.abs(logTime - endTime);
}

function cloneDeath(death: DeathDetail): DeathDetail {
  return {
    ...death,
    armorDurability: { ...death.armorDurability },
    playerPosition: death.playerPosition ? { ...death.playerPosition } : null,
    killerPosition: death.killerPosition ? { ...death.killerPosition } : null,
  };
}

function mergeMissingDeathFields(target: DeathDetail, fallback: DeathDetail): void {
  target.victimName ??= fallback.victimName;
  target.killerNickname ??= fallback.killerNickname;
  target.killerType ??= fallback.killerType;
  target.killerLevel ??= fallback.killerLevel;
  target.killerRank ??= fallback.killerRank;
  target.weaponId ??= fallback.weaponId;
  target.weaponName ??= fallback.weaponName;
  target.weapon ??= fallback.weapon;
  target.deathCauserId ??= fallback.deathCauserId;
  target.ammoId ??= fallback.ammoId;
  target.ammoName ??= fallback.ammoName;
  target.ammoOrCause ??= fallback.ammoOrCause;
  target.hitBodyPartId ??= fallback.hitBodyPartId;
  target.hitBodyPartName ??= fallback.hitBodyPartName;
  target.hitBodyPart ??= fallback.hitBodyPart;
  target.finalDamage ??= fallback.finalDamage;
  target.penetrated ??= fallback.penetrated;
  target.armorId ??= fallback.armorId;
  target.armorName ??= fallback.armorName;
  target.armor ??= fallback.armor;
  target.armorDurability.beforeHit ??= fallback.armorDurability.beforeHit;
  target.armorDurability.atHit ??= fallback.armorDurability.atHit;
  target.armorDurability.max ??= fallback.armorDurability.max;
  target.faceHit ??= fallback.faceHit;
  target.dbno ??= fallback.dbno;
  target.playerPosition ??= fallback.playerPosition;
  target.killerPosition ??= fallback.killerPosition;
  target.deathServerTime ??= fallback.deathServerTime;
  target.replayDemoStartTime ??= fallback.replayDemoStartTime;
  target.replayDemoEndTime ??= fallback.replayDemoEndTime;
}
