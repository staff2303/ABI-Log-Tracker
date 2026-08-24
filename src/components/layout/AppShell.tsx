import { BarChart3, Database, Shield, Upload } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../utils/classNames";

interface AppShellProps {
  currentScreen: "import" | "dashboard" | "raid";
  children: ReactNode;
  onNavigateDashboard: () => void;
  onNavigateImport: () => void;
}

export function AppShell({
  currentScreen,
  children,
  onNavigateDashboard,
  onNavigateImport,
}: AppShellProps) {
  return (
    <div className="min-h-screen bg-abi-black text-abi-text">
      <header className="sticky top-0 z-30 border-b border-abi-line bg-abi-black/95">
        <div className="mx-auto flex h-14 max-w-[1920px] items-center justify-between px-4 lg:px-6">
          <button className="flex min-w-0 items-center gap-3 text-left" onClick={onNavigateImport}>
            <span className="flex h-9 w-9 items-center justify-center border border-abi-olive bg-abi-panel text-abi-lime">
              <Shield size={18} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold tracking-normal text-abi-text">
                ABI Log Tracker
              </span>
              <span className="block truncate text-[11px] uppercase tracking-normal text-abi-muted">
                Tactical Combat Analytics
              </span>
            </span>
          </button>

          <nav className="flex items-center gap-2">
            <button
              className={cn(
                "secondary-button",
                currentScreen === "import" && "border-abi-olive bg-abi-panel2 text-abi-lime",
              )}
              onClick={onNavigateImport}
            >
              <Upload size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Import</span>
            </button>
            <button
              className={cn(
                "secondary-button",
                (currentScreen === "dashboard" || currentScreen === "raid") &&
                  "border-abi-olive bg-abi-panel2 text-abi-lime",
              )}
              onClick={onNavigateDashboard}
            >
              <BarChart3 size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Dashboard</span>
            </button>
            <span className="hidden h-7 items-center gap-2 border border-abi-line bg-abi-panel px-2 text-[11px] uppercase text-abi-muted md:inline-flex">
              <Database size={13} aria-hidden="true" />
              Mock Data
            </span>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1920px] px-4 py-4 lg:px-6">{children}</main>
    </div>
  );
}
