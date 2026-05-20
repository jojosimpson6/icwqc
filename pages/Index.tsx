import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { PlayerSpotlight } from "@/components/PlayerSpotlight";
import { NewsFeed } from "@/components/NewsFeed";
import { LeagueLeaders } from "@/components/LeagueLeaders";
import { HomeStandings } from "@/components/HomeStandings";
import { ScoreTicker } from "@/components/ScoreTicker";
import { EloChart } from "@/components/EloChart";
import { useState } from "react";
import { Link } from "react-router-dom";

const Index = () => {
  const [eloOpen, setEloOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />

      <main className="flex-1">
        <ScoreTicker />

        <div className="container py-8">
          <div className="mb-6 border-b-2 border-primary pb-2">
            <h2 className="font-display text-2xl font-bold text-foreground">
              QuidReference Dashboard
            </h2>
            <p className="text-sm text-muted-foreground font-sans mt-1">
              Quidditch Statistics &amp; Records
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <NewsFeed />
              <LeagueLeaders />
              {/* Elo chart — collapsible, links to full page */}
              <div className="border border-border rounded overflow-hidden">
                <div
                  className="bg-table-header px-3 py-2 flex items-center justify-between cursor-pointer"
                  onClick={() => setEloOpen(o => !o)}
                >
                  <h3 className="font-display text-sm font-bold text-table-header-foreground">Team Elo Ratings</h3>
                  <div className="flex items-center gap-3">
                    <Link
                      to="/elo"
                      className="text-xs text-table-header-foreground/70 hover:text-table-header-foreground font-sans"
                      onClick={e => e.stopPropagation()}
                    >
                      Full page →
                    </Link>
                    <span className="text-table-header-foreground/70 text-xs">{eloOpen ? "▲ collapse" : "▼ expand"}</span>
                  </div>
                </div>
                {eloOpen && <EloChart />}
              </div>
            </div>

            <div className="space-y-6">
              <PlayerSpotlight />
              <HomeStandings />
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
};

export default Index;
