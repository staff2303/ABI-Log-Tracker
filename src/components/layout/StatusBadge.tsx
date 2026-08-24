import type { ReactNode } from "react";
import { cn } from "../../utils/classNames";
import type { OpponentType, RaidResult, SquadType, TeamMemberStatus } from "../../types/raid";

type BadgeTone = "green" | "red" | "amber" | "muted" | "olive";

const toneClasses: Record<BadgeTone, string> = {
  green: "border-abi-green/60 bg-abi-green/10 text-abi-green",
  red: "border-abi-red/60 bg-abi-red/10 text-abi-red",
  amber: "border-abi-amber/60 bg-abi-amber/10 text-abi-amber",
  muted: "border-abi-line bg-abi-black text-abi-muted",
  olive: "border-abi-olive/70 bg-abi-olive/10 text-abi-lime",
};

interface StatusBadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
}

export function StatusBadge({ children, tone = "muted" }: StatusBadgeProps) {
  return (
    <span className={cn("inline-flex h-6 items-center border px-2 text-[11px] font-semibold", toneClasses[tone])}>
      {children}
    </span>
  );
}

export function ResultBadge({ result }: { result: RaidResult }) {
  return <StatusBadge tone={result === "extracted" ? "green" : "red"}>{result === "extracted" ? "탈출" : "사망"}</StatusBadge>;
}

export function SquadBadge({ squad }: { squad: SquadType }) {
  return <StatusBadge tone={squad === "team" ? "olive" : "muted"}>{squad === "team" ? "Team" : "Solo"}</StatusBadge>;
}

export function OpponentBadge({ type }: { type: OpponentType }) {
  if (type === "player") {
    return <StatusBadge tone="amber">Player</StatusBadge>;
  }

  if (type === "ai") {
    return <StatusBadge tone="muted">AI</StatusBadge>;
  }

  return <StatusBadge tone="muted">Unknown</StatusBadge>;
}

export function MemberStatusBadge({ status }: { status: TeamMemberStatus }) {
  if (status === "alive" || status === "extracted") {
    return <StatusBadge tone="green">{status === "alive" ? "Alive" : "Extracted"}</StatusBadge>;
  }

  if (status === "dead") {
    return <StatusBadge tone="red">Dead</StatusBadge>;
  }

  return (
    <StatusBadge tone="muted">Unknown</StatusBadge>
  );
}
