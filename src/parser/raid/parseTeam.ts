import type { RaidBasic, RaidTeamType, SurvivalDetail, TeamDetail, TeamMember } from "../../types/raid";
import { parseLogTimestamp } from "./parseUtils";

export interface TeamSnapshotEvent {
  timestamp: string;
  memberName: string | null;
  expectedCount: number | null;
}

export interface TeamSnapshot {
  timestamp: string;
  memberNames: string[];
  expectedCount: number | null;
}

export interface TeamResolution {
  type: RaidTeamType;
  memberCount: number | null;
  members: TeamMember[];
  resolution: string | null;
}

export function parseTeamSnapshotEvent(line: string): TeamSnapshotEvent | null {
  if (!line.includes("ASGTeamInfo:OnRep_")) {
    return null;
  }

  const timestamp = parseLogTimestamp(line);

  if (!timestamp) {
    return null;
  }

  const memberMatch = line.match(/ASGTeamInfo:OnRep_TeamMemberPlayerState----Member Name:\s*(.+)$/);

  if (memberMatch) {
    const memberName = memberMatch[1].split("[@")[0].trim();

    return memberName === "" ? null : { timestamp, memberName, expectedCount: null };
  }

  const countMatch = line.match(
    /ASGTeamInfo:OnRep_InBattleTeamMemberPlayerStates----\d+,\s*InBattleTeamMemberPlayerStates\.Num:\s*(\d+)/,
  );

  if (countMatch) {
    const expectedCount = Number(countMatch[1]);
    return Number.isFinite(expectedCount) ? { timestamp, memberName: null, expectedCount } : null;
  }

  return null;
}

export function mergeTeamSnapshotEvent(
  snapshotsByTimestamp: Map<string, TeamSnapshot>,
  event: TeamSnapshotEvent,
): void {
  const snapshot = snapshotsByTimestamp.get(event.timestamp) ?? {
    timestamp: event.timestamp,
    memberNames: [],
    expectedCount: null,
  };

  if (event.memberName && !snapshot.memberNames.includes(event.memberName)) {
    snapshot.memberNames.push(event.memberName);
  }

  if (event.expectedCount !== null) {
    snapshot.expectedCount = event.expectedCount;
  }

  snapshotsByTimestamp.set(event.timestamp, snapshot);
}

export function resolveTeamForBasic(basic: RaidBasic, snapshots: readonly TeamSnapshot[]): TeamResolution {
  const matchedSnapshot = basic.localPlayerNickname
    ? findMatchingSnapshot(basic, snapshots, basic.localPlayerNickname)
    : null;

  if (matchedSnapshot && (matchedSnapshot.memberNames.length > 1 || basic.hasTeammate !== true)) {
    const members = matchedSnapshot.memberNames
      .filter((nickname) => nickname !== basic.localPlayerNickname)
      .map((nickname) => ({ nickname, status: "unknown" as const }));
    const type: RaidTeamType = matchedSnapshot.memberNames.length > 1 ? "team" : "solo";

    return {
      type,
      memberCount: matchedSnapshot.memberNames.length,
      members,
      resolution: `ASGTeamInfo snapshot ${matchedSnapshot.timestamp} includes local player`,
    };
  }

  const numericTeamType = basic.teamType === null ? null : Number(basic.teamType);

  if (
    basic.hasTeammate === true ||
    basic.squad === "team" ||
    (numericTeamType !== null && Number.isFinite(numericTeamType) && numericTeamType > 1)
  ) {
    return {
      type: "team",
      memberCount: null,
      members: [],
      resolution: `Result block only: bHasTeammate=${String(basic.hasTeammate)}, TeamType=${String(basic.teamType)}`,
    };
  }

  if (basic.hasTeammate === false || basic.squad === "solo") {
    return {
      type: "solo",
      memberCount: 1,
      members: [],
      resolution: `Result block solo: bHasTeammate=${String(basic.hasTeammate)}, TeamType=${String(basic.teamType)}`,
    };
  }

  return {
    type: "unknown",
    memberCount: null,
    members: [],
    resolution: "No local-player team chain found",
  };
}

export function createTeamDetail(
  basic: RaidBasic,
  survival: SurvivalDetail,
  resolution: TeamResolution,
): TeamDetail {
  return {
    type: resolution.type,
    isTeam: resolution.type === "team",
    memberCount: resolution.memberCount,
    members: resolution.members,
    localPlayerNickname: basic.localPlayerNickname,
    resolution: resolution.resolution,
    teammateRescues: survival.teammatesRescued,
    rescuedByTeammate: survival.timesRescued,
    supportActions: survival.supportActions,
  };
}

function findMatchingSnapshot(
  basic: RaidBasic,
  snapshots: readonly TeamSnapshot[],
  localPlayerNickname: string,
): TeamSnapshot | null {
  const startMs = new Date(basic.startedAt).getTime() - 90_000;
  const endMs = new Date(basic.endedAt).getTime() + 5_000;

  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return null;
  }

  return (
    snapshots
      .filter((snapshot) => {
        const timeMs = new Date(snapshot.timestamp).getTime();
        return (
          !Number.isNaN(timeMs) &&
          timeMs >= startMs &&
          timeMs <= endMs &&
          snapshot.memberNames.includes(localPlayerNickname)
        );
      })
      .sort((left, right) => scoreSnapshot(right) - scoreSnapshot(left))[0] ?? null
  );
}

function scoreSnapshot(snapshot: TeamSnapshot): number {
  const timeMs = new Date(snapshot.timestamp).getTime();
  const countScore = snapshot.memberNames.length * 20;
  const teamScore = snapshot.memberNames.length > 1 ? 30 : 0;
  const expectedScore = snapshot.expectedCount === snapshot.memberNames.length ? 5 : 0;
  const recencyScore = Number.isNaN(timeMs) ? 0 : Math.floor(timeMs / 1000) / 1_000_000_000;

  return countScore + teamScore + expectedScore + recencyScore;
}
