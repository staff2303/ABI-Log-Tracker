import type { IncomingDamageDetail } from "../../types/raid";
import { formatAmmoDisplayName, formatEquipmentDisplayName } from "../../data/displayNameResolver";
import { cn } from "../../utils/classNames";
import { displayValue, emptyValue, formatBoolean, formatId, formatNumber } from "../../utils/format";
import { StatusBadge } from "../layout/StatusBadge";

interface IncomingDamageListProps {
  incomingDamage: IncomingDamageDetail[];
}

export function IncomingDamageList({ incomingDamage }: IncomingDamageListProps) {
  const showDebug = isDebugMode();

  if (incomingDamage.length === 0) {
    return (
      <div className="border border-abi-line bg-abi-black px-4 py-8 text-center text-sm text-abi-muted">
        기록된 받은 피해가 없습니다.
      </div>
    );
  }

  const maxDamage = Math.max(...incomingDamage.map((event) => (hasRecordedDamageMetrics(event) ? event.damage ?? 0 : 0)), 1);

  return (
    <div className="grid gap-2 xl:grid-cols-2">
      {incomingDamage.map((event, index) => {
        const hasMetrics = hasRecordedDamageMetrics(event);
        const damageRatio = hasMetrics ? Math.min(100, Math.round(((event.damage ?? 0) / maxDamage) * 100)) : 0;

        return (
          <article key={`${event.dedupFingerprint}-${index}`} className="border border-abi-line bg-abi-black p-3">
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
                value={formatRecordedItemName(event.deathCauserId, formatAmmoDisplayName(event.deathCauserId), hasMetrics)}
              />
              <DetailItem label="DeathCauser ID" value={formatRecordedId(event.deathCauserId, hasMetrics)} />
              <DetailItem
                label="방어구"
                value={formatRecordedItemName(event.armorId, formatEquipmentDisplayName(event.armorId), hasMetrics)}
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
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-abi-muted">{label}</dt>
      <dd className="mt-1 truncate font-mono text-abi-text">{value}</dd>
    </div>
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
