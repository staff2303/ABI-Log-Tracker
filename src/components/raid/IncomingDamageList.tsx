import { MapPinned, Skull } from "lucide-react";
import type { ReactNode } from "react";
import type { MappingResolver } from "../../data/mappingResolver";
import type { DeathDetail, IncomingDamageDetail } from "../../types/raid";
import { cn } from "../../utils/classNames";
import { displayValue, emptyValue, formatBoolean, formatId, formatNumber, formatVector } from "../../utils/format";
import { OpponentBadge, StatusBadge } from "../layout/StatusBadge";

interface IncomingDamageListProps {
  incomingDamage: IncomingDamageDetail[];
  death?: DeathDetail | null;
  mappingResolver: MappingResolver;
  onOpenMapping?: (id: string) => void;
}

export function IncomingDamageList({
  incomingDamage,
  death = null,
  mappingResolver,
  onOpenMapping,
}: IncomingDamageListProps) {
  const showDebug = isDebugMode();
  const fatalIncomingDamage = death ? findFatalIncomingDamage(incomingDamage, death) : null;
  const visibleIncomingDamage = death
    ? incomingDamage.filter((event) => !event.isFatalAttacker && event.dedupFingerprint !== fatalIncomingDamage?.dedupFingerprint)
    : incomingDamage;

  if (incomingDamage.length === 0 && !death) {
    return (
      <div className="border border-abi-line bg-abi-black px-4 py-8 text-center text-sm text-abi-muted">
        기록된 받은 피해가 없습니다.
      </div>
    );
  }

  const maxDamage = Math.max(
    ...visibleIncomingDamage.map((event) => (hasRecordedDamageMetrics(event) ? event.damage ?? 0 : 0)),
    1,
  );

  return (
    <div className="space-y-3">
      {death && (
        <DeathSummary
          death={death}
          incomingDamage={fatalIncomingDamage}
          mappingResolver={mappingResolver}
          onOpenMapping={onOpenMapping}
        />
      )}

      {visibleIncomingDamage.length > 0 && (
        <div className="grid gap-2 xl:grid-cols-2">
          {visibleIncomingDamage.map((event, index) => {
            const hasMetrics = hasRecordedDamageMetrics(event);
            const damageRatio = hasMetrics ? Math.min(100, Math.round(((event.damage ?? 0) / maxDamage) * 100)) : 0;

            return (
              <article
                key={`${event.dedupFingerprint}-${index}`}
                className={cn(
                  "border bg-abi-black p-3",
                  event.isFatalAttacker ? "border-abi-red/60" : "border-abi-line",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-semibold text-abi-text">{displayValue(event.attackerNickname)}</h3>
                      {event.isFatalAttacker && <StatusBadge tone="red">KILLER</StatusBadge>}
                      {!hasMetrics && <StatusBadge tone="amber">피해 수치 미기록</StatusBadge>}
                    </div>
                    <p className="mt-1 truncate text-[11px] text-abi-muted">
                      {hasMetrics ? "ShootEnemyEvent 피해 기록" : "공격자 식별만 기록됨"}
                    </p>
                  </div>
                  <div className={cn("text-right font-mono text-lg font-semibold", hasMetrics ? "text-abi-red" : "text-abi-muted")}>
                    {hasMetrics ? formatNumber(event.damage) : emptyValue}
                  </div>
                </div>

                <div className="mt-3 h-2 bg-abi-panel2">
                  <div className={cn("h-full", hasMetrics ? "bg-abi-red" : "bg-abi-line")} style={{ width: `${damageRatio}%` }} />
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <DetailItem label="방어구 흡수" value={formatRecordedNumber(event.armorAbsorbedDamage, hasMetrics)} />
                  <DetailItem label="관통 여부" value={formatRecordedBoolean(event.penetration, hasMetrics)} />
                  <DetailItem label="관통률" value={formatPenetrationRate(event.penetrationRate, hasMetrics)} />
                  <DetailItem
                    label="탄약/원인"
                    value={formatRecordedItemName(
                      event.deathCauserId,
                      mappingResolver.ammo(event.deathCauserId),
                      hasMetrics,
                    )}
                  />
                  <DetailItem label="DeathCauser ID" value={formatRecordedId(event.deathCauserId, hasMetrics)} />
                  <DetailItem
                    label="방어구"
                    value={formatRecordedItemName(event.armorId, mappingResolver.equipment(event.armorId), hasMetrics)}
                  />
                  <DetailItem label="방어구 ID" value={formatRecordedId(event.armorId, hasMetrics)} />
                  <DetailItem
                    label="방어구 내구도"
                    value={formatDurability(event.armorDurability, event.armorMaxDurability, hasMetrics)}
                  />
                  <DetailItem label="최종 타격" value={formatRecordedNumber(event.finalHitDamage, hasMetrics)} />
                  <DetailItem label="신체 관통" value={formatRecordedBoolean(event.bodyPenetrated, hasMetrics)} />
                </dl>

                {showDebug && (
                  <div className="mt-3 border-t border-abi-line pt-2">
                    <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                      <DetailItem label="Raw GID" value={formatId(event.attackerGidInternal)} />
                      <DetailItem
                        label="Source Range"
                        value={`${formatNumber(event.sourceRecordStart)}-${formatNumber(event.sourceRecordEnd)}`}
                      />
                      <DetailItem label="Target State" value={formatId(event.targetStateRaw)} />
                      <DetailItem label="Consumed Armor" value={formatNumber(event.consumedArmorDurability)} />
                      <DetailItem label="Last Hit Reduced" value={formatNumber(event.lastHitReducedDamage)} />
                      <DetailItem label="Arm Reduced" value={formatNumber(event.armReducedDamage)} />
                    </dl>
                    <p className="mt-2 truncate font-mono text-[11px] text-abi-muted">
                      FP {displayValue(event.dedupFingerprint)}
                    </p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DeathSummary({
  death,
  incomingDamage,
  mappingResolver,
  onOpenMapping,
}: {
  death: DeathDetail;
  incomingDamage: IncomingDamageDetail | null;
  mappingResolver: MappingResolver;
  onOpenMapping?: (id: string) => void;
}) {
  const hasIncomingMetrics = incomingDamage ? hasRecordedDamageMetrics(incomingDamage) : false;

  return (
    <article className="border border-abi-red/60 bg-abi-red/5 p-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] uppercase text-abi-red">Killed By</p>
            {death.killerType && <OpponentBadge type={death.killerType} />}
            {incomingDamage && !hasIncomingMetrics && <StatusBadge tone="amber">피해 수치 미기록</StatusBadge>}
          </div>
          <h3 className="mt-1 truncate font-mono text-2xl font-semibold text-abi-red">
            {displayValue(death.killerNickname)}
          </h3>
          <p className="mt-1 text-[11px] text-abi-muted">
            {incomingDamage
              ? hasIncomingMetrics
                ? "Death Report와 ShootEnemyEvent를 병합한 사망 기록"
                : "Death Report 사망 기록 / ShootEnemyEvent는 공격자 식별만 기록됨"
              : "Death Report 기반 사망 기록"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:min-w-[280px]">
          <DamageMetric label="Death Report 피해" value={formatNumber(death.finalDamage)} tone="red" />
          <DamageMetric
            label="ShootEnemyEvent 피해"
            value={incomingDamage && hasIncomingMetrics ? formatNumber(incomingDamage.damage) : emptyValue}
            tone={incomingDamage && hasIncomingMetrics ? "red" : "muted"}
          />
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4 xl:grid-cols-6">
        <DetailItem label="킬러 레벨" value={formatNumber(death.killerLevel)} />
        <DetailItem label="킬러 랭크" value={displayValue(death.killerRank)} />
        <DetailItem label="피격 부위" value={displayValue(mappingResolver.bodyPart(death.hitBodyPartId, death.hitBodyPart))} tone="red" />
        <DetailItem label="관통 여부" value={formatBoolean(death.penetrated)} tone={death.penetrated ? "red" : "default"} />
        <DetailItem
          label="무기"
          value={formatMappedDetailValue(death.weaponId, mappingResolver.weapon(death.weaponId, death.weapon), onOpenMapping)}
        />
        <DetailItem label="Weapon ID" value={formatId(death.weaponId)} />
        <DetailItem
          label="탄약/원인"
          value={formatMappedDetailValue(
            death.deathCauserId ?? death.ammoId,
            mappingResolver.ammo(death.deathCauserId ?? death.ammoId, death.ammoOrCause),
            onOpenMapping,
          )}
        />
        <DetailItem label="DeathCauser ID" value={formatId(death.deathCauserId)} />
        <DetailItem
          label="방어구"
          value={formatMappedDetailValue(death.armorId, mappingResolver.equipment(death.armorId, death.armor), onOpenMapping)}
        />
        <DetailItem label="Armor ID" value={formatId(death.armorId)} />
        <DetailItem
          label="방어구 내구도"
          value={`${formatNumber(death.armorDurability.beforeHit)} / ${formatNumber(
            death.armorDurability.atHit,
          )} / ${formatNumber(death.armorDurability.max)}`}
        />
        <DetailItem label="Victim" value={displayValue(death.victimName)} />
        {incomingDamage && (
          <>
            <DetailItem label="방어구 흡수" value={formatRecordedNumber(incomingDamage.armorAbsorbedDamage, hasIncomingMetrics)} />
            <DetailItem label="Shoot 관통" value={formatRecordedBoolean(incomingDamage.penetration, hasIncomingMetrics)} />
            <DetailItem label="Shoot 관통률" value={formatPenetrationRate(incomingDamage.penetrationRate, hasIncomingMetrics)} />
            <DetailItem label="Shoot 최종 타격" value={formatRecordedNumber(incomingDamage.finalHitDamage, hasIncomingMetrics)} />
          </>
        )}
        <DetailItem label="DBNO" value={formatBoolean(death.dbno)} />
        <DetailItem label="Face Hit" value={formatBoolean(death.faceHit)} tone={death.faceHit ? "red" : "default"} />
        <DetailItem label="Death Server Time" value={formatNumber(death.deathServerTime)} />
        <DetailItem label="Replay Start" value={formatNumber(death.replayDemoStartTime)} />
        <DetailItem label="Replay End" value={formatNumber(death.replayDemoEndTime)} />
      </dl>

      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        <PositionItem label="내 위치" value={formatVector(death.playerPosition)} />
        <PositionItem label="킬러 위치" value={formatVector(death.killerPosition)} />
      </div>
    </article>
  );
}

function DamageMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "red" | "muted";
}) {
  return (
    <div className="border border-abi-line bg-abi-black px-3 py-2 text-right">
      <div className="flex items-center justify-end gap-2 text-[11px] uppercase text-abi-muted">
        {label}
        {tone === "red" && <Skull size={14} aria-hidden="true" className="text-abi-red" />}
      </div>
      <p className={cn("mt-1 font-mono text-xl font-semibold", tone === "red" ? "text-abi-red" : "text-abi-muted")}>
        {value}
      </p>
    </div>
  );
}

function findFatalIncomingDamage(
  incomingDamage: IncomingDamageDetail[],
  death: DeathDetail,
): IncomingDamageDetail | null {
  return (
    incomingDamage.find((event) => event.isFatalAttacker) ??
    incomingDamage.find((event) => event.attackerNickname === death.killerNickname) ??
    null
  );
}

function PositionItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-abi-line bg-abi-black p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-abi-muted">
        <MapPinned size={14} aria-hidden="true" />
        {label}
      </div>
      <p className="font-mono text-sm text-abi-text">{value}</p>
    </div>
  );
}

function DetailItem({ label, value, tone = "default" }: { label: string; value: ReactNode; tone?: "default" | "red" }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-abi-muted">{label}</dt>
      <dd className={cn("mt-1 truncate font-mono", tone === "red" ? "text-abi-red" : "text-abi-text")}>{value}</dd>
    </div>
  );
}

function formatMappedDetailValue(
  id: string | number | null,
  name: string | null,
  onOpenMapping?: (id: string) => void,
): ReactNode {
  const idText = formatId(id);
  const isUnknown = Boolean(name?.startsWith("Unknown"));

  if (!isUnknown || idText === emptyValue) {
    return displayValue(name);
  }

  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span className="truncate">{displayValue(name)}</span>
      <span className="font-mono text-[11px] text-abi-muted">{idText}</span>
      {onOpenMapping && (
        <button
          className="border border-abi-line px-1.5 py-0.5 text-[10px] text-abi-lime hover:border-abi-olive"
          onClick={() => onOpenMapping(idText)}
        >
          매핑
        </button>
      )}
    </span>
  );
}

function isDebugMode(): boolean {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "1";
}

function hasRecordedDamageMetrics(event: IncomingDamageDetail): boolean {
  return (
    hasNonZero(event.damage) ||
    hasNonZero(event.armorAbsorbedDamage) ||
    hasNonZero(event.armorDurability) ||
    hasNonZero(event.armorMaxDurability) ||
    hasNonZero(event.penetrationRate) ||
    hasNonZero(event.finalHitDamage) ||
    hasNonZero(event.consumedArmorDurability) ||
    hasNonZero(event.lastHitReducedDamage) ||
    hasNonZero(event.armReducedDamage) ||
    event.penetration === true ||
    event.bodyPenetrated === true ||
    isMeaningfulId(event.deathCauserId) ||
    isMeaningfulId(event.armorId)
  );
}

function hasNonZero(value: number | null): boolean {
  return value !== null && value !== 0;
}

function isMeaningfulId(value: string | null): boolean {
  return value !== null && value !== "" && value !== "0";
}

function formatRecordedNumber(value: number | null, hasMetrics: boolean): string {
  return hasMetrics ? formatNumber(value) : emptyValue;
}

function formatRecordedBoolean(value: boolean | null, hasMetrics: boolean): string {
  return hasMetrics ? formatBoolean(value) : emptyValue;
}

function formatRecordedId(value: string | null, hasMetrics: boolean): string {
  return hasMetrics && isMeaningfulId(value) ? formatId(value) : emptyValue;
}

function formatRecordedItemName(id: string | null, value: string | null, hasMetrics: boolean): string {
  return hasMetrics && isMeaningfulId(id) ? displayValue(value) : emptyValue;
}

function formatPenetrationRate(value: number | null, hasMetrics: boolean): string {
  if (!hasMetrics || value === null) {
    return emptyValue;
  }

  return `${formatNumber(value)}%`;
}

function formatDurability(current: number | null, max: number | null, hasMetrics: boolean): string {
  if (!hasMetrics || (current === null && max === null) || (current === 0 && max === 0)) {
    return emptyValue;
  }

  return `${formatNumber(current)} / ${formatNumber(max)}`;
}
