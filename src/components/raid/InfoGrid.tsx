import type { ReactNode } from "react";
import { cn } from "../../utils/classNames";

export interface InfoGridItem {
  label: string;
  value: ReactNode;
  tone?: "default" | "green" | "red" | "amber" | "lime";
}

const toneClasses = {
  default: "text-abi-text",
  green: "text-abi-green",
  red: "text-abi-red",
  amber: "text-abi-amber",
  lime: "text-abi-lime",
};

interface InfoGridProps {
  items: InfoGridItem[];
  columns?: "two" | "three" | "four";
}

const columnClasses = {
  two: "sm:grid-cols-2",
  three: "sm:grid-cols-2 xl:grid-cols-3",
  four: "sm:grid-cols-2 xl:grid-cols-4",
};

export function InfoGrid({ items, columns = "three" }: InfoGridProps) {
  return (
    <div className={cn("grid gap-2", columnClasses[columns])}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0 border border-abi-line bg-abi-black px-3 py-2">
          <p className="truncate text-[11px] uppercase text-abi-muted">{item.label}</p>
          <div className={cn("mt-1 truncate font-mono text-sm font-semibold", toneClasses[item.tone ?? "default"])}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}
