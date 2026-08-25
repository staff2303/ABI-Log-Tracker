import { describe, expect, it } from "vitest";
import { createMappingResolver } from "../data/mappingResolver";
import type { Raid } from "../types/raid";
import { createBuiltInMappingRecords } from "./mappingBuiltins";
import { collectMappingDiscoveriesFromRaids } from "./mappingDiscovery";
import { createMappingBackupPayload, summarizeMappings, validateMappingBackupPayload } from "./mappingRepository";
import type { MappingRecord } from "./mappingTypes";

describe("mapping management", () => {
  it("creates built-in seed records from generated maps", () => {
    const records = createBuiltInMappingRecords("2026-08-25T00:00:00.000Z");
    const ak12 = records.find((record) => record.id === "101010023");

    expect(ak12).toMatchObject({
      category: "weapon",
      name: "AK12",
      builtinName: "AK12",
      status: "confirmed",
      source: "builtin",
      userEdited: false,
    });
  });

  it("discovers unknown IDs without changing raid data", () => {
    const raid = createRaidWithUnknownIds();
    const before = JSON.stringify(raid);
    const discoveries = collectMappingDiscoveriesFromRaids([raid]);

    expect(discoveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "999999999", category: "weapon" }),
        expect.objectContaining({ id: "888888888", category: "equipment", suggestedCategory: "armor" }),
        expect.objectContaining({ id: "777777777", category: "ammo" }),
      ]),
    );
    expect(JSON.stringify(raid)).toBe(before);
  });

  it("uses user confirmed mapping before built-in name", () => {
    const resolver = createMappingResolver([
      createMappingRecord({
        id: "101010023",
        category: "weapon",
        name: "AK12",
        builtinName: "AK12",
        userName: "AK-12 돌격소총",
        userEdited: true,
      }),
    ]);

    expect(resolver.weapon("101010023")).toBe("AK-12 돌격소총");
  });

  it("does not apply unconfirmed names to raid display", () => {
    const resolver = createMappingResolver([
      createMappingRecord({
        id: "999999999",
        category: "weapon",
        name: "Candidate Rifle",
        status: "unconfirmed",
      }),
    ]);

    expect(resolver.weapon("999999999")).toBe("Unknown Weapon");
  });

  it("reflects mapping edits without mutating raids", () => {
    const raid = createRaidWithUnknownIds();
    const before = JSON.stringify(raid);
    const initialResolver = createMappingResolver([]);
    const editedResolver = createMappingResolver([
      createMappingRecord({
        id: "999999999",
        category: "weapon",
        name: "Test Rifle Mk2",
        userName: "Test Rifle Mk2",
        userEdited: true,
      }),
    ]);

    expect(initialResolver.weapon(raid.kills[0]?.weaponId)).toBe("Unknown Weapon");
    expect(editedResolver.weapon(raid.kills[0]?.weaponId)).toBe("Test Rifle Mk2");
    expect(JSON.stringify(raid)).toBe(before);
  });

  it("exports and validates mapping backup payloads", () => {
    const mappings = [createMappingRecord({ id: "999999999", name: "Test Rifle", userEdited: true })];
    const payload = createMappingBackupPayload(mappings);

    expect(validateMappingBackupPayload(payload).mappings).toHaveLength(1);
  });

  it("summarizes mapping status and sources", () => {
    const summary = summarizeMappings([
      createMappingRecord({ id: "1", status: "confirmed", source: "builtin" }),
      createMappingRecord({ id: "2", status: "unconfirmed", source: "log" }),
      createMappingRecord({ id: "3", status: "conflict", source: "imported" }),
    ]);

    expect(summary).toMatchObject({
      total: 3,
      confirmed: 1,
      unconfirmed: 1,
      conflict: 1,
    });
  });
});

function createMappingRecord(overrides: Partial<MappingRecord>): MappingRecord {
  return {
    id: "999999999",
    category: "weapon",
    suggestedCategory: "weapon",
    name: "Test Rifle",
    builtinName: null,
    userName: null,
    status: "confirmed",
    source: "user",
    aliases: [],
    rawBlueprint: null,
    confidence: "high",
    occurrenceCount: 0,
    firstSeenAt: null,
    lastSeenAt: null,
    sourceFileIds: [],
    createdAt: "2026-08-25T00:00:00.000Z",
    updatedAt: "2026-08-25T00:00:00.000Z",
    userEdited: false,
    notes: null,
    candidateNames: [],
    evidence: [],
    ...overrides,
  };
}

function createRaidWithUnknownIds(): Raid {
  return {
    id: "test-raid",
    basic: {
      startedAt: "2026-08-25T00:00:00.000Z",
      endedAt: "2026-08-25T00:10:00.000Z",
      dateTime: "2026-08-25T00:00:00.000Z",
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
      aiKills: 0,
      damage: 100,
      armorDamage: 20,
      hits: 1,
      shots: 4,
      accuracy: 0.25,
      killStreak: 1,
    },
    kills: [
      {
        sourceRecordIndex: 1,
        time: "00:01",
        killTimestamp: 1,
        enemyGid: "gid",
        opponentNickname: "Enemy",
        opponentType: "player",
        enemyIdentity: 1,
        weaponId: 999999999,
        weaponName: null,
        weapon: "weaponId 999999999",
        hitBodyPartId: 2,
        bodyPartName: null,
        bodyPart: "bodyPartId 2",
        opponentLevel: null,
        opponentRankLevel: null,
        opponentRank: null,
        opponentRankScore: null,
        damage: 100,
        armorDamage: 20,
        hitCount: 1,
        rawDamage: 100,
        rawArmorDamage: 20,
        rawHitCount: 1,
        combatMetricsUnavailableReason: null,
        armorId: 888888888,
        armorName: null,
        opponentArmor: "armorId 888888888",
        opponentValue: null,
        opponentGearValue: null,
        rankScoreGained: null,
        deathType: null,
      },
    ],
    incomingDamage: [
      {
        sourceRecordStart: 2,
        sourceRecordEnd: 3,
        attackerNickname: "Enemy",
        attackerGidInternal: "gid",
        attackerType: "player",
        deathCauserId: "777777777",
        penetration: true,
        armorId: "888888888",
        armorDurability: 10,
        armorMaxDurability: 100,
        damage: 43,
        armorAbsorbedDamage: 2,
        penetrationRate: 100,
        targetStateRaw: 1,
        bodyPenetrated: false,
        finalHitDamage: 43,
        consumedArmorDurability: 2,
        lastHitReducedDamage: 0,
        armReducedDamage: 0,
        isFatalAttacker: true,
        dedupFingerprint: "fp",
      },
    ],
    death: null,
    loot: {
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
    },
    survival: {
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
  };
}
