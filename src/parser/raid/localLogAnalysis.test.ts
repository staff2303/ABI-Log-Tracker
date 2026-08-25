import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { describe, expect, it } from "vitest";
import { ammoMap } from "../../data/generated/ammoMap";
import { equipmentMap } from "../../data/generated/equipmentMap";
import { itemNameMap } from "../../data/generated/itemNameResolver";
import { formatDateTime } from "../../utils/format";
import { decodePayloadForValidation, decodePayloadToBytes } from "../decoder/abiLogCodec";
import { RaidParser } from "./RaidParser";

type ByteBuffer = Uint8Array<ArrayBufferLike>;

interface MappingCoverage {
  unmappedKillWeaponIds: string[];
  unmappedDeathWeaponIds: string[];
  unmappedDeathCauserIds: string[];
  unmappedArmorIds: string[];
}

interface LocalLogAnalysis {
  sourceMode: "binary" | "decodedText";
  totalRecords: number;
  mode03Records: number;
  mode04Records: number;
  headerRecords: number;
  unknownRecords: number;
  decodedBytes: number;
  raids: ReturnType<RaidParser["finalize"]>["raids"];
  debug: ReturnType<RaidParser["finalize"]>["debug"];
  patternSamples: Record<string, string[]>;
}

const textDecoder = new TextDecoder("utf-8", { fatal: false });

function concatCarry(carry: ByteBuffer, chunk: ByteBuffer): ByteBuffer {
  if (carry.length === 0) {
    return chunk;
  }

  const merged = new Uint8Array(carry.length + chunk.length);
  merged.set(carry, 0);
  merged.set(chunk, carry.length);
  return merged;
}

function trimLineEnding(buffer: ByteBuffer, start: number, end: number): ByteBuffer {
  if (end > start && buffer[end - 1] === 0x0d) {
    return buffer.subarray(start, end - 1);
  }

  return buffer.subarray(start, end);
}

const scanPatterns = [
  "Operators Eliminated",
  "Militants Eliminated",
  "Body Damage",
  "Armor Durability Damage",
  "Ammo Used",
  "Overall Accuracy",
  "Longest Kill Streak",
  "Tactical Ops",
  "Covert Ops",
  "Normal",
  "Lockdown Zone",
  "Forbidden Zone",
  "total_out_value",
  "Containers Searched",
  "Premium Containers Searched",
  "Kilometers Traveled",
  "Replay",
  "VictimLocation",
  "KillerLocation",
  "KillerName:",
  "Parse BeKilledEvents",
  "Parse KillEnemyEvent",
  "Parse ShootEnemyEvents",
  "ShootEnemyEvent",
  "XP from looting",
  "XP from unlocking",
  "Extraction XP",
  "Falls",
  "Teammates Rescued",
  "Times Rescued",
  "No. of Support",
  "AnalyzethRankInfoData",
  "RankLevel",
  "Upgrade_score",
  "previousRank",
  "newRank",
  "previousScore",
  "newScore",
  "scoreChange",
  "ASGTeamInfo",
  "OnRep_TeamMemberPlayerState",
  "OnRep_InBattleTeamMemberPlayerStates",
  "TeamIndex",
  "TeamMember",
  "teammate",
];

function collectPatternSamples(decodedLine: string, counters: LocalLogAnalysis): void {
  if (process.env.ABI_LOG_SCAN_PATTERNS !== "1") {
    return;
  }

  const focusPatterns = process.env.ABI_LOG_FOCUS_PATTERNS?.split(",")
    .map((pattern) => pattern.trim())
    .filter(Boolean);
  const patterns = focusPatterns && focusPatterns.length > 0 ? focusPatterns : scanPatterns;

  for (const pattern of patterns) {
    if (!decodedLine.includes(pattern)) {
      continue;
    }

    counters.patternSamples[pattern] ??= [];

    const sampleLimit = Number(process.env.ABI_LOG_SAMPLE_LIMIT ?? 5);

    if (counters.patternSamples[pattern].length < sampleLimit) {
      counters.patternSamples[pattern].push(decodedLine.slice(0, 500));
    }
  }
}

function consumeDecoded(decodedLine: string, parser: RaidParser, counters: LocalLogAnalysis, sourceRecordIndex: number): void {
  collectPatternSamples(decodedLine, counters);
  parser.consume(decodedLine, { sourceRecordIndex });
}

function collectMappingCoverage(raids: LocalLogAnalysis["raids"]): MappingCoverage {
  return {
    unmappedKillWeaponIds: collectUniqueUnmappedIds(
      raids.flatMap((raid) => raid.kills.map((kill) => kill.weaponId)),
      itemNameMap,
    ),
    unmappedDeathWeaponIds: collectUniqueUnmappedIds(
      raids.map((raid) => raid.death?.weaponId ?? null),
      itemNameMap,
    ),
    unmappedDeathCauserIds: collectUniqueUnmappedIds(
      raids.map((raid) => raid.death?.deathCauserId ?? null),
      ammoMap,
    ),
    unmappedArmorIds: collectUniqueUnmappedIds(
      raids.flatMap((raid) => [
        ...raid.kills.map((kill) => kill.armorId),
        raid.death?.armorId ?? null,
        ...raid.incomingDamage.map((event) => event.armorId),
      ]),
      equipmentMap,
    ),
  };
}

function collectUniqueUnmappedIds(
  ids: Array<string | number | null | undefined>,
  map: Readonly<Record<string, string>>,
): string[] {
  return Array.from(
    new Set(
      ids
        .filter((id): id is string | number => id !== null && id !== undefined && String(id) !== "" && String(id) !== "0")
        .map((id) => String(id))
        .filter((id) => !map[id]),
    ),
  ).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function processDecodedTextRecord(decodedLine: string, parser: RaidParser, counters: LocalLogAnalysis): void {
  counters.totalRecords += 1;
  counters.decodedBytes += decodedLine.length;
  consumeDecoded(decodedLine, parser, counters, counters.totalRecords);
}

function processRecord(line: ByteBuffer, parser: RaidParser, counters: LocalLogAnalysis): void {
  counters.totalRecords += 1;
  const sourceRecordIndex = counters.totalRecords;

  if (line.length >= 2 && line[0] === 0x01) {
    if (line[1] === 0x07) {
      counters.headerRecords += 1;
      return;
    }

    if (line[1] === 0x03) {
      counters.mode03Records += 1;
      counters.decodedBytes += decodePayloadForValidation(line, 2, line.length - 2, 3).decodedBytes;
      consumeDecoded(textDecoder.decode(decodePayloadToBytes(line, 2, line.length - 2, 3)), parser, counters, sourceRecordIndex);
      return;
    }

    if (line[1] === 0x04) {
      counters.mode04Records += 1;
      counters.decodedBytes += decodePayloadForValidation(line, 2, line.length - 2, 4).decodedBytes;
      consumeDecoded(textDecoder.decode(decodePayloadToBytes(line, 2, line.length - 2, 4)), parser, counters, sourceRecordIndex);
      return;
    }
  }

  if (line.length > 0) {
    counters.unknownRecords += 1;
    parser.recordUnknown();
  }
}

async function analyzeLog(path: string): Promise<LocalLogAnalysis> {
  const parser = new RaidParser();
  const counters: LocalLogAnalysis = {
    sourceMode: "binary",
    totalRecords: 0,
    mode03Records: 0,
    mode04Records: 0,
    headerRecords: 0,
    unknownRecords: 0,
    decodedBytes: 0,
    raids: [],
    debug: parser.getDebugInfo(),
    patternSamples: {},
  };
  let carry: ByteBuffer = new Uint8Array(0);

  for await (const chunk of createReadStream(path, { highWaterMark: 1024 * 1024 })) {
    const buffer = concatCarry(carry, chunk);
    let lineStart = 0;

    for (let index = 0; index < buffer.length; index += 1) {
      if (buffer[index] !== 0x0a) {
        continue;
      }

      processRecord(trimLineEnding(buffer, lineStart, index), parser, counters);
      lineStart = index + 1;
    }

    carry = buffer.slice(lineStart);
  }

  if (carry.length > 0) {
    processRecord(trimLineEnding(carry, 0, carry.length), parser, counters);
  }

  const result = parser.finalize(counters.totalRecords);
  counters.raids = result.raids;
  counters.debug = result.debug;

  return counters;
}

function isDecodedRecordStart(line: string): boolean {
  return /^\[\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}:\d{3}\]/.test(line);
}

async function analyzeDecodedTextLog(path: string): Promise<LocalLogAnalysis> {
  const parser = new RaidParser();
  const counters: LocalLogAnalysis = {
    sourceMode: "decodedText",
    totalRecords: 0,
    mode03Records: 0,
    mode04Records: 0,
    headerRecords: 0,
    unknownRecords: 0,
    decodedBytes: 0,
    raids: [],
    debug: parser.getDebugInfo(),
    patternSamples: {},
  };
  let pendingRecord: string | null = null;
  const lineReader = createInterface({
    input: createReadStream(path, { highWaterMark: 1024 * 1024 }),
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  for await (const line of lineReader) {
    if (isDecodedRecordStart(line)) {
      if (pendingRecord !== null) {
        processDecodedTextRecord(pendingRecord, parser, counters);
      }

      pendingRecord = line;
      continue;
    }

    pendingRecord = pendingRecord === null ? line : `${pendingRecord}\n${line}`;
  }

  if (pendingRecord !== null) {
    processDecodedTextRecord(pendingRecord, parser, counters);
  }

  const result = parser.finalize(counters.totalRecords);
  counters.raids = result.raids;
  counters.debug = result.debug;

  return counters;
}

async function analyzeLocalLog(): Promise<LocalLogAnalysis> {
  if (process.env.ABI_DECODED_LOG_PATH) {
    return analyzeDecodedTextLog(process.env.ABI_DECODED_LOG_PATH);
  }

  return analyzeLog(process.env.ABI_LOG_PATH!);
}

describe.skipIf(!process.env.ABI_LOG_PATH && !process.env.ABI_DECODED_LOG_PATH)("local ABInfinite.log analysis", () => {
  it("streams and parses the real local log", async () => {
    const result = await analyzeLocalLog();
    const mappingCoverage = collectMappingCoverage(result.raids);

    if (process.env.ABI_LOG_PRINT_MAPPING_ONLY === "1") {
      console.log(
        JSON.stringify(
          {
            sourceMode: result.sourceMode,
            totalRecords: result.totalRecords,
            unknownRecords: result.unknownRecords,
            raidCount: result.raids.length,
            totals: {
              rawKillEnemyEvents: result.debug.raidSummaries.reduce((sum, raid) => sum + raid.rawKillEvents, 0),
              duplicateKillEventsRemoved: result.debug.raidSummaries.reduce((sum, raid) => sum + raid.duplicateKillEventsRemoved, 0),
              finalKillDetails: result.raids.reduce((sum, raid) => sum + raid.kills.length, 0),
              resolvedDeaths: result.debug.raidSummaries.filter((raid) => raid.death !== "n/a" && raid.selectedDeathRecordIndex !== null).length,
              parserWarnings: result.debug.warnings.length,
            },
            mappingCoverage,
            warnings: result.debug.warnings,
          },
          null,
          2,
        ),
      );
    } else {

      console.log(
        JSON.stringify(
          {
          sourceMode: result.sourceMode,
          totalRecords: result.totalRecords,
          mode03Records: result.mode03Records,
          mode04Records: result.mode04Records,
          headerRecords: result.headerRecords,
          unknownRecords: result.unknownRecords,
          raidCount: result.raids.length,
          totals: {
            rawKillEnemyEvents: result.debug.raidSummaries.reduce((sum, raid) => sum + raid.rawKillEvents, 0),
            duplicateKillEventsRemoved: result.debug.raidSummaries.reduce((sum, raid) => sum + raid.duplicateKillEventsRemoved, 0),
            finalKillDetails: result.raids.reduce((sum, raid) => sum + raid.kills.length, 0),
            killCountMismatches: result.debug.warnings.filter((warning) => warning.code === "kill_count_mismatch").length,
            rawDeathCandidates: result.debug.raidSummaries.reduce((sum, raid) => sum + raid.deathCandidateCount, 0),
            resolvedDeaths: result.debug.raidSummaries.filter((raid) => raid.death !== "n/a" && raid.selectedDeathRecordIndex !== null).length,
            unresolvedDeaths: result.debug.warnings.filter((warning) => warning.code === "death_resolution_failed" || warning.code === "death_resolution_tie").length,
            killerMismatches: result.debug.warnings.filter((warning) => warning.code === "killer_name_mismatch").length,
            weaponMismatches: result.debug.warnings.filter((warning) => warning.code === "weapon_id_mismatch").length,
            incomingDamage: result.raids.reduce((sum, raid) => sum + raid.incomingDamage.length, 0),
            rawIncomingDamageEvents: result.debug.raidSummaries.reduce((sum, raid) => sum + raid.rawIncomingDamageEvents, 0),
            duplicateIncomingDamageEventsRemoved: result.debug.raidSummaries.reduce(
              (sum, raid) => sum + raid.duplicateIncomingDamageEventsRemoved,
              0,
            ),
            fatalIncomingDamageEvents: result.debug.raidSummaries.reduce((sum, raid) => sum + raid.fatalIncomingDamageEvents, 0),
            unavailableKillMetricEvents: result.debug.raidSummaries.reduce((sum, raid) => sum + raid.unavailableKillMetricEvents, 0),
            deadRaids: result.raids.filter((raid) => raid.basic.result === "dead").length,
            deathDetailsComplete: result.raids.filter((raid) => raid.death?.killerNickname && raid.death.playerPosition && raid.death.killerPosition).length,
            killerNamesParsed: result.raids.filter((raid) => raid.death?.killerNickname).length,
            killerPositionsParsed: result.raids.filter((raid) => raid.death?.killerPosition).length,
            totalOutValueRaids: result.raids.filter((raid) => raid.loot.extractedValue !== null).length,
            survivalComplete: result.debug.raidSummaries.filter((raid) => raid.survival === "complete").length,
            survivalFields: {
              hpLoss: result.debug.raidSummaries.filter((raid) => raid.survivalFields.hpLoss === "found").length,
              healingDone: result.debug.raidSummaries.filter((raid) => raid.survivalFields.healingDone === "found").length,
              fractures: result.debug.raidSummaries.filter((raid) => raid.survivalFields.fractures === "found").length,
              debuffs: result.debug.raidSummaries.filter((raid) => raid.survivalFields.debuffs === "found").length,
              foodDrinksConsumed: result.debug.raidSummaries.filter((raid) => raid.survivalFields.foodDrinksConsumed === "found").length,
              distanceMeters: result.debug.raidSummaries.filter((raid) => raid.survivalFields.distanceMeters === "found").length,
              falls: result.debug.raidSummaries.filter((raid) => raid.survivalFields.falls === "found").length,
              teammatesRescued: result.debug.raidSummaries.filter((raid) => raid.survivalFields.teammatesRescued === "found").length,
              timesRescued: result.debug.raidSummaries.filter((raid) => raid.survivalFields.timesRescued === "found").length,
              supportActions: result.debug.raidSummaries.filter((raid) => raid.survivalFields.supportActions === "found").length,
            },
            teamComplete: result.debug.raidSummaries.filter((raid) => raid.team === "complete").length,
            teamTypes: {
              solo: result.debug.raidSummaries.filter((raid) => raid.teamType === "solo").length,
              team: result.debug.raidSummaries.filter((raid) => raid.teamType === "team").length,
              unknown: result.debug.raidSummaries.filter((raid) => raid.teamType === "unknown").length,
              memberCountResolved: result.debug.raidSummaries.filter((raid) => raid.teamMemberCount !== null).length,
              teammateNamesParsed: result.raids.reduce((sum, raid) => sum + raid.team.members.length, 0),
            },
            rankComplete: result.debug.raidSummaries.filter((raid) => raid.rank === "complete").length,
            rankStatus: {
              parsed: result.debug.raidSummaries.filter((raid) => raid.rankStatus === "parsed").length,
              nA: result.debug.raidSummaries.filter((raid) => raid.rankStatus === "n/a").length,
              unknown: result.debug.raidSummaries.filter((raid) => raid.rankStatus === "unknown").length,
              scoreChangeParsed: result.debug.raidSummaries.filter((raid) => raid.rankScoreChange !== null).length,
            },
            parserWarnings: result.debug.warnings.length,
          },
          raids: result.raids.map((raid, index) => ({
            id: raid.id,
            time: formatDateTime(raid.basic.dateTime),
            map: raid.basic.map,
            mode: raid.basic.mode,
            zone: raid.basic.zone,
            result: raid.basic.result,
            duration: raid.basic.playTimeSeconds,
            pmcKills: raid.combat.pmcKills,
            aiKills: raid.combat.aiKills,
            damage: raid.combat.damage,
            accuracy: raid.combat.accuracy,
            shots: raid.combat.shots,
            rawKillEvents: result.debug.raidSummaries[index]?.rawKillEvents ?? raid.kills.length,
            duplicateKillEventsRemoved: result.debug.raidSummaries[index]?.duplicateKillEventsRemoved ?? 0,
            killEnemyEvents: raid.kills.length,
            parsedPmcKills: raid.kills.filter((kill) => kill.opponentType === "player").length,
            parsedAiKills: raid.kills.filter((kill) => kill.opponentType === "ai").length,
            incomingDamageCount: raid.incomingDamage.length,
            deathCandidateCount: result.debug.raidSummaries[index]?.deathCandidateCount ?? 0,
            selectedDeathRecordIndex: result.debug.raidSummaries[index]?.selectedDeathRecordIndex ?? null,
            death: raid.death
              ? {
                  killer: raid.death.killerNickname,
                  weaponId: raid.death.weaponId,
                  cause: raid.death.ammoOrCause,
                  bodyPart: raid.death.hitBodyPart,
                  finalDamage: raid.death.finalDamage,
                  playerPosition: raid.death.playerPosition,
                  killerPosition: raid.death.killerPosition,
                }
              : null,
            loot: raid.loot,
            survival: raid.survival,
            survivalFields: result.debug.raidSummaries[index]?.survivalFields,
            team: raid.team,
            teamType: result.debug.raidSummaries[index]?.teamType,
            teamMemberCount: result.debug.raidSummaries[index]?.teamMemberCount,
            teamMembers: raid.team.members.map((member) => member.nickname),
            teamResolution: result.debug.raidSummaries[index]?.teamResolution,
            rank: raid.rank,
            rankStatus: result.debug.raidSummaries[index]?.rankStatus,
            rankScoreChange: result.debug.raidSummaries[index]?.rankScoreChange,
            rankResolvedFrom: result.debug.raidSummaries[index]?.rankResolvedFrom,
            rankProgression: raid.rank
              ? {
                  previousRankLevel: raid.rank.previousRankLevel,
                  previousScore: raid.rank.previousScore,
                  nextRankLevel: raid.rank.nextRankLevel,
                  nextScore: raid.rank.nextScore,
                  previousCalculation: raid.rank.rawScoreDelta,
                  compositeCalculation: raid.rank.delta,
                  pointsPerRankLevel: raid.rank.pointsPerRankLevel,
                }
              : null,
            killRankedScoreSum: result.debug.raidSummaries[index]?.killRankedScoreSum,
            incomingDamage: raid.incomingDamage.map((event) => ({
              attacker: event.attackerNickname,
              attackerGidInternal: event.attackerGidInternal,
              deathCauserId: event.deathCauserId,
              damage: event.damage,
              armorAbsorbedDamage: event.armorAbsorbedDamage,
              armorId: event.armorId,
              penetration: event.penetration,
              penetrationRate: event.penetrationRate,
              finalHitDamage: event.finalHitDamage,
              isFatalAttacker: event.isFatalAttacker,
              source: [event.sourceRecordStart, event.sourceRecordEnd],
              fingerprint: event.dedupFingerprint,
            })),
          })),
          checks: {
            slightlyHung: result.raids
              .flatMap((raid) => raid.kills)
              .filter((kill) => kill.opponentNickname === "SlightlyHung")
              .map((kill) => ({
                damage: kill.damage,
                armorDamage: kill.armorDamage,
                hitCount: kill.hitCount,
                rawDamage: kill.rawDamage,
                rawArmorDamage: kill.rawArmorDamage,
                rawHitCount: kill.rawHitCount,
                opponentGearValue: kill.opponentGearValue,
                reason: kill.combatMetricsUnavailableReason,
              })),
            catchTFadeTKTK: result.raids
              .flatMap((raid) => raid.incomingDamage)
              .filter((event) => event.attackerNickname === "CatchTFadeTKTK")
              .map((event) => ({
                attackerNickname: event.attackerNickname,
                attackerGidInternal: event.attackerGidInternal,
                deathCauserId: event.deathCauserId,
                damage: event.damage,
                armorAbsorbedDamage: event.armorAbsorbedDamage,
                isFatalAttacker: event.isFatalAttacker,
                source: [event.sourceRecordStart, event.sourceRecordEnd],
              })),
          },
          mappingCoverage,
          raidDebug: result.debug.raidSummaries,
          warnings: result.debug.warnings,
          patternSamples: result.patternSamples,
          },
          null,
          2,
        ),
      );
    }

    expect(result.totalRecords).toBeGreaterThan(0);
    expect(result.headerRecords).toBe(result.sourceMode === "binary" ? 1 : 0);
    expect(result.unknownRecords).toBe(0);
    if (process.env.ABI_LOG_EXPECT_RAID_COUNT) {
      expect(result.raids).toHaveLength(Number(process.env.ABI_LOG_EXPECT_RAID_COUNT));
    } else if (process.env.ABI_LOG_REQUIRE_RAIDS === "1") {
      expect(result.raids.length).toBeGreaterThan(0);
    }
  }, 120_000);
});
