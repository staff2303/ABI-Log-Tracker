import type { EngagementDetail } from "../../types/raid";
import { displayValue, formatNumber } from "../../utils/format";
import { OpponentBadge, StatusBadge } from "../layout/StatusBadge";

interface EngagementListProps {
  engagements: EngagementDetail[];
}

export function EngagementList({ engagements }: EngagementListProps) {
  if (engagements.length === 0) {
    return (
      <div className="border border-abi-line bg-abi-black px-4 py-8 text-center text-sm text-abi-muted">
        No engagements recorded.
      </div>
    );
  }

  const maxDamage = Math.max(...engagements.map((engagement) => engagement.damage ?? 0), 1);

  return (
    <div className="grid gap-2 xl:grid-cols-2">
      {engagements.map((engagement, index) => {
        const damageRatio = Math.min(100, Math.round(((engagement.damage ?? 0) / maxDamage) * 100));

        return (
          <article key={`${engagement.opponentGid ?? engagement.opponentNickname}-${index}`} className="border border-abi-line bg-abi-black p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-abi-text">{engagement.opponentNickname}</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  <OpponentBadge type={engagement.opponentType} />
                  <StatusBadge tone={engagement.killed ? "green" : "amber"}>
                    {engagement.killed ? "Killed" : "Not Killed"}
                  </StatusBadge>
                </div>
              </div>
              <div className="text-right font-mono text-lg font-semibold text-abi-lime">
                {formatNumber(engagement.damage)}
              </div>
            </div>

            <div className="mt-3 h-2 bg-abi-panel2">
              <div className="h-full bg-abi-olive" style={{ width: `${damageRatio}%` }} />
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div>
                <dt className="text-abi-muted">Armor Damage</dt>
                <dd className="mt-1 font-mono text-abi-text">{formatNumber(engagement.armorDamage)}</dd>
              </div>
              <div>
                <dt className="text-abi-muted">Hits</dt>
                <dd className="mt-1 font-mono text-abi-text">{formatNumber(engagement.hitCount)}</dd>
              </div>
              <div>
                <dt className="text-abi-muted">Penetrations</dt>
                <dd className="mt-1 font-mono text-abi-text">{formatNumber(engagement.penetrationCount)}</dd>
              </div>
              <div>
                <dt className="text-abi-muted">Weapon / Ammo</dt>
                <dd className="mt-1 truncate text-abi-text">
                  {displayValue(engagement.weaponName ?? (engagement.weaponsAmmo.join(", ") || null))}
                </dd>
              </div>
              <div>
                <dt className="text-abi-muted">GID</dt>
                <dd className="mt-1 truncate font-mono text-abi-text">{displayValue(engagement.opponentGid)}</dd>
              </div>
              <div>
                <dt className="text-abi-muted">Ammo</dt>
                <dd className="mt-1 truncate text-abi-text">
                  {displayValue(engagement.ammoName ?? (engagement.ammoId === null ? null : `ammoId ${engagement.ammoId}`))}
                </dd>
              </div>
            </dl>
          </article>
        );
      })}
    </div>
  );
}
