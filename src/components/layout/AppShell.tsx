import { BarChart3, Database, Shield, Tags, Upload } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../utils/classNames";

interface AppShellProps {
  currentScreen: "import" | "dashboard" | "database" | "mappings" | "raid";
  children: ReactNode;
  onNavigateDashboard: () => void;
  onNavigateImport: () => void;
  onNavigateDatabase: () => void;
  onNavigateMappings: () => void;
}

export function AppShell({
  currentScreen,
  children,
  onNavigateDashboard,
  onNavigateImport,
  onNavigateDatabase,
  onNavigateMappings,
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
            <button
              className={cn(
                "hidden h-7 items-center gap-2 border px-2 text-[11px] uppercase transition md:inline-flex",
                currentScreen === "mappings"
                  ? "border-abi-olive bg-abi-panel2 text-abi-lime"
                  : "border-abi-line bg-abi-panel text-abi-muted hover:border-abi-olive hover:text-abi-text",
              )}
              onClick={onNavigateMappings}
            >
              <Tags size={13} aria-hidden="true" />
              Mappings
            </button>
            <button
              className={cn(
                "hidden h-7 items-center gap-2 border px-2 text-[11px] uppercase transition md:inline-flex",
                currentScreen === "database"
                  ? "border-abi-olive bg-abi-panel2 text-abi-lime"
                  : "border-abi-line bg-abi-panel text-abi-muted hover:border-abi-olive hover:text-abi-text",
              )}
              onClick={onNavigateDatabase}
            >
              <Database size={13} aria-hidden="true" />
              Local DB
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1920px] px-4 py-4 lg:px-6">{children}</main>
    </div>
  );
}
