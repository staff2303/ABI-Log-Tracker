import type { ReactNode } from "react";

interface SectionPanelProps {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SectionPanel({ title, eyebrow, action, children, className = "" }: SectionPanelProps) {
  return (
    <section className={`panel ${className}`}>
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-abi-line px-3 py-2">
        <div className="min-w-0">
          {eyebrow && <p className="text-[11px] uppercase tracking-normal text-abi-muted">{eyebrow}</p>}
          <h2 className="truncate text-sm font-semibold text-abi-text">{title}</h2>
        </div>
        {action}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}
