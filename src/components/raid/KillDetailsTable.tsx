import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useState } from "react";
import type { ReactNode } from "react";
import { formatEquipmentDisplayName, formatWeaponDisplayName } from "../../data/displayNameResolver";
import type { KillDetail } from "../../types/raid";
import { displayValue, emptyValue, formatId, formatLootValue, formatNumber } from "../../utils/format";
import { OpponentBadge } from "../layout/StatusBadge";

interface KillDetailsTableProps {
  kills: KillDetail[];
}

export function KillDetailsTable({ kills }: KillDetailsTableProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  if (kills.length === 0) {
    return (
      <div className="border border-abi-line bg-abi-black px-4 py-8 text-center text-sm text-abi-muted">
        기록된 처치가 없습니다.
      </div>
    );
  }

  return (
    <div className="thin-scrollbar overflow-x-auto">
      <table className="min-w-[980px] w-full border-collapse">
        <thead>
          <tr>
            <th className="table-head w-24">시간</th>
            <th className="table-head">상대 닉네임</th>
            <th className="table-head w-24">유형</th>
            <th className="table-head">무기</th>
            <th className="table-head">부위</th>
            <th className="table-head text-right">피해</th>
            <th className="table-head text-right">방어구 피해</th>
            <th className="table-head text-right">상대 장비가치</th>
          </tr>
        </thead>
        <tbody>
          {kills.map((kill, index) => {
            const key = `${kill.sourceRecordIndex ?? kill.time}-${kill.opponentNickname}-${index}`;
            const expanded = expandedKey === key;

            return (
              <Fragment key={key}>
                <tr
                  className="cursor-pointer bg-abi-panel transition hover:bg-abi-panel2"
                  tabIndex={0}
                  onClick={() => setExpandedKey(expanded ? null : key)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setExpandedKey(expanded ? null : key);
                    }
                  }}
                >
                  <td className="table-cell font-mono">
                    <span className="inline-flex items-center gap-2">
                      {expanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
                      {kill.time}
                    </span>
                  </td>
                  <td className="table-cell max-w-52 truncate font-semibold">{kill.opponentNickname}</td>
                  <td className="table-cell">
                    <OpponentBadge type={kill.opponentType} />
                  </td>
                  <td className="table-cell max-w-56 truncate">{displayValue(formatWeaponDisplayName(kill.weaponId, kill.weapon))}</td>
                  <td className="table-cell max-w-40 truncate">{displayValue(kill.bodyPart)}</td>
                  <td className="table-cell text-right font-mono">{formatNumber(kill.damage)}</td>
                  <td className="table-cell text-right font-mono">{formatNumber(kill.armorDamage)}</td>
                  <td className="table-cell text-right font-mono text-abi-lime">{formatLootValue(kill.opponentGearValue)}</td>
                </tr>

                {expanded && (
                  <tr className="bg-abi-black">
                    <td colSpan={8} className="border-b border-abi-line px-3 py-3">
                      <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
                        <DetailItem label="상대 레벨" value={formatNumber(kill.opponentLevel)} />
                        <DetailItem label="상대 랭크" value={displayValue(kill.opponentRank)} />
                        <DetailItem label="Rank Level" value={formatNumber(kill.opponentRankLevel)} />
                        <DetailItem label="Rank Score" value={formatNumber(kill.opponentRankScore)} />
                        <DetailItem label="Weapon ID" value={formatId(kill.weaponId)} />
                        <DetailItem label="Armor ID" value={formatId(kill.armorId)} />
                        <DetailItem label="Body Part ID" value={formatId(kill.hitBodyPartId)} />
                        <DetailItem label="Hit Count" value={formatNumber(kill.hitCount)} />
                        <DetailItem label="Raw Damage" value={formatNumber(kill.rawDamage)} />
                        <DetailItem label="Raw Armor Damage" value={formatNumber(kill.rawArmorDamage)} />
                        <DetailItem label="Raw Hit Count" value={formatNumber(kill.rawHitCount)} />
                        <DetailItem label="Metric Reason" value={displayValue(kill.combatMetricsUnavailableReason)} />
                        <DetailItem
                          label="addRankedScore"
                          value={kill.rankScoreGained === null ? emptyValue : `+${formatNumber(kill.rankScoreGained)}`}
                        />
                        <DetailItem label="deathType" value={formatId(kill.deathType)} />
                        <DetailItem label="Enemy GID" value={displayValue(kill.enemyGid)} />
                        <DetailItem label="Enemy Identity" value={formatId(kill.enemyIdentity)} />
                        <DetailItem label="Kill Timestamp" value={formatId(kill.killTimestamp)} />
                        <DetailItem label="Source Record" value={formatNumber(kill.sourceRecordIndex)} />
                        <DetailItem label="Armor" value={displayValue(formatEquipmentDisplayName(kill.armorId, kill.opponentArmor))} />
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 border border-abi-line bg-abi-panel px-3 py-2">
      <p className="truncate text-[11px] uppercase text-abi-muted">{label}</p>
      <p className="mt-1 truncate font-mono text-abi-text">{value}</p>
    </div>
  );
}
