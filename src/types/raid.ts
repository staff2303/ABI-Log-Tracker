export type Nullable<T> = T | null;
export type GameId = string | number;

export type RaidResult = "extracted" | "dead";
export type SquadType = "solo" | "team";
export type RaidTeamType = "solo" | "team" | "unknown";
export type OpponentType = "player" | "ai" | "unknown";
export type TeamMemberStatus = "alive" | "dead" | "extracted" | "unknown";
export type KillMetricUnavailableReason = "unreliable-zero-kill-metrics";

export interface Vector3 {
  x: Nullable<number>;
  y: Nullable<number>;
  z: Nullable<number>;
}

export interface RaidBasic {
  startedAt: string;
  endedAt: string;
  dateTime: string;
  mapId: Nullable<GameId>;
  mapUnlockId: Nullable<GameId>;
  mapName: Nullable<string>;
  map: Nullable<string>;
  modeId: Nullable<GameId>;
  mode: Nullable<string>;
  zone: Nullable<string>;
  teamType: Nullable<GameId>;
  hasTeammate: Nullable<boolean>;
  localPlayerNickname: Nullable<string>;
  squad: SquadType;
  playTimeSeconds: Nullable<number>;
  durationSeconds: Nullable<number>;
  result: RaidResult;
}

export interface RaidCombat {
  pmcKills: Nullable<number>;
  aiKills: Nullable<number>;
  damage: Nullable<number>;
  armorDamage: Nullable<number>;
  hits: Nullable<number>;
  shots: Nullable<number>;
  accuracy: Nullable<number>;
  killStreak: Nullable<number>;
}

export interface KillDetail {
  sourceRecordIndex: Nullable<number>;
  time: string;
  killTimestamp: Nullable<number>;
  enemyGid: Nullable<string>;
  opponentNickname: string;
  opponentType: OpponentType;
  enemyIdentity: Nullable<number>;
  weaponId: Nullable<GameId>;
  weaponName: Nullable<string>;
  weapon: Nullable<string>;
  hitBodyPartId: Nullable<GameId>;
  bodyPartName: Nullable<string>;
  bodyPart: Nullable<string>;
  opponentLevel: Nullable<number>;
  opponentRankLevel: Nullable<number>;
  opponentRank: Nullable<string>;
  opponentRankScore: Nullable<number>;
  damage: Nullable<number>;
  armorDamage: Nullable<number>;
  hitCount: Nullable<number>;
  rawDamage: Nullable<number>;
  rawArmorDamage: Nullable<number>;
  rawHitCount: Nullable<number>;
  combatMetricsUnavailableReason: Nullable<KillMetricUnavailableReason>;
  armorId: Nullable<GameId>;
  armorName: Nullable<string>;
  opponentArmor: Nullable<string>;
  opponentValue: Nullable<number>;
  opponentGearValue: Nullable<number>;
  rankScoreGained: Nullable<number>;
  deathType: Nullable<number>;
}

export interface IncomingDamageDetail {
  sourceRecordStart: Nullable<number>;
  sourceRecordEnd: Nullable<number>;
  attackerNickname: Nullable<string>;
  attackerGidInternal: Nullable<string>;
  attackerType: OpponentType;
  deathCauserId: Nullable<string>;
  penetration: Nullable<boolean>;
  armorId: Nullable<string>;
  armorDurability: Nullable<number>;
  armorMaxDurability: Nullable<number>;
  damage: Nullable<number>;
  armorAbsorbedDamage: Nullable<number>;
  penetrationRate: Nullable<number>;
  targetStateRaw: Nullable<number>;
  bodyPenetrated: Nullable<boolean>;
  finalHitDamage: Nullable<number>;
  consumedArmorDurability: Nullable<number>;
  lastHitReducedDamage: Nullable<number>;
  armReducedDamage: Nullable<number>;
  isFatalAttacker: boolean;
  dedupFingerprint: string;
}

export interface ArmorDurability {
  beforeHit: Nullable<number>;
  atHit: Nullable<number>;
  max: Nullable<number>;
}

export interface DeathDetail {
  victimName: Nullable<string>;
  killerNickname: Nullable<string>;
  killerType: Nullable<OpponentType>;
  killerLevel: Nullable<number>;
  killerRank: Nullable<string>;
  weaponId: Nullable<GameId>;
  weaponName: Nullable<string>;
  weapon: Nullable<string>;
  deathCauserId: Nullable<GameId>;
  ammoId: Nullable<GameId>;
  ammoName: Nullable<string>;
  ammoOrCause: Nullable<string>;
  hitBodyPartId: Nullable<GameId>;
  hitBodyPartName: Nullable<string>;
  hitBodyPart: Nullable<string>;
  finalDamage: Nullable<number>;
  penetrated: Nullable<boolean>;
  armorId: Nullable<GameId>;
  armorName: Nullable<string>;
  armor: Nullable<string>;
  armorDurability: ArmorDurability;
  faceHit: Nullable<boolean>;
  dbno: Nullable<boolean>;
  playerPosition: Nullable<Vector3>;
  killerPosition: Nullable<Vector3>;
  deathServerTime: Nullable<number>;
  replayDemoStartTime: Nullable<number>;
  replayDemoEndTime: Nullable<number>;
}

export interface LootDetail {
  extractedValue: Nullable<number>;
  itemsFound: Nullable<number>;
  weaponsFound: Nullable<number>;
  attachmentsFound: Nullable<number>;
  gearFound: Nullable<number>;
  containers: Nullable<number>;
  premiumContainers: Nullable<number>;
  xpFromLooting: Nullable<number>;
  xpFromUnlocking: Nullable<number>;
  extractionXp: Nullable<number>;
}

export interface SurvivalDetail {
  hpLoss: Nullable<number>;
  healingDone: Nullable<number>;
  fractures: Nullable<number>;
  debuffs: Nullable<number>;
  foodDrinksConsumed: Nullable<number>;
  distanceMeters: Nullable<number>;
  falls: Nullable<number>;
  teammatesRescued: Nullable<number>;
  timesRescued: Nullable<number>;
  supportActions: Nullable<number>;
}

export interface TeamMember {
  nickname: Nullable<string>;
  status: TeamMemberStatus;
}

export interface TeamDetail {
  type: RaidTeamType;
  isTeam: boolean;
  memberCount: Nullable<number>;
  members: TeamMember[];
  localPlayerNickname: Nullable<string>;
  resolution: Nullable<string>;
  teammateRescues: Nullable<number>;
  rescuedByTeammate: Nullable<number>;
  supportActions: Nullable<number>;
}

export interface RankDetail {
  previousRank: Nullable<string>;
  nextRank: Nullable<string>;
  previousRankLevel: Nullable<number>;
  nextRankLevel: Nullable<number>;
  previousScore: Nullable<number>;
  nextScore: Nullable<number>;
  rawScoreDelta: Nullable<number>;
  delta: Nullable<number>;
  pointsPerRankLevel: Nullable<number>;
}

export interface Raid {
  id: string;
  basic: RaidBasic;
  combat: RaidCombat;
  kills: KillDetail[];
  incomingDamage: IncomingDamageDetail[];
  death: Nullable<DeathDetail>;
  loot: LootDetail;
  survival: SurvivalDetail;
  team: TeamDetail;
  rank: Nullable<RankDetail>;
}
