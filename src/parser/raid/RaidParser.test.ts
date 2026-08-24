import { describe, expect, it } from "vitest";
import { sampleRaidLines } from "../../test/fixtures/sampleLines";
import { RaidParser } from "./RaidParser";
import { getMapInfoKey, parseBasic, parseMapInfo } from "./parseBasic";
import { parseKill } from "./parseKill";
import { parseRankLine } from "./parseRank";
import { parseTeamSnapshotEvent } from "./parseTeam";

describe("raid parser", () => {
  it("parses OprationResultPanel basic block", () => {
    const mapInfoLine = sampleRaidLines.find((line) => line.includes("TeamUpUtil.GetMapInfoStr"))!;
    const basicLine = sampleRaidLines.find((line) => line.includes("OprationResultPanel:Init(args):"))!;
    const mapInfo = parseMapInfo(mapInfoLine);
    const mapInfoKey = getMapInfoKey(mapInfo?.mapUnlockId ?? null);
    const mapInfoByKey = new Map(mapInfo && mapInfoKey ? [[mapInfoKey, mapInfo]] : []);
    const basic = parseBasic(basicLine, mapInfoByKey);

    expect(basic?.roomId).toBe("123456789");
    expect(basic?.basic.result).toBe("dead");
    expect(basic?.basic.mapId).toBe(1601);
    expect(basic?.basic.map).toBe("TV Station");
    expect(basic?.basic.mode).toBe("Tactical Ops");
    expect(basic?.basic.zone).toBe("Forbidden Zone");
    expect(basic?.basic.squad).toBe("team");
    expect(basic?.basic.hasTeammate).toBe(true);
    expect(basic?.basic.localPlayerNickname).toBe("SamplePlayer");
    expect(basic?.basic.playTimeSeconds).toBe(42);
  });

  it("parses KillEnemyEvent fields without masking names", () => {
    const killLine = sampleRaidLines.find((line) => line.includes("name:SampleOperator"))!;
    const kill = parseKill(killLine);

    expect(kill?.enemyGid).toBe("2002");
    expect(kill?.killTimestamp).toBe(1787470957);
    expect(kill?.opponentNickname).toBe("SampleOperator");
    expect(kill?.opponentType).toBe("player");
    expect(kill?.enemyIdentity).toBe(1);
    expect(kill?.weaponId).toBe(101010010);
    expect(kill?.weapon).toBe("weaponId 101010010");
    expect(kill?.hitBodyPartId).toBe(2);
    expect(kill?.bodyPart).toBe("bodyPartId 2");
    expect(kill?.opponentLevel).toBe(30);
    expect(kill?.opponentRank).toBe("rankLevel 106");
    expect(kill?.hitCount).toBe(0);
    expect(kill?.armorId).toBe(301010210);
    expect(kill?.opponentGearValue).toBe(1384500);
    expect(kill?.rankScoreGained).toBe(50);
    expect(kill?.deathType).toBe(0);
  });

  it("parses team snapshot and raid rank lines", () => {
    const teamEvent = parseTeamSnapshotEvent(sampleRaidLines.find((line) => line.includes("Member Name: SampleAlly"))!);
    const rank = parseRankLine(sampleRaidLines.find((line) => line.includes("AnalyzethRankInfoData"))!, 99);

    expect(teamEvent?.memberName).toBe("SampleAlly");
    expect(teamEvent?.expectedCount).toBeNull();
    expect(rank?.rank.previousRank).toBe("RankLevel 148");
    expect(rank?.rank.nextRank).toBe("RankLevel 148");
    expect(rank?.rank.previousScore).toBe(109);
    expect(rank?.rank.nextScore).toBe(100);
    expect(rank?.rank.delta).toBe(-9);
    expect(rank?.sourceRecordIndex).toBe(99);
  });

  it("consumes records sequentially and finalizes a Raid", () => {
    const parser = new RaidParser();

    sampleRaidLines.forEach((line, index) => {
      parser.consume(line, { sourceRecordIndex: index + 1 });
    });

    const result = parser.finalize(sampleRaidLines.length);
    const raid = result.raids[0];

    expect(result.raids).toHaveLength(1);
    expect(raid.basic.result).toBe("dead");
    expect(raid.combat.pmcKills).toBe(1);
    expect(raid.combat.aiKills).toBe(1);
    expect(raid.combat.damage).toBe(425);
    expect(raid.combat.armorDamage).toBe(79);
    expect(raid.combat.hits).toBe(16);
    expect(raid.combat.shots).toBe(22);
    expect(raid.combat.accuracy).toBe(0.73);
    expect(raid.kills).toHaveLength(2);
    expect(raid.death?.killerNickname).toBe("SampleKiller");
    expect(raid.death?.ammoOrCause).toBe("DeathCauserId 202010007");
    expect(raid.loot.extractedValue).toBe(0);
    expect(raid.survival.hpLoss).toBe(151);
    expect(raid.survival.distanceMeters).toBe(90);
    expect(raid.team.type).toBe("team");
    expect(raid.team.memberCount).toBe(2);
    expect(raid.team.members.map((member) => member.nickname)).toEqual(["SampleAlly"]);
    expect(raid.rank?.delta).toBe(-9);
    expect(result.debug.detectedRaidCount).toBe(1);
    expect(result.debug.raidSummaries[0].combat).toBe("complete");
    expect(result.debug.raidSummaries[0].survivalFields.hpLoss).toBe("found");
    expect(result.debug.raidSummaries[0].survivalFields.healingDone).toBe("missing");
    expect(result.debug.raidSummaries[0].teamType).toBe("team");
    expect(result.debug.raidSummaries[0].rankStatus).toBe("parsed");
  });

  it("deduplicates repeated KillEnemyEvent records by event fingerprint", () => {
    const parser = new RaidParser();
    const aiKillLine = sampleRaidLines.find((line) => line.includes("name:Sample AI"))!;
    const playerKillLine = sampleRaidLines.find((line) => line.includes("name:SampleOperator"))!;
    const duplicatedLines = [...sampleRaidLines, aiKillLine, playerKillLine];

    duplicatedLines.forEach((line, index) => {
      parser.consume(line, { sourceRecordIndex: index + 1 });
    });

    const result = parser.finalize(duplicatedLines.length);
    const raid = result.raids[0];
    const debug = result.debug.raidSummaries[0];

    expect(raid.kills).toHaveLength(2);
    expect(debug.rawKillEvents).toBe(4);
    expect(debug.duplicateKillEventsRemoved).toBe(2);
    expect(debug.summaryPmcKills).toBe(1);
    expect(debug.parsedPmcKills).toBe(1);
    expect(debug.summaryAiKills).toBe(1);
    expect(debug.parsedAiKills).toBe(1);
    expect(result.debug.warnings.some((warning) => warning.code === "kill_count_mismatch")).toBe(false);
  });
});
