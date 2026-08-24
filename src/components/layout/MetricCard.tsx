import type { ReactNode } from "react";
import { cn } from "../../utils/classNames";

interface MetricCardProps {
  label: string;
  value: string;
  subValue?: string;
  icon?: ReactNode;
  tone?: "default" | "green" | "red" | "amber" | "lime";
}

const toneClasses = {
  default: "text-abi-text",
  green: "text-abi-green",
  red: "text-abi-red",
  amber: "text-abi-amber",
  lime: "text-abi-lime",
};

export function MetricCard({ label, value, subValue, icon, tone = "default" }: MetricCardProps) {
  return (
    <article className="metric-card min-h-[86px]">
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-[11px] uppercase tracking-normal text-abi-muted">{label}</p>
        {icon && <span className="text-abi-muted">{icon}</span>}
      </div>
      <p className={cn("mt-2 truncate font-mono text-2xl font-semibold leading-none", toneClasses[tone])}>
        {value}
      </p>
      {subValue && <p className="mt-2 truncate text-xs text-abi-muted">{subValue}</p>}
    </article>
  );
}
