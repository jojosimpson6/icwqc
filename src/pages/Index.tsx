import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { PlayerSpotlight } from "@/components/PlayerSpotlight";
import { NewsFeed } from "@/components/NewsFeed";
import { LeagueLeaders } from "@/components/LeagueLeaders";
import { HomeStandings } from "@/components/HomeStandings";
import { ScoreTicker } from "@/components/ScoreTicker";
import { EloChart } from "@/components/EloChart";

const Index = () => {
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
              Quidditch Statistics & Records
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main content — News is the focus */}
            <div className="lg:col-span-2 space-y-6">
              <NewsFeed />
              <LeagueLeaders />
              <EloChart />
            </div>

            {/* Sidebar */}
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
