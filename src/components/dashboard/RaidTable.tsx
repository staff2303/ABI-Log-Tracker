import { ChevronRight } from "lucide-react";
import { formatMapDisplayName } from "../../data/displayNameResolver";
import type { Raid } from "../../types/raid";
import { emptyValue, formatDateTime, formatDuration, formatLootValue, formatNumber, formatPercent } from "../../utils/format";
import { OpponentBadge, ResultBadge, SquadBadge } from "../layout/StatusBadge";

interface RaidTableProps {
  raids: Raid[];
  onRaidSelect: (raidId: string) => void;
}

export function RaidTable({ raids, onRaidSelect }: RaidTableProps) {
  if (raids.length === 0) {
    return (
      <div className="border border-abi-line bg-abi-black px-4 py-10 text-center text-sm text-abi-muted">
        표시할 Raid가 없습니다.
      </div>
    );
  }

  return (
    <div className="thin-scrollbar overflow-x-auto">
      <table className="min-w-[1180px] w-full border-collapse">
        <thead>
          <tr>
            <th className="table-head">시간</th>
            <th className="table-head">맵</th>
            <th className="table-head">모드</th>
            <th className="table-head">구역</th>
            <th className="table-head">결과</th>
            <th className="table-head">스쿼드</th>
            <th className="table-head text-right">플레이</th>
            <th className="table-head text-right">PMC</th>
            <th className="table-head text-right">AI</th>
            <th className="table-head text-right">피해</th>
            <th className="table-head text-right">명중률</th>
            <th className="table-head text-right">반출 가치</th>
            <th className="table-head text-right">Rank</th>
            <th className="table-head"></th>
          </tr>
        </thead>
        <tbody>
          {raids.map((raid) => {
            const mapName = formatMapDisplayName(raid.basic.mapId, raid.basic.map);

            return (
              <tr
                key={raid.id}
                className="group bg-abi-panel transition hover:bg-abi-panel2"
                tabIndex={0}
                onClick={() => onRaidSelect(raid.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    onRaidSelect(raid.id);
                  }
                }}
              >
                <td className="table-cell font-mono">{formatDateTime(raid.basic.dateTime)}</td>
                <td className="table-cell font-semibold">{mapName ?? emptyValue}</td>
              <td className="table-cell">{raid.basic.mode ?? emptyValue}</td>
              <td className="table-cell">{raid.basic.zone ?? emptyValue}</td>
              <td className="table-cell">
                <ResultBadge result={raid.basic.result} />
              </td>
              <td className="table-cell">
                <SquadBadge squad={raid.basic.squad} />
              </td>
              <td className="table-cell text-right font-mono">{formatDuration(raid.basic.playTimeSeconds)}</td>
              <td className="table-cell text-right font-mono text-abi-amber">
                {formatNumber(raid.combat.pmcKills)}
              </td>
              <td className="table-cell text-right font-mono">
                <span className="inline-flex items-center gap-1">
                  {formatNumber(raid.combat.aiKills)}
                  {(raid.combat.aiKills ?? 0) >= 8 && <OpponentBadge type="ai" />}
                </span>
              </td>
              <td className="table-cell text-right font-mono">{formatNumber(raid.combat.damage)}</td>
              <td className="table-cell text-right font-mono">{formatPercent(raid.combat.accuracy)}</td>
              <td className="table-cell text-right font-mono text-abi-lime">{formatLootValue(raid.loot.extractedValue)}</td>
              <td className="table-cell text-right font-mono">
                {raid.rank && raid.rank.delta !== null ? `${raid.rank.delta > 0 ? "+" : ""}${raid.rank.delta}` : emptyValue}
              </td>
                <td className="table-cell text-right">
                  <ChevronRight className="ml-auto text-abi-muted transition group-hover:text-abi-lime" size={16} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
