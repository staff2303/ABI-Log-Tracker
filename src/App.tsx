import { useEffect, useMemo, useState } from "react";
import { AppShell } from "./components/layout/AppShell";
import { DashboardPage } from "./components/dashboard/DashboardPage";
import { ImportPage } from "./components/import/ImportPage";
import { RaidDetailPage } from "./components/raid/RaidDetailPage";
import type { ParserDebugInfo } from "./types/parser";
import type { Raid } from "./types/raid";
import type { StreamingDecoderStats } from "./types/streamDecoder";

type AppRoute =
  | { screen: "import" }
  | { screen: "dashboard" }
  | { screen: "raid"; raidId: string };

function parseHashRoute(): AppRoute {
  const hash = window.location.hash.replace(/^#\/?/, "");

  if (hash === "dashboard") {
    return { screen: "dashboard" };
  }

  if (hash.startsWith("raid/")) {
    return { screen: "raid", raidId: decodeURIComponent(hash.replace("raid/", "")) };
  }

  return { screen: "import" };
}

function pushRoute(route: AppRoute): void {
  if (route.screen === "dashboard") {
    window.location.hash = "/dashboard";
    return;
  }

  if (route.screen === "raid") {
    window.location.hash = `/raid/${encodeURIComponent(route.raidId)}`;
    return;
  }

  window.location.hash = "/import";
}

export default function App() {
  const [route, setRoute] = useState<AppRoute>(() => parseHashRoute());
  const [raids, setRaids] = useState<Raid[]>([]);
  const [debugInfo, setDebugInfo] = useState<ParserDebugInfo | null>(null);
  const [decoderStats, setDecoderStats] = useState<StreamingDecoderStats | null>(null);

  useEffect(() => {
    const handleHashChange = () => setRoute(parseHashRoute());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const selectedRaid = useMemo(() => {
    if (route.screen !== "raid") {
      return null;
    }

    return raids.find((raid) => raid.id === route.raidId) ?? null;
  }, [raids, route]);

  const navigateImport = () => pushRoute({ screen: "import" });
  const navigateDashboard = () => pushRoute({ screen: "dashboard" });
  const navigateRaid = (raidId: string) => pushRoute({ screen: "raid", raidId });

  return (
    <AppShell
      currentScreen={route.screen}
      onNavigateDashboard={navigateDashboard}
      onNavigateImport={navigateImport}
    >
      {route.screen === "import" && (
        <ImportPage
          onDemo={navigateDashboard}
          onParsed={(nextRaids, nextDebugInfo, nextDecoderStats) => {
            setRaids(nextRaids);
            setDebugInfo(nextDebugInfo);
            setDecoderStats(nextDecoderStats);
          }}
        />
      )}
      {route.screen === "dashboard" && (
        <DashboardPage raids={raids} debugInfo={debugInfo} decoderStats={decoderStats} onRaidSelect={navigateRaid} />
      )}
      {route.screen === "raid" && <RaidDetailPage raid={selectedRaid} onBack={navigateDashboard} />}
    </AppShell>
  );
}
