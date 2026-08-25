import { describe, expect, it } from "vitest";
import { sampleRaidLines } from "../../test/fixtures/sampleLines";
import { RaidParser } from "./RaidParser";
import { getMapInfoKey, parseBasic, parseMapInfo } from "./parseBasic";
import { IncomingDamageCollector } from "./parseIncomingDamage";
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
    expect(kill?.damage).toBeNull();
    expect(kill?.armorDamage).toBeNull();
    expect(kill?.hitCount).toBeNull();
    expect(kill?.rawDamage).toBe(0);
    expect(kill?.rawArmorDamage).toBe(0);
    expect(kill?.rawHitCount).toBe(0);
    expect(kill?.combatMetricsUnavailableReason).toBe("unreliable-zero-kill-metrics");
    expect(kill?.armorId).toBe(301010210);
    expect(kill?.opponentGearValue).toBe(1384500);
    expect(kill?.rankScoreGained).toBe(50);
    expect(kill?.deathType).toBe(0);
  });

  it("parses ShootEnemyEventObject as incoming damage without taking the Lua display prefix as a name", () => {
    const collector = new IncomingDamageCollector();
    const lines = [
      `[2026.08.24-19.07.16:861][211]LogUnLua: Display: |LuaCore.cpp:2779|[BattleResultModule]----------------------------- ParseEvent start, event name:ShootEnemyEventObject, index:1----------------------------- [@G:\\Game\\BaseStatisticsEventObject.lua:47]`,
      `[2026.08.24-19.07.16:861][211]LogUnLua: Display: |LuaCore.cpp:2779|[BattleResultModule]Parse ShootEnemyEvents 名字:CatchTFadeTKTK [@G:\\Game\\ShootEnemyEventObject.lua:32]`,
      `[2026.08.24-19.07.16:861][211]LogUnLua: Display: |LuaCore.cpp:2779|[BattleResultModule]Parse ShootEnemyEvents gid:-9077144435218239964 [@G:\\Game\\ShootEnemyEventObject.lua:33]`,
      `[2026.08.24-19.07.16:861][211]LogUnLua: Display: |LuaCore.cpp:2779|[BattleResultModule]Parse ShootEnemyEvents DeathCauserId:0 [@G:\\Game\\ShootEnemyEventObject.lua:34]`,
      `[2026.08.24-19.07.16:861][211]LogUnLua: Display: |LuaCore.cpp:2779|[BattleResultModule]Parse ShootEnemyEvents 是否穿透:0 [@G:\\Game\\ShootEnemyEventObject.lua:35]`,
      `[2026.08.24-19.07.16:861][211]LogUnLua: Display: |LuaCore.cpp:2779|[BattleResultModule]Parse ShootEnemyEvents 护甲ID:0 [@G:\\Game\\ShootEnemyEventObject.lua:36]`,
      `[2026.08.24-19.07.16:861][211]LogUnLua: Display: |LuaCore.cpp:2779|[BattleResultModule]Parse ShootEnemyEvents 当前护甲耐久度:0 [@G:\\Game\\ShootEnemyEventObject.lua:37]`,
      `[2026.08.24-19.07.16:861][211]LogUnLua: Display: |LuaCore.cpp:2779|[BattleResultModule]Parse ShootEnemyEvents 护甲最大耐久度:0 [@G:\\Game\\ShootEnemyEventObject.lua:38]`,
      `[2026.08.24-19.07.16:861][211]LogUnLua: Display: |LuaCore.cpp:2779|[BattleResultModule]Parse ShootEnemyEvents 造成总伤害:0 [@G:\\Game\\ShootEnemyEventObject.lua:39]`,
      `[2026.08.24-19.07.16:861][211]LogUnLua: Display: |LuaCore.cpp:2779|[BattleResultModule]Parse ShootEnemyEvents 护甲吸收伤害:0 [@G:\\Game\\ShootEnemyEventObject.lua:40]`,
      `[2026.08.24-19.07.16:861][211]LogUnLua: Display: |LuaCore.cpp:2779|[BattleResultModule]Parse ShootEnemyEvents 穿透率:0 [@G:\\Game\\ShootEnemyEventObject.lua:41]`,
      `[2026.08.24-19.07.16:861][211]LogUnLua: Display: |LuaCore.cpp:2779|[BattleResultModule]Parse ShootEnemyEvents 对方状态:1 [@G:\\Game\\ShootEnemyEventObject.lua:42]`,
      `[2026.08.24-19.07.16:861][211]LogUnLua: Display: |LuaCore.cpp:2779|[BattleResultModule]Parse ShootEnemyEvents 穿透身体:false [@G:\\Game\\ShootEnemyEventObject.lua:43]`,
      `[2026.08.24-19.07.16:861][211]LogUnLua: Display: |LuaCore.cpp:2779|[BattleResultModule]Parse ShootEnemyEvents 最后一击:0 [@G:\\Game\\ShootEnemyEventObject.lua:44]`,
      `[2026.08.24-19.07.16:861][211]LogUnLua: Display: |LuaCore.cpp:2779|[BattleResultModule]Parse ShootEnemyEvents cosumeArmorDurability:0 [@G:\\Game\\ShootEnemyEventObject.lua:45]`,
      `[2026.08.24-19.07.16:861][211]LogUnLua: Display: |LuaCore.cpp:2779|[BattleResultModule]Parse ShootEnemyEvents lastHitReduceDamage:0 [@G:\\Game\\ShootEnemyEventObject.lua:46]`,
      `[2026.08.24-19.07.16:861][211]LogUnLua: Display: |LuaCore.cpp:2779|[BattleResultModule]Parse ShootEnemyEvents armReduceDamage:0 [@G:\\Game\\ShootEnemyEventObject.lua:47]`,
    ];

    lines.forEach((line, index) => collector.consume(line, index + 1));
    collector.finalize();

    const incoming = collector.getEvents()[0];
    expect(incoming.attackerNickname).toBe("CatchTFadeTKTK");
    expect(incoming.attackerGidInternal).toBe("-9077144435218239964");
    expect(incoming.deathCauserId).toBe("0");
    expect(incoming.penetration).toBe(false);
    expect(incoming.targetStateRaw).toBe(1);
    expect("hitCount" in incoming).toBe(false);
    expect("killed" in incoming).toBe(false);
  });

  it("parses team snapshot and raid rank lines", () => {
    const teamEvent = parseTeamSnapshotEvent(sampleRaidLines.find((line) => line.includes("Member Name: SampleAlly"))!);
    const rank = parseRankLine(sampleRaidLines.find((line) => line.includes("AnalyzethRankInfoData"))!, 99);

    expect(teamEvent?.memberName).toBe("SampleAlly");
    expect(teamEvent?.expectedCount).toBeNull();
    expect(rank?.rank.previousRank).toBe("RankLevel 148");
    expect(rank?.rank.nextRank).toBe("RankLevel 148");
    expect(rank?.rank.previousRankLevel).toBe(148);
    expect(rank?.rank.nextRankLevel).toBe(148);
    expect(rank?.rank.previousScore).toBe(109);
    expect(rank?.rank.nextScore).toBe(100);
    expect(rank?.rank.rawScoreDelta).toBe(-9);
    expect(rank?.rank.delta).toBe(-9);
    expect(rank?.rank.pointsPerRankLevel).toBe(100);
    expect(rank?.sourceRecordIndex).toBe(99);
  });

  it("calculates RankLevel progression with a composite 100 point unit", () => {
    const rank = parseRankLine(
      `[2026.08.23-17.25.11:699][605]LogUnLua: Display: |LuaCore.cpp:2779|[BattleResultModule][BattleResultDataUtil.AnalyzethRankInfoData] , Score:  100 45 , RankLevel:  148 149 , Upgrade_score:  120 120 , rank:  0 0 [@G:\\Game\\BattleResultDataUtil.lua:1506]`,
      100,
    );

    expect(rank?.rank.previousRankLevel).toBe(148);
    expect(rank?.rank.previousScore).toBe(100);
    expect(rank?.rank.nextRankLevel).toBe(149);
    expect(rank?.rank.nextScore).toBe(45);
    expect(rank?.rank.rawScoreDelta).toBe(-55);
    expect(rank?.rank.delta).toBe(45);
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
    expect(raid.incomingDamage).toHaveLength(1);
    expect(raid.incomingDamage[0].attackerNickname).toBe("SampleKiller");
    expect(raid.incomingDamage[0].isFatalAttacker).toBe(true);
    expect(raid.incomingDamage[0].deathCauserId).toBe("202010007");
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
    expect(result.debug.raidSummaries[0].incomingDamage).toBe(1);
    expect(result.debug.raidSummaries[0].fatalIncomingDamageEvents).toBe(1);
    expect(result.debug.raidSummaries[0].unavailableKillMetricEvents).toBe(1);
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
