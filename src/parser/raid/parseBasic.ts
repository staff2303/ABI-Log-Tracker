import type { Nullable, RaidBasic, RaidResult, SquadType } from "../../types/raid";
import { parseBooleanValue, parseLogTimestamp, parseLooseKeyValues, parseNumberValue, subtractSeconds } from "./parseUtils";

export interface ParsedMapInfo {
  mapUnlockId: number;
  modeName: string | null;
  mapName: string | null;
  zone: string | null;
}

export interface ParsedBasicBlock {
  roomId: string | null;
  basic: RaidBasic;
  killerName: string | null;
  killerIsAi: boolean | null;
  killerWeaponId: number | null;
}

const mapIdNames: Record<number, string> = {
  1102: "Farm",
  1601: "TV Station",
};

const modeNames = ["Tactical Ops", "Covert Ops"] as const;
const mapNames = ["TV Station", "Farm"] as const;
const zoneNames = ["Forbidden Zone", "Lockdown Zone", "Normal"] as const;

export function getMapInfoKey(mapUnlockId: Nullable<number>): string | null {
  return mapUnlockId === null ? null : String(mapUnlockId);
}

export function parseMapInfo(line: string): ParsedMapInfo | null {
  if (!line.includes("TeamUpUtil.GetMapInfoStr")) {
    return null;
  }

  const match = line.match(/GetMapInfoStr\s+(\d+)\s+\d+\s+(.+?)\s+\[@/);

  if (!match) {
    return null;
  }

  const mapUnlockId = parseNumberValue(match[1]);
  const rest = match[2].trim();

  if (mapUnlockId === null) {
    return null;
  }

  const modeName = modeNames.find((mode) => rest.includes(mode)) ?? null;
  const mapName = mapNames.find((map) => rest.includes(map)) ?? null;
  const zone = zoneNames.find((candidate) => rest.includes(candidate)) ?? null;

  return {
    mapUnlockId,
    modeName,
    mapName,
    zone,
  };
}

export function parseBasic(line: string, mapInfoByKey: ReadonlyMap<string, ParsedMapInfo> = new Map()): ParsedBasicBlock | null {
  if (!line.includes("OprationResultPanel:Init(args):")) {
    return null;
  }

  const openBrace = line.indexOf("{");
  const closeBrace = line.indexOf("}", openBrace + 1);

  if (openBrace < 0 || closeBrace < 0) {
    return null;
  }

  const values = parseLooseKeyValues(line.slice(openBrace + 1, closeBrace));
  const finishTime = parseLogTimestamp(line) ?? new Date().toISOString();
  const playTimeSeconds = parseNumberValue(values.GameTime);
  const dateTime = subtractSeconds(finishTime, playTimeSeconds);
  const resultValue = parseNumberValue(values.result);
  const hasTeammate = parseBooleanValue(values.bHasTeammate);
  const teamType = parseNumberValue(values.TeamType);

  const result: RaidResult = resultValue === 1 ? "extracted" : "dead";
  const squad: SquadType = hasTeammate || (teamType !== null && teamType > 1) ? "team" : "solo";
  const mapId = parseNumberValue(values.MapId);
  const mapUnlockId = parseNumberValue(values.MapUnlockId);
  const gameMode = parseNumberValue(values.GameMode);
  const mapInfoKey = getMapInfoKey(mapUnlockId);
  const mapInfo = mapInfoKey === null ? null : mapInfoByKey.get(mapInfoKey) ?? null;
  const mapName = mapInfo?.mapName ?? (mapId === null ? null : mapIdNames[mapId] ?? null);
  const startedAt = dateTime;
  const endedAt = finishTime;

  return {
    roomId: values.RoomId ?? null,
    basic: {
      startedAt,
      endedAt,
      dateTime,
      mapId,
      mapUnlockId,
      mapName,
      map: mapName,
      modeId: gameMode,
      mode: mapInfo?.modeName ?? null,
      zone: mapInfo?.zone ?? null,
      teamType,
      hasTeammate,
      localPlayerNickname: values.ZonePlayerName ? values.ZonePlayerName.replace(/^"|"$/g, "") : null,
      squad,
      playTimeSeconds,
      durationSeconds: playTimeSeconds,
      result,
    },
    killerName: values.MurderName ? values.MurderName.replace(/^"|"$/g, "") : null,
    killerIsAi: parseBooleanValue(values.MurderIsAI),
    killerWeaponId: parseNumberValue(values.KillerWeaponID),
  };
}
