import type { Raid } from "../types/raid";
import type { MatchIdentityType } from "./types";

export interface RaidMatchIdentity {
  matchKey: string;
  matchIdentity: string;
  matchIdentityType: MatchIdentityType;
}

export function createRaidMatchIdentity(raid: Raid): RaidMatchIdentity {
  const roomId = extractRoomIdFromRaidId(raid);

  if (roomId) {
    const matchIdentity = `${roomId}|${raid.basic.startedAt}`;
    return {
      matchKey: `room-id:${matchIdentity}`,
      matchIdentity,
      matchIdentityType: "room-id",
    };
  }

  const matchIdentity = [
    raid.basic.startedAt,
    raid.basic.mapId ?? "",
    raid.basic.modeId ?? raid.basic.mode ?? "",
    raid.basic.zone ?? "",
    raid.basic.durationSeconds ?? raid.basic.playTimeSeconds ?? "",
  ].join("|");

  return {
    matchKey: `fallback:${matchIdentity}`,
    matchIdentity,
    matchIdentityType: "fallback",
  };
}

function extractRoomIdFromRaidId(raid: Raid): string | null {
  const dateSuffix = raid.basic.dateTime.replace(/[^A-Za-z0-9_-]+/g, "-");
  const suffix = `-${dateSuffix}`;

  if (!raid.id.endsWith(suffix)) {
    return null;
  }

  const roomId = raid.id.slice(0, -suffix.length);

  if (!roomId || roomId === "unknown-room") {
    return null;
  }

  return roomId;
}
