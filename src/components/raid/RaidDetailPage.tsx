import { ArrowLeft, Clock, Crosshair, Map, Target, Trash2 } from "lucide-react";
import type { MappingResolver } from "../../data/mappingResolver";
import type { StoredRaid } from "../../db/types";
import type { Raid } from "../../types/raid";
import {
  displayValue,
  formatDuration,
  formatLongDateTime,
  formatNumber,
  formatPercent,
} from "../../utils/format";
import { ResultBadge, SquadBadge } from "../layout/StatusBadge";
import { SectionPanel } from "../layout/SectionPanel";
import { IncomingDamageList } from "./IncomingDamageList";
import { InfoGrid } from "./InfoGrid";
import { KillDetailsTable } from "./KillDetailsTable";
import { LootPanel } from "./LootPanel";
import { RankPanel } from "./RankPanel";
import { SurvivalPanel } from "./SurvivalPanel";
import { TeamPanel } from "./TeamPanel";

interface RaidDetailPageProps {
  raid: Raid | StoredRaid | null;
  mappingResolver: MappingResolver;
  onBack: () => void;
  onDelete?: (raid: StoredRaid) => void;
  onOpenMapping?: (id: string) => void;
}

export function RaidDetailPage({ raid, mappingResolver, onBack, onDelete, onOpenMapping }: RaidDetailPageProps) {
  if (!raid) {
    return (
      <SectionPanel title="Raid Detail" eyebrow="Not Found">
        <div className="flex flex-col items-start gap-3 border border-abi-line bg-abi-black p-4">
          <p className="text-sm text-abi-muted">선택한 Raid를 찾을 수 없습니다.</p>
          <button className="secondary-button" onClick={onBack}>
            <ArrowLeft size={16} aria-hidden="true" />
            Dashboard
          </button>
        </div>
      </SectionPanel>
    );
  }

  const mapName = mappingResolver.map(raid.basic.mapId, raid.basic.map);

  return (
    <div className="space-y-4">
      <section className="panel p-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <button className="icon-button shrink-0" onClick={onBack} aria-label="Back to dashboard">
              <ArrowLeft size={16} aria-hidden="true" />
            </button>
            <div className="min-w-0">
              <p className="text-[11px] uppercase text-abi-muted">{raid.id}</p>
              <h1 className="mt-1 truncate text-xl font-semibold text-abi-text">
                {displayValue(mapName)} / {displayValue(raid.basic.zone)}
              </h1>
              <div className="mt-2 flex flex-wrap gap-2">
                <ResultBadge result={raid.basic.result} />
                <SquadBadge squad={raid.basic.squad} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-right text-xs sm:min-w-[420px]">
            <div className="border border-abi-line bg-abi-black px-3 py-2">
              <div className="flex items-center justify-end gap-1 text-abi-muted">
                <Clock size={13} aria-hidden="true" />
                플레이
              </div>
              <p className="mt-1 font-mono text-lg text-abi-text">{formatDuration(raid.basic.playTimeSeconds)}</p>
            </div>
            <div className="border border-abi-line bg-abi-black px-3 py-2">
              <div className="flex items-center justify-end gap-1 text-abi-muted">
                <Crosshair size={13} aria-hidden="true" />
                PMC
              </div>
              <p className="mt-1 font-mono text-lg text-abi-amber">{formatNumber(raid.combat.pmcKills)}</p>
            </div>
            <div className="border border-abi-line bg-abi-black px-3 py-2">
              <div className="flex items-center justify-end gap-1 text-abi-muted">
                <Target size={13} aria-hidden="true" />
                AI
              </div>
              <p className="mt-1 font-mono text-lg text-abi-text">{formatNumber(raid.combat.aiKills)}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_460px]">
        <div className="space-y-4">
          <SectionPanel title="기본" eyebrow="Basic">
            <InfoGrid
              columns="four"
              items={[
                { label: "날짜/시간", value: formatLongDateTime(raid.basic.dateTime) },
                { label: "맵", value: displayValue(mapName) },
                { label: "모드", value: displayValue(raid.basic.mode) },
                { label: "구역", value: displayValue(raid.basic.zone) },
                { label: "솔로/팀", value: raid.basic.squad === "solo" ? "Solo" : "Team" },
                { label: "플레이시간", value: formatDuration(raid.basic.playTimeSeconds) },
                {
                  label: "결과",
                  value: raid.basic.result === "extracted" ? "탈출" : "사망",
                  tone: raid.basic.result === "extracted" ? "green" : "red",
                },
              ]}
            />
          </SectionPanel>

          {isStoredRaid(raid) && isDebugMode() && (
            <SectionPanel title="DB Metadata" eyebrow="Debug">
              <InfoGrid
                columns="four"
                items={[
                  { label: "Match Key", value: raid.matchKey },
                  { label: "Identity Type", value: raid.matchIdentityType },
                  { label: "Parser Version", value: raid.parserVersion },
                  { label: "Source Files", value: formatNumber(raid.sourceFileIds.length) },
                  { label: "Created", value: formatLongDateTime(raid.createdAt) },
                  { label: "Updated", value: formatLongDateTime(raid.updatedAt) },
                  { label: "Completeness", value: formatNumber(raid.completeness.score) },
                  { label: "Conflicts", value: formatNumber(raid.mergeMeta?.conflicts?.length ?? 0) },
                ]}
              />
            </SectionPanel>
          )}

          <SectionPanel title="전투" eyebrow="Combat">
            <InfoGrid
              columns="four"
              items={[
                { label: "PMC 킬", value: formatNumber(raid.combat.pmcKills), tone: "amber" },
                { label: "AI 킬", value: formatNumber(raid.combat.aiKills) },
                { label: "피해량", value: formatNumber(raid.combat.damage), tone: "lime" },
                { label: "방어구 피해", value: formatNumber(raid.combat.armorDamage) },
                { label: "명중", value: formatNumber(raid.combat.hits) },
                { label: "발사", value: formatNumber(raid.combat.shots) },
                { label: "명중률", value: formatPercent(raid.combat.accuracy) },
                { label: "연속킬", value: formatNumber(raid.combat.killStreak), tone: "green" },
              ]}
            />
          </SectionPanel>

          <SectionPanel title="킬 상세" eyebrow="Kills">
            <KillDetailsTable kills={raid.kills} mappingResolver={mappingResolver} onOpenMapping={onOpenMapping} />
          </SectionPanel>

          <SectionPanel title="받은 피해 / 사망 상세" eyebrow="Incoming Damage">
            <IncomingDamageList
              incomingDamage={raid.incomingDamage}
              death={raid.death}
              mappingResolver={mappingResolver}
              onOpenMapping={onOpenMapping}
            />
          </SectionPanel>
        </div>

        <aside className="space-y-4">
          <LootPanel loot={raid.loot} />
          <SurvivalPanel survival={raid.survival} />
          <TeamPanel team={raid.team} />
          <RankPanel rank={raid.rank} />

          {isStoredRaid(raid) && onDelete && (
            <SectionPanel title="Record Management" eyebrow="Local DB">
              <button className="secondary-button w-full justify-center border-abi-red/70 text-abi-red" onClick={() => onDelete(raid)}>
                <Trash2 size={16} aria-hidden="true" />
                기록 삭제
              </button>
            </SectionPanel>
          )}

          <SectionPanel title="Map Visualization" eyebrow="Reserved">
            <div className="flex min-h-[160px] items-center justify-center border border-abi-line bg-abi-black p-3 text-center">
              <div>
                <Map className="mx-auto text-abi-muted" size={24} aria-hidden="true" />
                <p className="mt-2 text-xs text-abi-muted">X/Y/Z 좌표 기반 시각화 영역</p>
              </div>
            </div>
          </SectionPanel>
        </aside>
      </div>
    </div>
  );
}

function isStoredRaid(raid: Raid | StoredRaid): raid is StoredRaid {
  return "matchKey" in raid;
}

function isDebugMode(): boolean {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "1";
}
