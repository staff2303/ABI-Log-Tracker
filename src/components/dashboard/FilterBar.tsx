import { RotateCcw } from "lucide-react";
import type { RaidFilters } from "../../utils/stats";
import { defaultFilters } from "../../utils/stats";

interface FilterBarProps {
  filters: RaidFilters;
  maps: string[];
  modes: string[];
  zones: string[];
  onChange: (filters: RaidFilters) => void;
}

export function FilterBar({ filters, maps, modes, zones, onChange }: FilterBarProps) {
  const updateFilter = <K extends keyof RaidFilters>(key: K, value: RaidFilters[K]) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[180px_repeat(5,minmax(130px,1fr))_40px]">
      <label className="min-w-0">
        <span className="mb-1 block text-[11px] uppercase text-abi-muted">날짜</span>
        <input
          className="control"
          type="date"
          value={filters.date}
          onChange={(event) => updateFilter("date", event.target.value)}
        />
      </label>

      <label className="min-w-0">
        <span className="mb-1 block text-[11px] uppercase text-abi-muted">맵</span>
        <select className="control" value={filters.map} onChange={(event) => updateFilter("map", event.target.value)}>
          <option value="all">All Maps</option>
          {maps.map((map) => (
            <option key={map} value={map}>
              {map}
            </option>
          ))}
        </select>
      </label>

      <label className="min-w-0">
        <span className="mb-1 block text-[11px] uppercase text-abi-muted">모드</span>
        <select
          className="control"
          value={filters.mode}
          onChange={(event) => updateFilter("mode", event.target.value)}
        >
          <option value="all">All Modes</option>
          {modes.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
      </label>

      <label className="min-w-0">
        <span className="mb-1 block text-[11px] uppercase text-abi-muted">구역</span>
        <select
          className="control"
          value={filters.zone}
          onChange={(event) => updateFilter("zone", event.target.value)}
        >
          <option value="all">All Zones</option>
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
      </label>

      <label className="min-w-0">
        <span className="mb-1 block text-[11px] uppercase text-abi-muted">결과</span>
        <select
          className="control"
          value={filters.result}
          onChange={(event) => updateFilter("result", event.target.value as RaidFilters["result"])}
        >
          <option value="all">All Results</option>
          <option value="extracted">탈출</option>
          <option value="dead">사망</option>
        </select>
      </label>

      <label className="min-w-0">
        <span className="mb-1 block text-[11px] uppercase text-abi-muted">솔로/팀</span>
        <select
          className="control"
          value={filters.squad}
          onChange={(event) => updateFilter("squad", event.target.value as RaidFilters["squad"])}
        >
          <option value="all">All Squads</option>
          <option value="solo">Solo</option>
          <option value="team">Team</option>
        </select>
      </label>

      <button
        className="icon-button mt-5 self-end"
        onClick={() => onChange(defaultFilters)}
        aria-label="Reset dashboard filters"
      >
        <RotateCcw size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
