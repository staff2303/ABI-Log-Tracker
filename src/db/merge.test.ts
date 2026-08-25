import { describe, expect, it } from "vitest";
import type { Raid } from "../types/raid";
import { validateBackupPayload } from "./backup";
import { BACKUP_FORMAT, BACKUP_VERSION, CURRENT_PARSER_VERSION, CURRENT_SCHEMA_VERSION } from "./constants";
import { Sha256 } from "./fileHash";
import { createRaidMatchIdentity } from "./matchKey";
import { createStoredRaid, mergeStoredRaid } from "./merge";
import type { ImportedSourceFile } from "./types";

describe("local DB merge", () => {
  it("hashes data with incremental SHA-256", () => {
    const hasher = new Sha256();
    hasher.update(new TextEncoder().encode("ab"));
    hasher.update(new TextEncoder().encode("c"));

    expect(hasher.digestHex()).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("uses RoomID plus start time for match identity", () => {
    const raid = createRaid();

    expect(createRaidMatchIdentity(raid)).toEqual({
      matchKey: "room-id:71435521858687482|2026-08-23T00:00:00.000Z",
      matchIdentity: "71435521858687482|2026-08-23T00:00:00.000Z",
      matchIdentityType: "room-id",
    });
  });

  it("falls back without kill or damage values when RoomID is missing", () => {
    const raid = createRaid({ id: "unknown-room-2026-08-23T00-00-00-000Z" });

    expect(createRaidMatchIdentity(raid)).toEqual({
      matchKey: "fallback:2026-08-23T00:00:00.000Z|1601|1|Forbidden Zone|600",
      matchIdentity: "2026-08-23T00:00:00.000Z|1601|1|Forbidden Zone|600",
      matchIdentityType: "fallback",
    });
  });

  it("inserts a new raid", () => {
    const source = createSourceFile("a");
    const incoming = createStoredRaid(createRaid(), source.id);
    const decision = mergeStoredRaid(null, incoming, source);

    expect(decision.action).toBe("INSERT");
    expect(decision.raid.sourceFileIds).toEqual([source.id]);
  });

  it("keeps raid count stable for the same raid", () => {
    const source = createSourceFile("a");
    const stored = createStoredRaid(createRaid(), source.id);
    const decision = mergeStoredRaid(stored, createStoredRaid(createRaid(), source.id), source);

    expect(decision.action).toBe("SAME");
    expect(decision.raid.matchKey).toBe(stored.matchKey);
  });

  it("updates when the incoming duplicate is more complete", () => {
    const sourceA = createSourceFile("a");
    const sourceB = createSourceFile("b");
    const partial = createStoredRaid(createRaid({ deathFinalDamage: null, deathWeaponId: null }), sourceA.id);
    const complete = createStoredRaid(createRaid({ deathFinalDamage: 43, deathWeaponId: 101030004 }), sourceB.id);
    const decision = mergeStoredRaid(partial, complete, sourceB);

    expect(decision.action).toBe("UPDATE");
    expect(decision.raid.death?.finalDamage).toBe(43);
    expect(decision.raid.sourceFileIds).toEqual([sourceA.id, sourceB.id]);
  });

  it("keeps the existing raid when the incoming duplicate is less complete", () => {
    const sourceA = createSourceFile("a");
    const sourceB = createSourceFile("b");
    const complete = createStoredRaid(createRaid({ deathFinalDamage: 43, deathWeaponId: 101030004 }), sourceA.id);
    const partial = createStoredRaid(createRaid({ deathFinalDamage: null, deathWeaponId: null }), sourceB.id);
    const decision = mergeStoredRaid(complete, partial, sourceB);

    expect(decision.action).toBe("KEEP");
    expect(decision.raid.death?.finalDamage).toBe(43);
    expect(decision.raid.sourceFileIds).toEqual([sourceA.id, sourceB.id]);
  });

  it("validates backup payloads without replacing the DB", () => {
    const source = createSourceFile("a");
    const raid = createStoredRaid(createRaid(), source.id);

    expect(
      validateBackupPayload({
        format: BACKUP_FORMAT,
        backupVersion: BACKUP_VERSION,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        exportedAt: "2026-08-25T00:00:00.000Z",
        raids: [raid],
        imports: [source],
        importHistory: [],
        mappings: [],
        settings: {},
      }).raids,
    ).toHaveLength(1);
  });
});

function createSourceFile(id: string): ImportedSourceFile {
  return {
    id,
    fileHash: `hash-${id}`,
    filename: `${id}.log`,
    fileSize: 100,
    lastModified: null,
    importedAt: "2026-08-25T00:00:00.000Z",
    parserVersion: CURRENT_PARSER_VERSION,
  };
}

function createRaid(overrides: Partial<Raid> & { deathFinalDamage?: number | null; deathWeaponId?: number | null } = {}): Raid {
  const deathFinalDamage = overrides.deathFinalDamage === undefined ? 43 : overrides.deathFinalDamage;
  const deathWeaponId = overrides.deathWeaponId === undefined ? 101030004 : overrides.deathWeaponId;
  const raid: Raid = {
    id: "71435521858687482-2026-08-23T00-00-00-000Z",
    basic: {
      startedAt: "2026-08-23T00:00:00.000Z",
      endedAt: "2026-08-23T00:10:00.000Z",
      dateTime: "2026-08-23T00:00:00.000Z",
      mapId: 1601,
      mapUnlockId: 1601,
      mapName: "TV Station",
      map: "TV Station",
      modeId: 1,
      mode: "Tactical Ops",
      zone: "Forbidden Zone",
      teamType: 1,
      hasTeammate: false,
      localPlayerNickname: "LOCAL",
      squad: "solo",
      playTimeSeconds: 600,
      durationSeconds: 600,
      result: "dead",
    },
    combat: {
      pmcKills: 1,
      aiKills: 2,
      damage: 300,
      armorDamage: 80,
      hits: 5,
      shots: 20,
      accuracy: 0.25,
      killStreak: 2,
    },
    kills: [
      {
        sourceRecordIndex: 1,
        time: "00:01",
        killTimestamp: 1,
        enemyGid: "gid-1",
        opponentNickname: "EnemyName",
        opponentType: "player",
        enemyIdentity: 1,
        weaponId: 101010023,
        weaponName: "AK12",
        weapon: "AK12",
        hitBodyPartId: 0,
        bodyPartName: "head",
        bodyPart: "head",
        opponentLevel: 10,
        opponentRankLevel: 100,
        opponentRank: "RankLevel 100",
        opponentRankScore: 10,
        damage: 100,
        armorDamage: 20,
        hitCount: 2,
        rawDamage: 100,
        rawArmorDamage: 20,
        rawHitCount: 2,
        combatMetricsUnavailableReason: null,
        armorId: 301050014,
        armorName: "DK8 Mil.",
        opponentArmor: "DK8 Mil.",
        opponentValue: null,
        opponentGearValue: 5000,
        rankScoreGained: 5,
        deathType: 1,
      },
    ],
    incomingDamage: [],
    death: {
      victimName: "LOCAL",
      killerNickname: "CatchTFadeTKTK",
      killerType: "player",
      killerLevel: null,
      killerRank: null,
      weaponId: deathWeaponId,
      weaponName: null,
      weapon: null,
      deathCauserId: 202060001,
      ammoId: null,
      ammoName: null,
      ammoOrCause: null,
      hitBodyPartId: 0,
      hitBodyPartName: null,
      hitBodyPart: "bodyPartId 0",
      finalDamage: deathFinalDamage,
      penetrated: false,
      armorId: 301050014,
      armorName: "DK8 Mil.",
      armor: "DK8 Mil.",
      armorDurability: { beforeHit: null, atHit: 277, max: 450 },
      faceHit: null,
      dbno: false,
      playerPosition: { x: 1, y: 2, z: 3 },
      killerPosition: { x: 4, y: 5, z: 6 },
      deathServerTime: 786.099,
      replayDemoStartTime: 771.099,
      replayDemoEndTime: 791.099,
    },
    loot: {
      extractedValue: 1000,
      itemsFound: null,
      weaponsFound: null,
      attachmentsFound: null,
      gearFound: null,
      containers: 1,
      premiumContainers: 0,
      xpFromLooting: null,
      xpFromUnlocking: null,
      extractionXp: null,
    },
    survival: {
      hpLoss: 43,
      healingDone: 20,
      fractures: null,
      debuffs: null,
      foodDrinksConsumed: null,
      distanceMeters: 1200,
      falls: null,
      teammatesRescued: null,
      timesRescued: null,
      supportActions: null,
    },
    team: {
      type: "solo",
      isTeam: false,
      memberCount: 1,
      members: [],
      localPlayerNickname: "LOCAL",
      resolution: "solo",
      teammateRescues: null,
      rescuedByTeammate: null,
      supportActions: null,
    },
    rank: null,
    ...overrides,
  };

  return raid;
}
