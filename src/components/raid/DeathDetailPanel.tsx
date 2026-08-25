import { MapPinned, Skull } from "lucide-react";
import {
  formatAmmoDisplayName,
  formatEquipmentDisplayName,
  formatWeaponDisplayName,
} from "../../data/displayNameResolver";
import type { DeathDetail } from "../../types/raid";
import { displayValue, formatBoolean, formatId, formatNumber, formatVector } from "../../utils/format";
import { OpponentBadge } from "../layout/StatusBadge";
import { SectionPanel } from "../layout/SectionPanel";
import { InfoGrid } from "./InfoGrid";

interface DeathDetailPanelProps {
  death: DeathDetail;
}

export function DeathDetailPanel({ death }: DeathDetailPanelProps) {
  return (
    <SectionPanel title="사망 상세" eyebrow="Death Report" className="border-abi-red/60">
      <div className="border border-abi-red/60 bg-abi-red/10 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase text-abi-red">Killed By</p>
            <h3 className="mt-1 truncate font-mono text-2xl font-semibold text-abi-red">
              {displayValue(death.killerNickname)}
            </h3>
          </div>
          <Skull className="text-abi-red" size={24} aria-hidden="true" />
        </div>
      </div>

      <div className="mt-3">
        <InfoGrid
          columns="two"
          items={[
            { label: "킬러 유형", value: death.killerType ? <OpponentBadge type={death.killerType} /> : displayValue(null) },
            { label: "킬러 레벨", value: formatNumber(death.killerLevel) },
            { label: "킬러 랭크", value: displayValue(death.killerRank) },
            { label: "무기", value: displayValue(formatWeaponDisplayName(death.weaponId, death.weapon)) },
            { label: "Weapon ID", value: formatId(death.weaponId) },
            { label: "탄약/원인", value: displayValue(formatAmmoDisplayName(death.deathCauserId ?? death.ammoId, death.ammoOrCause)) },
            { label: "DeathCauser ID", value: formatId(death.deathCauserId) },
            { label: "피격 부위", value: displayValue(death.hitBodyPart), tone: "red" },
            { label: "최종 피해", value: formatNumber(death.finalDamage), tone: "red" },
            { label: "관통 여부", value: formatBoolean(death.penetrated), tone: death.penetrated ? "red" : "default" },
            { label: "방어구", value: displayValue(formatEquipmentDisplayName(death.armorId, death.armor)) },
            { label: "Face Hit", value: formatBoolean(death.faceHit), tone: death.faceHit ? "red" : "default" },
            { label: "DBNO", value: formatBoolean(death.dbno) },
            { label: "Victim", value: displayValue(death.victimName) },
            { label: "Death Server Time", value: formatNumber(death.deathServerTime) },
            { label: "Replay Start", value: formatNumber(death.replayDemoStartTime) },
            { label: "Replay End", value: formatNumber(death.replayDemoEndTime) },
            {
              label: "내구도",
              value: `${formatNumber(death.armorDurability.beforeHit)} / ${formatNumber(
                death.armorDurability.atHit,
              )} / ${formatNumber(death.armorDurability.max)}`,
            },
          ]}
        />
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        <div className="border border-abi-line bg-abi-black p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-abi-muted">
            <MapPinned size={14} aria-hidden="true" />
            내 위치
          </div>
          <p className="font-mono text-sm text-abi-text">{formatVector(death.playerPosition)}</p>
        </div>
        <div className="border border-abi-line bg-abi-black p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-abi-muted">
            <MapPinned size={14} aria-hidden="true" />
            킬러 위치
          </div>
          <p className="font-mono text-sm text-abi-text">{formatVector(death.killerPosition)}</p>
        </div>
      </div>
    </SectionPanel>
  );
}
