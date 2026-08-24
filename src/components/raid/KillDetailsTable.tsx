import type { KillDetail } from "../../types/raid";
import { displayValue, emptyValue, formatLootValue, formatNumber } from "../../utils/format";
import { OpponentBadge } from "../layout/StatusBadge";

interface KillDetailsTableProps {
  kills: KillDetail[];
}

export function KillDetailsTable({ kills }: KillDetailsTableProps) {
  if (kills.length === 0) {
    return (
      <div className="border border-abi-line bg-abi-black px-4 py-8 text-center text-sm text-abi-muted">
        기록된 처치가 없습니다.
      </div>
    );
  }

  return (
    <div className="thin-scrollbar overflow-x-auto">
      <table className="min-w-[1320px] w-full border-collapse">
        <thead>
          <tr>
            <th className="table-head">시간</th>
            <th className="table-head">상대 닉네임</th>
            <th className="table-head">유형</th>
            <th className="table-head">무기</th>
            <th className="table-head">부위</th>
            <th className="table-head text-right">레벨</th>
            <th className="table-head">랭크</th>
            <th className="table-head text-right">피해</th>
            <th className="table-head text-right">방어구 피해</th>
            <th className="table-head text-right">명중</th>
            <th className="table-head">상대 방어구</th>
            <th className="table-head text-right">총 가치</th>
            <th className="table-head text-right">장비가치</th>
            <th className="table-head text-right">랭크 점수</th>
            <th className="table-head text-right">Death Type</th>
          </tr>
        </thead>
        <tbody>
          {kills.map((kill, index) => (
            <tr key={`${kill.time}-${kill.opponentNickname}-${index}`} className="bg-abi-panel">
              <td className="table-cell font-mono">{kill.time}</td>
              <td className="table-cell font-semibold">{kill.opponentNickname}</td>
              <td className="table-cell">
                <OpponentBadge type={kill.opponentType} />
              </td>
              <td className="table-cell">{displayValue(kill.weapon)}</td>
              <td className="table-cell">{displayValue(kill.bodyPart)}</td>
              <td className="table-cell text-right font-mono">{formatNumber(kill.opponentLevel)}</td>
              <td className="table-cell">{displayValue(kill.opponentRank)}</td>
              <td className="table-cell text-right font-mono">{formatNumber(kill.damage)}</td>
              <td className="table-cell text-right font-mono">{formatNumber(kill.armorDamage)}</td>
              <td className="table-cell text-right font-mono">{formatNumber(kill.hitCount)}</td>
              <td className="table-cell">{displayValue(kill.opponentArmor)}</td>
              <td className="table-cell text-right font-mono">{formatLootValue(kill.opponentValue)}</td>
              <td className="table-cell text-right font-mono">{formatLootValue(kill.opponentGearValue)}</td>
              <td className="table-cell text-right font-mono">
                {kill.rankScoreGained === null ? emptyValue : `+${kill.rankScoreGained}`}
              </td>
              <td className="table-cell text-right font-mono">{formatNumber(kill.deathType)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
