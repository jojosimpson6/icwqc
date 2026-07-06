import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { PlayerCompareTool } from "@/components/compare/PlayerCompareTool";
import { TeamCompareTool } from "@/components/compare/TeamCompareTool";

type CompareTab = "players" | "teams";

export default function ComparePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<CompareTab>(searchParams.get("mode") === "teams" ? "teams" : "players");

  function switchTab(t: CompareTab) {
    setTab(t);
    const params = new URLSearchParams(searchParams);
    params.set("mode", t);
    setSearchParams(params, { replace: true });
  }

  function handlePlayerSelected(index: number, playerId: number) {
    const params = new URLSearchParams(searchParams);
    params.set(`p${index + 1}`, String(playerId));
    params.set("mode", "players");
    setSearchParams(params, { replace: true });
  }

  function handleTeamSelected(index: number, teamId: number) {
    const params = new URLSearchParams(searchParams);
    params.set(`t${index + 1}`, String(teamId));
    params.set("mode", "teams");
    setSearchParams(params, { replace: true });
  }

  const initialPlayerIds = [1, 2, 3, 4].map(n => {
    const v = searchParams.get(`p${n}`);
    return v ? parseInt(v, 10) : null;
  });
  const initialTeamIds = [1, 2, 3, 4, 5, 6].map(n => {
    const v = searchParams.get(`t${n}`);
    return v ? parseInt(v, 10) : null;
  });

  return (
    <div className="min-h-screen bg-background flex flex-col pb-14 md:pb-0">
      <SiteHeader />
      <main className="flex-1 container py-8">
        <div className="mb-6 border-b-2 border-primary pb-3">
          <h1 className="font-display text-3xl font-bold text-foreground">Compare</h1>
          <p className="text-sm text-muted-foreground font-sans mt-1">
            Flexible player and team comparisons — any seasons, any ages, any competitions.
          </p>
        </div>

        <div className="flex gap-2 mb-6 border-b border-border">
          {(["players", "teams"] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => switchTab(t)}
              className={`px-4 py-2 text-sm font-sans font-medium border-b-2 -mb-px transition-colors capitalize ${
                tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "players" ? "Players" : "Teams"}
            </button>
          ))}
        </div>

        <div className={tab === "players" ? "" : "hidden"}>
          <PlayerCompareTool initialPlayerIds={initialPlayerIds} onPlayerSelected={handlePlayerSelected} />
        </div>
        <div className={tab === "teams" ? "" : "hidden"}>
          <TeamCompareTool initialTeamIds={initialTeamIds} onTeamSelected={handleTeamSelected} />
        </div>
      </main>
      <SiteFooter />
      <MobileBottomNav />
    </div>
  );
}
