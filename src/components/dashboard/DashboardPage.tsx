import { useMemo, useState } from "react";
import type { MappingResolver } from "../../data/mappingResolver";
import type { ParserDebugInfo } from "../../types/parser";
import type { Raid } from "../../types/raid";
import {
  calculateDashboardStats,
  defaultFilters,
  filterRaids,
  getUniqueOptions,
  type RaidFilters,
} from "../../utils/stats";
import { SectionPanel } from "../layout/SectionPanel";
import { FilterBar } from "./FilterBar";
import { RaidTable } from "./RaidTable";
import { SummaryGrid } from "./SummaryGrid";
import { ParserDebugPanel } from "./ParserDebugPanel";
import type { StreamingDecoderStats } from "../../types/streamDecoder";

interface DashboardPageProps {
  raids: Raid[];
  debugInfo: ParserDebugInfo | null;
  decoderStats: StreamingDecoderStats | null;
  mappingResolver: MappingResolver;
  onRaidSelect: (raidId: string) => void;
}

function isDebugMode(): boolean {
  return new URLSearchParams(window.location.search).get("debug") === "1";
}

export function DashboardPage({
  raids,
  debugInfo,
  decoderStats,
  mappingResolver,
  onRaidSelect,
}: DashboardPageProps) {
  const [filters, setFilters] = useState<RaidFilters>(defaultFilters);
  const resolveMapName = useMemo(
    () => (raid: Raid) => mappingResolver.map(raid.basic.mapId, raid.basic.map),
    [mappingResolver],
  );

  const filteredRaids = useMemo(() => {
    return filterRaids(raids, filters, resolveMapName).sort(
      (a, b) => new Date(b.basic.dateTime).getTime() - new Date(a.basic.dateTime).getTime(),
    );
  }, [filters, raids, resolveMapName]);

  const stats = useMemo(() => calculateDashboardStats(filteredRaids), [filteredRaids]);
  const maps = useMemo(() => getUniqueOptions(raids, resolveMapName), [raids, resolveMapName]);
  const modes = useMemo(() => getUniqueOptions(raids, (raid) => raid.basic.mode), [raids]);
  const zones = useMemo(() => getUniqueOptions(raids, (raid) => raid.basic.zone), [raids]);

  return (
    <div className="space-y-4">
      <section className="panel p-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] uppercase text-abi-muted">Local SQLite</p>
            <h1 className="mt-1 text-xl font-semibold text-abi-text">Cumulative Dashboard</h1>
          </div>
          <div className="grid grid-cols-3 gap-2 text-right text-xs sm:min-w-[360px]">
            <div className="border border-abi-line bg-abi-black px-3 py-2">
              <p className="text-abi-muted">Filtered</p>
              <p className="font-mono text-lg text-abi-lime">{filteredRaids.length}</p>
            </div>
            <div className="border border-abi-line bg-abi-black px-3 py-2">
              <p className="text-abi-muted">Source</p>
              <p className="font-mono text-lg text-abi-text">{raids.length}</p>
            </div>
            <div className="border border-abi-line bg-abi-black px-3 py-2">
              <p className="text-abi-muted">Parser</p>
              <p className="font-mono text-lg text-abi-amber">{decoderStats ? "Stored" : "Idle"}</p>
            </div>
          </div>
        </div>
      </section>

      <SectionPanel title="Filters" eyebrow="Scope">
        <FilterBar filters={filters} maps={maps} modes={modes} zones={zones} onChange={setFilters} />
      </SectionPanel>

      <SummaryGrid stats={stats} />

      <SectionPanel title="최근 Raid 목록" eyebrow="Raids">
        <RaidTable raids={filteredRaids} mappingResolver={mappingResolver} onRaidSelect={onRaidSelect} />
      </SectionPanel>

      {isDebugMode() && <ParserDebugPanel debugInfo={debugInfo} decoderStats={decoderStats} />}
    </div>
  );
}
