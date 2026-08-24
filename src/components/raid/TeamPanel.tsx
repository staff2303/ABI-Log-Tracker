import type { TeamDetail } from "../../types/raid";
import { emptyValue, formatNumber } from "../../utils/format";
import { MemberStatusBadge, StatusBadge } from "../layout/StatusBadge";
import { SectionPanel } from "../layout/SectionPanel";
import { InfoGrid } from "./InfoGrid";

interface TeamPanelProps {
  team: TeamDetail;
}

export function TeamPanel({ team }: TeamPanelProps) {
  if (team.type !== "team") {
    return (
      <SectionPanel title="팀" eyebrow="Squad">
        <div className="flex items-center justify-between border border-abi-line bg-abi-black px-3 py-2">
          <span className="text-sm font-semibold text-abi-text">Solo Raid</span>
          <StatusBadge>{team.type === "unknown" ? "Unknown" : "Team data 없음"}</StatusBadge>
        </div>
      </SectionPanel>
    );
  }

  return (
    <SectionPanel title="팀" eyebrow="Squad">
      <InfoGrid
        columns="two"
        items={[
          { label: "팀 여부", value: "Team", tone: "lime" },
          { label: "팀원 수", value: formatNumber(team.memberCount) },
          { label: "내 닉네임", value: team.localPlayerNickname ?? emptyValue },
          { label: "팀원 구조", value: formatNumber(team.teammateRescues), tone: (team.teammateRescues ?? 0) > 0 ? "green" : "default" },
          { label: "구조받음", value: formatNumber(team.rescuedByTeammate), tone: (team.rescuedByTeammate ?? 0) > 0 ? "green" : "default" },
          { label: "지원", value: formatNumber(team.supportActions), tone: (team.supportActions ?? 0) > 0 ? "lime" : "default" },
        ]}
      />

      <div className="mt-3 grid gap-2">
        {team.members.length === 0 && (
          <div className="border border-abi-line bg-abi-black px-3 py-2 text-sm text-abi-muted">
            해석된 팀원 스냅샷 없음
          </div>
        )}
        {team.members.map((member, index) => (
          <div
            key={member.nickname ?? `member-${index}`}
            className="flex items-center justify-between gap-3 border border-abi-line bg-abi-black px-3 py-2"
          >
            <span className="min-w-0 truncate font-mono text-sm font-semibold text-abi-text">{member.nickname ?? emptyValue}</span>
            <MemberStatusBadge status={member.status} />
          </div>
        ))}
      </div>
    </SectionPanel>
  );
}
