import type {
  ParserDebugInfo,
  RaidDebugMetrics,
  ParserSectionStatus,
  ParserWarning,
  RaidDebugSummary,
  RaidParseResult,
  RaidSourceRange,
} from "../../types/parser";
import type { Raid } from "../../types/raid";
import { getMapInfoKey, parseBasic, parseMapInfo, type ParsedMapInfo } from "./parseBasic";
import { parseReplayDeathInfo, type ParsedReplayDeathInfo } from "./parseDeath";
import {
  mergeTeamSnapshotEvent,
  parseTeamSnapshotEvent,
  resolveTeamForBasic,
  type TeamSnapshot,
} from "./parseTeam";
import { RaidBuilder } from "./RaidBuilder";

export interface ConsumeMeta {
  sourceRecordIndex: number;
}

export class RaidParser {
  private builder: RaidBuilder | null = null;
  private readonly raids: Raid[] = [];
  private readonly warnings: ParserWarning[] = [];
  private readonly sourceRanges: RaidSourceRange[] = [];
  private readonly raidSummaries: RaidDebugSummary[] = [];
  private detectedRaidCount = 0;
  private partialRaidCount = 0;
  private unknownRecordCount = 0;
  private readonly mapInfoByKey = new Map<string, ParsedMapInfo>();
  private readonly replayDeathByRoomId = new Map<string, ParsedReplayDeathInfo>();
  private readonly teamSnapshotsByTimestamp = new Map<string, TeamSnapshot>();

  consume(decodedLine: string, meta: ConsumeMeta): void {
    const teamSnapshot = parseTeamSnapshotEvent(decodedLine);

    if (teamSnapshot) {
      mergeTeamSnapshotEvent(this.teamSnapshotsByTimestamp, teamSnapshot);
    }

    const replayDeath = parseReplayDeathInfo(decodedLine);

    if (replayDeath) {
      this.replayDeathByRoomId.set(replayDeath.roomId, mergeReplayDeathInfo(this.replayDeathByRoomId.get(replayDeath.roomId), replayDeath));
    }

    const mapInfo = parseMapInfo(decodedLine);

    if (mapInfo) {
      const key = getMapInfoKey(mapInfo.mapUnlockId);

      if (key) {
        this.mapInfoByKey.set(key, mapInfo);
      }
    }

    const basic = parseBasic(decodedLine, this.mapInfoByKey);

    if (basic) {
      this.finalizeCurrent(false, meta.sourceRecordIndex);
      this.detectedRaidCount += 1;
      this.builder = new RaidBuilder({
        roomId: basic.roomId,
        basic: basic.basic,
        killerName: basic.killerName,
        killerIsAi: basic.killerIsAi,
        killerWeaponId: basic.killerWeaponId,
        replayDeath: basic.roomId ? this.replayDeathByRoomId.get(basic.roomId) ?? null : null,
        teamResolution: resolveTeamForBasic(basic.basic, Array.from(this.teamSnapshotsByTimestamp.values())),
        startRecordIndex: meta.sourceRecordIndex,
      });
      return;
    }

    this.builder?.consume(decodedLine, meta.sourceRecordIndex);
  }

  recordUnknown(): void {
    this.unknownRecordCount += 1;
  }

  finalize(sourceRecordIndex: number): RaidParseResult {
    this.finalizeCurrent(true, sourceRecordIndex);

    return {
      raids: [...this.raids],
      debug: this.getDebugInfo(),
    };
  }

  getDebugInfo(): ParserDebugInfo {
    return {
      detectedRaidCount: this.detectedRaidCount,
      completedRaidCount: this.raids.length,
      partialRaidCount: this.partialRaidCount,
      warnings: [...this.warnings],
      unknownRecordCount: this.unknownRecordCount,
      sourceRanges: [...this.sourceRanges],
      raidSummaries: [...this.raidSummaries],
    };
  }

  private finalizeCurrent(partial: boolean, sourceRecordIndex: number): void {
    if (!this.builder) {
      return;
    }

    const result = this.builder.finalize(partial, sourceRecordIndex);

    if (result.debug.finalizedAsPartial) {
      this.partialRaidCount += 1;
    }

    this.raids.push(result.raid);
    this.warnings.push(...result.warnings);
    this.sourceRanges.push(result.sourceRange);
    this.raidSummaries.push(createRaidDebugSummary(result.raid, result.sourceRange, result.warnings, result.debug));
    this.builder = null;
  }
}

function mergeReplayDeathInfo(
  current: ParsedReplayDeathInfo | undefined,
  next: ParsedReplayDeathInfo,
): ParsedReplayDeathInfo {
  if (!current) {
    return next;
  }

  return {
    roomId: current.roomId,
    victimName: current.victimName ?? next.victimName,
    killerNickname: current.killerNickname ?? next.killerNickname,
    weaponId: current.weaponId ?? next.weaponId,
    playerPosition: current.playerPosition ?? next.playerPosition,
    killerPosition: current.killerPosition ?? next.killerPosition,
    deathServerTime: current.deathServerTime ?? next.deathServerTime,
    replayDemoStartTime: current.replayDemoStartTime ?? next.replayDemoStartTime,
    replayDemoEndTime: current.replayDemoEndTime ?? next.replayDemoEndTime,
  };
}

function completeIf(values: unknown[]): ParserSectionStatus {
  return values.every((value) => value !== null && value !== undefined && value !== "") ? "complete" : "partial";
}

function createRaidDebugSummary(
  raid: Raid,
  sourceRange: RaidSourceRange,
  warnings: ParserWarning[],
  debug: RaidDebugMetrics,
): RaidDebugSummary {
  const deathStatus: ParserSectionStatus =
    raid.basic.result === "extracted"
      ? "n/a"
      : raid.death
        ? completeIf([
            raid.death.killerNickname,
            raid.death.weapon ?? raid.death.ammoOrCause,
            raid.death.finalDamage,
            raid.death.hitBodyPart,
            raid.death.playerPosition,
            raid.death.killerPosition,
          ])
        : "partial";

  const rankStatus: ParserSectionStatus = raid.rank
    ? completeIf([raid.rank.previousRank, raid.rank.nextRank, raid.rank.previousScore, raid.rank.nextScore, raid.rank.delta])
    : debug.rankStatus === "n/a"
      ? "n/a"
      : "partial";
  const survivalStatus: ParserSectionStatus =
    debug.survivalFields.hpLoss === "found" && debug.survivalFields.distanceMeters === "found" ? "complete" : "partial";
  const teamStatus: ParserSectionStatus =
    debug.teamType === "team"
      ? debug.teamMemberCount === null
        ? "partial"
        : "complete"
      : debug.teamType === "solo"
        ? "complete"
        : "partial";

  return {
    raidId: raid.id,
    basic: completeIf([
      raid.basic.startedAt,
      raid.basic.endedAt,
      raid.basic.mapId,
      raid.basic.mapName,
      raid.basic.mode,
      raid.basic.zone,
      raid.basic.teamType,
      raid.basic.durationSeconds,
      raid.basic.result,
    ]),
    combat: completeIf([
      raid.combat.pmcKills,
      raid.combat.aiKills,
      raid.combat.damage,
      raid.combat.armorDamage,
      raid.combat.hits,
      raid.combat.shots,
      raid.combat.accuracy,
      raid.combat.killStreak,
    ]),
    summaryPmcKills: raid.combat.pmcKills,
    parsedPmcKills: raid.kills.filter((kill) => kill.opponentType === "player").length,
    summaryAiKills: raid.combat.aiKills,
    parsedAiKills: raid.kills.filter((kill) => kill.opponentType === "ai").length,
    rawKillEvents: debug.rawKillEvents,
    duplicateKillEventsRemoved: debug.duplicateKillEventsRemoved,
    kills: raid.kills.length,
    incomingDamage: raid.incomingDamage.length,
    rawIncomingDamageEvents: debug.rawIncomingDamageEvents,
    duplicateIncomingDamageEventsRemoved: debug.duplicateIncomingDamageEventsRemoved,
    fatalIncomingDamageEvents: debug.fatalIncomingDamageEvents,
    unavailableKillMetricEvents: debug.unavailableKillMetricEvents,
    deathCandidateCount: debug.deathCandidateCount,
    selectedDeathRecordIndex: debug.selectedDeathRecordIndex,
    deathResolutionMatchedBy: debug.deathResolutionMatchedBy,
    finalizedAtEOF: debug.finalizedAtEOF,
    death: deathStatus,
    loot: completeIf([raid.loot.extractedValue, raid.loot.containers, raid.loot.premiumContainers]),
    survival: survivalStatus,
    survivalFields: debug.survivalFields,
    team: teamStatus,
    teamType: debug.teamType,
    teamMemberCount: debug.teamMemberCount,
    teamResolution: debug.teamResolution,
    rank: rankStatus,
    rankStatus: debug.rankStatus,
    rankSourceRecordIndex: debug.rankSourceRecordIndex,
    rankResolvedFrom: debug.rankResolvedFrom,
    rankScoreChange: debug.rankScoreChange,
    killRankedScoreSum: debug.killRankedScoreSum,
    warningCount: warnings.filter((warning) => warning.raidId === raid.id).length,
    startRecordIndex: sourceRange.startRecordIndex,
    endRecordIndex: sourceRange.endRecordIndex,
  };
}
