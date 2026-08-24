import type { DeathDetail, Nullable, OpponentType, Vector3 } from "../../types/raid";
import { getArmorName } from "../../data/armorMap";
import { getBodyPartName } from "../../data/bodyPartMap";
import { getWeaponName } from "../../data/weaponMap";
import { getLuaLineNumber, getNumberAfter, parseNumberValue } from "./parseUtils";

export interface ParsedReplayDeathInfo {
  roomId: string;
  victimName: string | null;
  killerNickname: string | null;
  weaponId: number | null;
  playerPosition: Vector3 | null;
  killerPosition: Vector3 | null;
  deathServerTime: number | null;
  replayDemoStartTime: number | null;
  replayDemoEndTime: number | null;
}

export function createEmptyDeath(killerName: string | null, killerIsAi: boolean | null, weaponId: number | null): DeathDetail {
  return {
    victimName: null,
    killerNickname: killerName,
    killerType: killerIsAi === null ? null : killerIsAi ? "ai" : "player",
    killerLevel: null,
    killerRank: null,
    weaponId: weaponId === 0 ? null : weaponId,
    weaponName: getWeaponName(weaponId),
    weapon: getWeaponName(weaponId) ?? (weaponId === null || weaponId === 0 ? null : `weaponId ${weaponId}`),
    deathCauserId: null,
    ammoId: null,
    ammoName: null,
    ammoOrCause: null,
    hitBodyPartId: null,
    hitBodyPartName: null,
    hitBodyPart: null,
    finalDamage: null,
    penetrated: null,
    armorId: null,
    armorName: null,
    armor: null,
    armorDurability: {
      beforeHit: null,
      atHit: null,
      max: null,
    },
    faceHit: null,
    dbno: null,
    playerPosition: null,
    killerPosition: null,
    deathServerTime: null,
    replayDemoStartTime: null,
    replayDemoEndTime: null,
  };
}

function parseLastNumber(line: string): Nullable<number> {
  const eventOffset = line.indexOf("Parse BeKilledEvents");
  const segment = eventOffset >= 0 ? line.slice(eventOffset) : line;
  const match = segment.match(/:\s*(-?\d+(?:\.\d+)?)\s*\[/);
  return parseNumberValue(match?.[1]);
}

function parseLastText(line: string): string | null {
  const eventOffset = line.indexOf("Parse BeKilledEvents");
  const segment = eventOffset >= 0 ? line.slice(eventOffset) : line;
  const match = segment.match(/:\s*([^[\]]+)\s*\[/);
  return match?.[1]?.trim() || null;
}

function parseReplayVector(line: string, label: string): Vector3 | null {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const vectorMatch = line.match(
    new RegExp(`${escapedLabel}:?V?\\(?X=\\s*(-?\\d+(?:\\.\\d+)?),?\\s+Y=\\s*(-?\\d+(?:\\.\\d+)?),?\\s+Z=\\s*(-?\\d+(?:\\.\\d+)?)\\)?`),
  );

  if (!vectorMatch) {
    return null;
  }

  const x = parseNumberValue(vectorMatch[1]);
  const y = parseNumberValue(vectorMatch[2]);
  const z = parseNumberValue(vectorMatch[3]);

  if (x === null || y === null || z === null) {
    return null;
  }

  return { x, y, z };
}

function getReplayText(line: string, label: string): string | null {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = line.match(new RegExp(`${escapedLabel}:([^\\s,]+)`));
  return match?.[1]?.trim() || null;
}

export function parseReplayDeathInfo(line: string): ParsedReplayDeathInfo | null {
  if (!line.includes("VictimLocation") && !line.includes("KillerLocation") && !line.includes("DeathServerTime")) {
    return null;
  }

  const roomMatch = line.match(/dsreplay-(\d+)-/);

  if (!roomMatch) {
    return null;
  }

  return {
    roomId: roomMatch[1],
    victimName: getReplayText(line, "VictimName"),
    killerNickname: getReplayText(line, "KillerName"),
    weaponId: getNumberAfter("KillerWeaponID", line),
    playerPosition: parseReplayVector(line, "VictimLocation"),
    killerPosition: parseReplayVector(line, "KillerLocation"),
    deathServerTime: getNumberAfter("DeathServerTime", line),
    replayDemoStartTime: getNumberAfter("ReplayDemoStartTime", line),
    replayDemoEndTime: getNumberAfter("ReplayDemoEndTime", line),
  };
}

export function applyReplayDeathInfo(death: DeathDetail | null, replayInfo: ParsedReplayDeathInfo | null): DeathDetail | null {
  if (!replayInfo) {
    return death;
  }

  const nextDeath = death ?? createEmptyDeath(null, null, null);

  nextDeath.playerPosition = nextDeath.playerPosition ?? replayInfo.playerPosition;
  nextDeath.killerPosition = nextDeath.killerPosition ?? replayInfo.killerPosition;
  nextDeath.victimName = nextDeath.victimName ?? replayInfo.victimName;
  nextDeath.killerNickname = nextDeath.killerNickname ?? replayInfo.killerNickname;
  nextDeath.deathServerTime = nextDeath.deathServerTime ?? replayInfo.deathServerTime;
  nextDeath.replayDemoStartTime = nextDeath.replayDemoStartTime ?? replayInfo.replayDemoStartTime;
  nextDeath.replayDemoEndTime = nextDeath.replayDemoEndTime ?? replayInfo.replayDemoEndTime;

  if (nextDeath.weaponId === null && replayInfo.weaponId !== null && replayInfo.weaponId !== 0) {
    nextDeath.weaponId = replayInfo.weaponId;
    nextDeath.weaponName = getWeaponName(replayInfo.weaponId);
    nextDeath.weapon = nextDeath.weaponName ?? `weaponId ${replayInfo.weaponId}`;
  }

  return nextDeath;
}

export function applyDeathLine(death: DeathDetail | null, line: string): DeathDetail | null {
  const replayDeath = applyReplayDeathInfo(death, parseReplayDeathInfo(line));

  if (replayDeath !== death) {
    death = replayDeath;
  }

  if (!line.includes("Parse BeKilledEvents")) {
    return death;
  }

  const nextDeath = death ?? createEmptyDeath(null, null, null);
  const luaLine = getLuaLineNumber(line, "BeKilledEventObject.lua");

  if (line.includes("DeathCauserId")) {
    const value = getNumberAfter("DeathCauserId", line);
    if (nextDeath.deathCauserId === null && value !== null) {
      nextDeath.deathCauserId = value;
      nextDeath.ammoOrCause = `DeathCauserId ${value}`;
    }
    return nextDeath;
  }

  if (line.includes("isBodyHitThrough")) {
    nextDeath.penetrated = line.includes("true");
    return nextDeath;
  }

  if (line.includes("faceHit")) {
    nextDeath.faceHit = line.includes("true") || getNumberAfter("faceHit", line) === 1;
    return nextDeath;
  }

  if (line.includes("DBNO") || line.includes("Dbno") || line.includes("dbno")) {
    nextDeath.dbno = line.includes("true") || getNumberAfter("DBNO", line) === 1 || getNumberAfter("dbno", line) === 1;
    return nextDeath;
  }

  if (line.includes("armorReduceDamage") || line.includes("armReduceDamage")) {
    return nextDeath;
  }

  const numericValue = parseLastNumber(line);
  const textValue = parseLastText(line);

  if (luaLine === 47 || luaLine === 57) {
    if (nextDeath.hitBodyPartId === null && numericValue !== null) {
      nextDeath.hitBodyPartId = numericValue;
      nextDeath.hitBodyPartName = getBodyPartName(numericValue);
      nextDeath.hitBodyPart = nextDeath.hitBodyPartName ?? `bodyPartId ${numericValue}`;
    }
  } else if (luaLine === 48) {
    nextDeath.killerNickname = nextDeath.killerNickname ?? textValue;
  } else if (luaLine === 49) {
    nextDeath.ammoOrCause = nextDeath.ammoOrCause ?? (numericValue === null ? null : `DeathReason ${numericValue}`);
  } else if (luaLine === 51) {
    nextDeath.finalDamage = nextDeath.finalDamage ?? numericValue;
  } else if (luaLine === 52) {
    nextDeath.penetrated = numericValue === null ? nextDeath.penetrated : numericValue === 1;
  } else if (luaLine === 53) {
    if (nextDeath.armorId === null && numericValue !== null && numericValue !== 0) {
      nextDeath.armorId = numericValue;
      nextDeath.armorName = getArmorName(numericValue);
      nextDeath.armor = nextDeath.armorName ?? `armorId ${numericValue}`;
    }
  } else if (luaLine === 56) {
    nextDeath.armorDurability.atHit = nextDeath.armorDurability.atHit ?? numericValue;
  } else if (luaLine === 58) {
    nextDeath.armorDurability.max = nextDeath.armorDurability.max ?? numericValue;
  } else if (luaLine === 63) {
    if (numericValue !== null && numericValue !== 0) {
      nextDeath.weaponId = numericValue;
      nextDeath.weaponName = getWeaponName(numericValue);
      nextDeath.weapon = nextDeath.weaponName ?? `weaponId ${numericValue}`;
    }
  }

  return nextDeath;
}

export function inferKillerType(death: DeathDetail | null): OpponentType | null {
  return death?.killerType ?? null;
}
