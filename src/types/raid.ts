export type Nullable<T> = T | null;

export type RaidResult = "extracted" | "dead";
export type SquadType = "solo" | "team";
export type RaidTeamType = "solo" | "team" | "unknown";
export type OpponentType = "player" | "ai" | "unknown";
export type TeamMemberStatus = "alive" | "dead" | "extracted" | "unknown";

export interface Vector3 {
  x: Nullable<number>;
  y: Nullable<number>;
  z: Nullable<number>;
}

export interface RaidBasic {
  startedAt: string;
  endedAt: string;
  dateTime: string;
  mapId: Nullable<number>;
  mapUnlockId: Nullable<number>;
  mapName: Nullable<string>;
  map: Nullable<string>;
  modeId: Nullable<number>;
  mode: Nullable<string>;
  zone: Nullable<string>;
  teamType: Nullable<number>;
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
  weaponId: Nullable<number>;
  weaponName: Nullable<string>;
  weapon: Nullable<string>;
  hitBodyPartId: Nullable<number>;
  bodyPartName: Nullable<string>;
  bodyPart: Nullable<string>;
  opponentLevel: Nullable<number>;
  opponentRankLevel: Nullable<number>;
  opponentRank: Nullable<string>;
  opponentRankScore: Nullable<number>;
  damage: Nullable<number>;
  armorDamage: Nullable<number>;
  hitCount: Nullable<number>;
  armorId: Nullable<number>;
  armorName: Nullable<string>;
  opponentArmor: Nullable<string>;
  opponentValue: Nullable<number>;
  opponentGearValue: Nullable<number>;
  rankScoreGained: Nullable<number>;
  deathType: Nullable<number>;
}

export interface EngagementDetail {
  opponentGid: Nullable<string>;
  opponentNickname: string;
  opponentType: OpponentType;
  damage: Nullable<number>;
  armorDamage: Nullable<number>;
  hitCount: Nullable<number>;
  penetrationCount: Nullable<number>;
  weaponId: Nullable<number>;
  weaponName: Nullable<string>;
  weaponIds: number[];
  ammoId: Nullable<number>;
  ammoName: Nullable<string>;
  ammoIds: number[];
  weaponsAmmo: string[];
  killed: boolean;
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
  weaponId: Nullable<number>;
  weaponName: Nullable<string>;
  weapon: Nullable<string>;
  deathCauserId: Nullable<number>;
  ammoId: Nullable<number>;
  ammoName: Nullable<string>;
  ammoOrCause: Nullable<string>;
  hitBodyPartId: Nullable<number>;
  hitBodyPartName: Nullable<string>;
  hitBodyPart: Nullable<string>;
  finalDamage: Nullable<number>;
  penetrated: Nullable<boolean>;
  armorId: Nullable<number>;
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
  previousScore: Nullable<number>;
  nextScore: Nullable<number>;
  delta: Nullable<number>;
}

export interface Raid {
  id: string;
  basic: RaidBasic;
  combat: RaidCombat;
  kills: KillDetail[];
  engagements: EngagementDetail[];
  death: Nullable<DeathDetail>;
  loot: LootDetail;
  survival: SurvivalDetail;
  team: TeamDetail;
  rank: Nullable<RankDetail>;
}
