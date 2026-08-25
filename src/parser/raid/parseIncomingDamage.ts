import type { IncomingDamageDetail } from "../../types/raid";
import { parseBooleanValue, parseNumberValue } from "./parseUtils";

interface IncomingDamageDraft {
  sourceRecordStart: number | null;
  sourceRecordEnd: number | null;
  attackerNickname: string | null;
  attackerGidInternal: string | null;
  deathCauserId: string | null;
  penetration: boolean | null;
  armorId: string | null;
  armorDurability: number | null;
  armorMaxDurability: number | null;
  damage: number | null;
  armorAbsorbedDamage: number | null;
  penetrationRate: number | null;
  targetStateRaw: number | null;
  bodyPenetrated: boolean | null;
  finalHitDamage: number | null;
  consumedArmorDurability: number | null;
  lastHitReducedDamage: number | null;
  armReducedDamage: number | null;
}

export class IncomingDamageCollector {
  private readonly events: IncomingDamageDetail[] = [];
  private readonly fingerprints = new Set<string>();
  private current: IncomingDamageDraft | null = null;
  private rawEventCount = 0;
  private duplicateRemovedCount = 0;

  consume(line: string, sourceRecordIndex: number): void {
    if (isParseEventStart(line)) {
      this.flushCurrent();

      if (isShootEnemyEventStart(line)) {
        this.current = createEmptyDraft(sourceRecordIndex);
      }
    }

    if (!line.includes("Parse ShootEnemyEvents")) {
      return;
    }

    if (!this.current) {
      this.current = createEmptyDraft(sourceRecordIndex);
    }

    this.current.sourceRecordEnd = sourceRecordIndex;
    applyShootEnemyField(this.current, line);
  }

  finalize(): void {
    this.flushCurrent();
  }

  getEvents(): IncomingDamageDetail[] {
    return [...this.events];
  }

  getRawEventCount(): number {
    return this.rawEventCount;
  }

  getDuplicateRemovedCount(): number {
    return this.duplicateRemovedCount;
  }

  private flushCurrent(): void {
    if (!this.current) {
      return;
    }

    const event = finalizeDraft(this.current);
    this.current = null;

    if (!event) {
      return;
    }

    this.rawEventCount += 1;

    if (this.fingerprints.has(event.dedupFingerprint)) {
      this.duplicateRemovedCount += 1;
      return;
    }

    this.fingerprints.add(event.dedupFingerprint);
    this.events.push(event);
  }
}

export function linkIncomingDamageToDeath(
  events: IncomingDamageDetail[],
  killerNickname: string | null,
  killerGid: string | null = null,
): IncomingDamageDetail[] {
  return events.map((event) => ({
    ...event,
    isFatalAttacker: isSameAttacker(event, killerNickname, killerGid),
  }));
}

function createEmptyDraft(sourceRecordIndex: number): IncomingDamageDraft {
  return {
    sourceRecordStart: sourceRecordIndex,
    sourceRecordEnd: sourceRecordIndex,
    attackerNickname: null,
    attackerGidInternal: null,
    deathCauserId: null,
    penetration: null,
    armorId: null,
    armorDurability: null,
    armorMaxDurability: null,
    damage: null,
    armorAbsorbedDamage: null,
    penetrationRate: null,
    targetStateRaw: null,
    bodyPenetrated: null,
    finalHitDamage: null,
    consumedArmorDurability: null,
    lastHitReducedDamage: null,
    armReducedDamage: null,
  };
}

function isParseEventStart(line: string): boolean {
  return line.includes("ParseEvent start, event name:");
}

function isShootEnemyEventStart(line: string): boolean {
  return /ParseEvent start, event name:ShootEnemyEventObject\b/.test(line);
}

function applyShootEnemyField(draft: IncomingDamageDraft, line: string): void {
  draft.attackerNickname ??= getShootEnemyTextValue(line, "名字");
  draft.attackerGidInternal ??= getShootEnemyTextValue(line, "gid");
  draft.deathCauserId ??= getShootEnemyTextValue(line, "DeathCauserId");
  draft.penetration ??= getShootEnemyBooleanValue(line, "是否穿透");
  draft.armorId ??= getShootEnemyTextValue(line, "护甲ID");
  draft.armorDurability ??= getShootEnemyNumberValue(line, "当前护甲耐久度");
  draft.armorMaxDurability ??= getShootEnemyNumberValue(line, "护甲最大耐久度");
  draft.damage ??= getShootEnemyNumberValue(line, "造成总伤害");
  draft.armorAbsorbedDamage ??= getShootEnemyNumberValue(line, "护甲吸收伤害");
  draft.penetrationRate ??= getShootEnemyNumberValue(line, "穿透率");
  draft.targetStateRaw ??= getShootEnemyNumberValue(line, "对方状态");
  draft.bodyPenetrated ??= getShootEnemyBooleanValue(line, "穿透身体");
  draft.finalHitDamage ??= getShootEnemyNumberValue(line, "最后一击");
  draft.consumedArmorDurability ??= getShootEnemyNumberValue(line, "cosumeArmorDurability");
  draft.lastHitReducedDamage ??= getShootEnemyNumberValue(line, "lastHitReduceDamage");
  draft.armReducedDamage ??= getShootEnemyNumberValue(line, "armReduceDamage");
}

function finalizeDraft(draft: IncomingDamageDraft): IncomingDamageDetail | null {
  if (!hasIncomingDamageData(draft)) {
    return null;
  }

  const fingerprint = createIncomingDamageFingerprint(draft);

  return {
    ...draft,
    sourceRecordEnd: draft.sourceRecordEnd ?? draft.sourceRecordStart,
    attackerType: "unknown",
    isFatalAttacker: false,
    dedupFingerprint: fingerprint,
  };
}

function hasIncomingDamageData(draft: IncomingDamageDraft): boolean {
  return (
    draft.attackerNickname !== null ||
    draft.attackerGidInternal !== null ||
    draft.deathCauserId !== null ||
    draft.damage !== null ||
    draft.armorAbsorbedDamage !== null ||
    draft.armorId !== null
  );
}

function createIncomingDamageFingerprint(draft: IncomingDamageDraft): string {
  return [
    draft.attackerGidInternal,
    draft.deathCauserId,
    draft.damage,
    draft.armorAbsorbedDamage,
    draft.armorId,
    draft.armorDurability,
    draft.armorMaxDurability,
    draft.penetration,
    draft.penetrationRate,
    draft.finalHitDamage,
    draft.consumedArmorDurability,
    draft.lastHitReducedDamage,
    draft.armReducedDamage,
  ]
    .map((value) => (value === null ? "" : String(value)))
    .join("|");
}

function getShootEnemyTextValue(line: string, label: string): string | null {
  const value = getShootEnemyRawValue(line, label);
  return value === null || value === "" || value.toLowerCase() === "nil" ? null : value;
}

function getShootEnemyNumberValue(line: string, label: string): number | null {
  return parseNumberValue(getShootEnemyRawValue(line, label) ?? undefined);
}

function getShootEnemyBooleanValue(line: string, label: string): boolean | null {
  const value = getShootEnemyRawValue(line, label);

  if (value === null) {
    return null;
  }

  return parseBooleanValue(value);
}

function getShootEnemyRawValue(line: string, label: string): string | null {
  const eventOffset = line.indexOf("Parse ShootEnemyEvents");
  const segment = eventOffset >= 0 ? line.slice(eventOffset + "Parse ShootEnemyEvents".length) : line;
  const labelOffset = segment.indexOf(label);

  if (labelOffset < 0) {
    return null;
  }

  const colonOffset = segment.indexOf(":", labelOffset + label.length);

  if (colonOffset < 0) {
    return null;
  }

  const sourceOffset = segment.indexOf(" [@", colonOffset);
  const rawValue = segment.slice(colonOffset + 1, sourceOffset >= 0 ? sourceOffset : undefined).trim();
  return rawValue === "" ? null : rawValue;
}

function isSameAttacker(event: IncomingDamageDetail, killerNickname: string | null, killerGid: string | null): boolean {
  if (killerGid && event.attackerGidInternal) {
    return event.attackerGidInternal === killerGid;
  }

  return Boolean(killerNickname && event.attackerNickname === killerNickname);
}
