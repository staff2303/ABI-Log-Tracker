import { describe, expect, it } from "vitest";
import { MappingDiscoveryScanner } from "./MappingDiscoveryScanner";

describe("MappingDiscoveryScanner", () => {
  it("aggregates unknown ID usage without storing decoded log text", () => {
    const scanner = new MappingDiscoveryScanner();

    for (let index = 1; index <= 10; index += 1) {
      scanner.consume(
        `[BattleResultModule]Parse KillEnemyEvent weaponId:101040005, armorId:301060029, hitBodyPartId:0`,
        index,
      );
    }

    const discoveries = scanner.finalize();

    expect(discoveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "item:101040005", rawId: "101040005", namespace: "item", category: "weapon", occurrences: 10 }),
        expect.objectContaining({ id: "item:301060029", rawId: "301060029", namespace: "item", category: "equipment", occurrences: 10 }),
        expect.objectContaining({ id: "gameplay_tag:0", rawId: "0", namespace: "gameplay_tag", category: "bodyPart", occurrences: 10 }),
      ]),
    );
    expect(discoveries.every((entry) => !entry.sample || entry.sample.length <= 360)).toBe(true);
  });

  it("records direct ID/name evidence from the same record", () => {
    const scanner = new MappingDiscoveryScanner();

    scanner.consume("[BattleResultModule]OprationResultPanel:Init WeaponId:101010023 WeaponName:AK12", 1);

    expect(scanner.finalize()).toEqual([
      expect.objectContaining({
        id: "item:101010023",
        namespace: "item",
        rawId: "101010023",
        category: "weapon",
        autoConfirm: true,
        candidates: [
          expect.objectContaining({
            name: "AK12",
            evidenceType: "direct_name_id",
            confidence: "high",
          }),
        ],
      }),
    ]);
  });

  it("records same-event display name and blueprint candidates", () => {
    const scanner = new MappingDiscoveryScanner();

    scanner.consume("ParseEvent start, event name:ItemEventObject", 1);
    scanner.consume("ItemId:301040024 Blueprint:BP_Helmet_TC2002_C", 2);
    scanner.consume("DisplayName:TC2002", 4);
    scanner.consume("ParseEvent start, event name:NextEvent", 5);

    const item = scanner.finalize().find((entry) => entry.rawId === "301040024");

    expect(item?.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "TC2002", source: "log", evidenceType: "contextual" }),
        expect.objectContaining({ name: "BP_Helmet_TC2002_C", source: "blueprint" }),
      ]),
    );
  });

  it("links IDs and blueprints through a bounded instance context", () => {
    const scanner = new MappingDiscoveryScanner();

    scanner.consumeScannable("Instance:ITEM-ABC-1 ItemId:101040005", 1);
    scanner.consumeScannable("Instance:ITEM-ABC-1 Blueprint:BP_Weapon_M110_C", 2);

    const weapon = scanner.finalize().find((entry) => entry.rawId === "101040005");

    expect(weapon?.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "BP_Weapon_M110_C",
          source: "blueprint",
          evidenceType: "bp_class_id",
        }),
      ]),
    );
  });

  it("ignores shared UI blueprint artifacts", () => {
    const scanner = new MappingDiscoveryScanner();

    scanner.consume("ItemId:104010001 Blueprint:BP_IconScaleBoxPaddingComponent", 1);

    const item = scanner.finalize().find((entry) => entry.rawId === "104010001");

    expect(item?.candidates ?? []).toHaveLength(0);
  });

  it("does not use KillEnemyEvent opponent names as weapon candidates", () => {
    const scanner = new MappingDiscoveryScanner();

    scanner.consume(
      "[BattleResultModule]Parse KillEnemyEvent gid:2002, name:SampleOperator, timeStamp:1, enemyIdentity:1, weaponId:101010010, hitBodyPartId:2",
      1,
    );

    const weapon = scanner.finalize().find((entry) => entry.rawId === "101010010");

    expect(weapon?.candidates ?? []).toHaveLength(0);
  });

  it("extracts battle-result map names from GetMapInfoStr records", () => {
    const scanner = new MappingDiscoveryScanner();

    scanner.consume("TeamUpUtil.GetMapInfoStr 101160102 1 Tactical Ops TV Station Forbidden Zone", 1);

    expect(scanner.finalize()).toEqual([
      expect.objectContaining({
        id: "map:101160102",
        namespace: "map",
        rawId: "101160102",
        category: "map",
        evidenceType: "map_info",
        autoConfirm: true,
        candidates: [expect.objectContaining({ name: "TV Station", evidenceType: "map_info" })],
      }),
    ]);
  });

  it("keeps same numeric prefix separated by namespace", () => {
    const scanner = new MappingDiscoveryScanner();

    scanner.consume("TeamUpUtil.GetMapInfoStr 101160102 1 Tactical Ops TV Station Forbidden Zone", 1);
    scanner.consume("[BattleResultModule]OprationResultPanel:Init WeaponId:101010002 WeaponName:M4A1", 2);

    expect(scanner.finalize()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "map:101160102", namespace: "map", rawId: "101160102", category: "map" }),
        expect.objectContaining({ id: "item:101010002", namespace: "item", rawId: "101010002", category: "weapon" }),
      ]),
    );
  });

  it("extracts ItemInfo ID, GID context, and name as confirmed evidence", () => {
    const scanner = new MappingDiscoveryScanner();

    scanner.consumeScannable("ItemInfo table |id:104070001 |gid:123456789 |ItemName:Gas", 1);

    expect(scanner.finalize()).toEqual([
      expect.objectContaining({
        id: "item:104070001",
        namespace: "item",
        rawId: "104070001",
        autoConfirm: true,
        candidates: [expect.objectContaining({ name: "Gas", evidenceType: "item_info" })],
      }),
    ]);
  });

  it("uses GID correlation without storing GID as a permanent mapping ID", () => {
    const scanner = new MappingDiscoveryScanner();

    scanner.consumeScannable("Inventory item_id:104070001 gid:123456789", 1);
    scanner.consumeScannable("ItemInfo table |id:104070001 |gid:123456789 |ItemName:Gas", 2);

    const discoveries = scanner.finalize();

    expect(discoveries.some((entry) => entry.namespace === "gid")).toBe(false);
    expect(discoveries.find((entry) => entry.rawId === "104070001")?.candidates).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Gas" })]),
    );
  });
});
