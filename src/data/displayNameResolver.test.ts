import { describe, expect, it } from "vitest";
import { sampleRaidLines } from "../test/fixtures/sampleLines";
import { formatId } from "../utils/format";
import { RaidParser } from "../parser/raid/RaidParser";
import {
  formatAmmoDisplayName,
  formatEquipmentDisplayName,
  formatMapDisplayName,
  formatWeaponDisplayName,
  getMappedAmmoName,
  getMappedWeaponName,
} from "./displayNameResolver";

describe("display name resolver", () => {
  it("maps known direct-evidence IDs", () => {
    expect(formatWeaponDisplayName("101010023")).toBe("AK12");
    expect(formatWeaponDisplayName(101010014)).toBe("AEK Assault Rifle");
    expect(formatWeaponDisplayName("101010002")).toBe("M4A1 Assault Rifle");
    expect(formatWeaponDisplayName("101020003")).toBe("P90 Micro SMG");
    expect(formatWeaponDisplayName("104050001")).toBe("Molotov");
    expect(formatAmmoDisplayName("202030004")).toBe("5.56x45 M995");
    expect(formatAmmoDisplayName("202080006")).toBe("5.7×28 SS198");
    expect(formatAmmoDisplayName("202170001")).toBe("5.8×42 DVC12");
    expect(formatMapDisplayName(1601)).toBe("TV Station");
    expect(formatMapDisplayName("1102")).toBe("Farm");
  });

  it("keeps unknown IDs as unknown labels without guessing", () => {
    expect(getMappedWeaponName("101040005")).toBeNull();
    expect(getMappedAmmoName("202060002")).toBeNull();
    expect(formatWeaponDisplayName("101040005")).toBe("Unknown Weapon");
    expect(formatAmmoDisplayName("202060002")).toBe("Unknown Ammo");
    expect(formatEquipmentDisplayName(null)).toBeNull();
  });

  it("keeps raw IDs unformatted", () => {
    expect(formatId("101040005")).toBe("101040005");
    expect(formatId(101040005)).toBe("101040005");
  });

  it("does not change parser raid, kill, or death counts", () => {
    const parser = new RaidParser();

    sampleRaidLines.forEach((line, index) => {
      parser.consume(line, { sourceRecordIndex: index + 1 });
    });

    const result = parser.finalize(sampleRaidLines.length);
    const before = {
      raids: result.raids.length,
      kills: result.raids.reduce((sum, raid) => sum + raid.kills.length, 0),
      deaths: result.raids.filter((raid) => raid.death !== null).length,
    };

    result.raids.forEach((raid) => {
      formatMapDisplayName(raid.basic.mapId, raid.basic.map);
      raid.kills.forEach((kill) => {
        formatWeaponDisplayName(kill.weaponId, kill.weapon);
        formatEquipmentDisplayName(kill.armorId, kill.opponentArmor);
      });
      if (raid.death) {
        formatWeaponDisplayName(raid.death.weaponId, raid.death.weapon);
        formatAmmoDisplayName(raid.death.deathCauserId, raid.death.ammoOrCause);
        formatEquipmentDisplayName(raid.death.armorId, raid.death.armor);
      }
    });

    expect({
      raids: result.raids.length,
      kills: result.raids.reduce((sum, raid) => sum + raid.kills.length, 0),
      deaths: result.raids.filter((raid) => raid.death !== null).length,
    }).toEqual(before);
  });
});
