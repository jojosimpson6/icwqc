import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { StatTable } from "@/components/StatTable";
import { StandingsTable } from "@/components/StandingsTable";
import { ScoreCard } from "@/components/ScoreCard";

const battingLeaders = {
  title: "Batting Leaders — 2026",
  headers: ["Player", "Team", "G", "AB", "H", "HR", "RBI", "AVG"],
  rows: [
    ["M. Rodriguez", "Hawks", 82, 320, 112, 28, 74, ".350"],
    ["J. Chen", "Wolves", 80, 305, 103, 22, 65, ".338"],
    ["D. Williams", "Bears", 78, 298, 98, 35, 88, ".329"],
    ["A. Petrov", "Eagles", 81, 312, 100, 18, 55, ".321"],
    ["K. Tanaka", "Lions", 79, 290, 92, 24, 70, ".317"],
    ["R. Santos", "Foxes", 82, 330, 104, 20, 62, ".315"],
    ["T. Johnson", "Sharks", 77, 285, 88, 31, 79, ".309"],
    ["L. O'Brien", "Cobras", 80, 310, 95, 15, 48, ".306"],
  ],
  highlightCol: 7,
};

const pitchingLeaders = {
  title: "Pitching Leaders — 2026",
  headers: ["Player", "Team", "W", "L", "ERA", "G", "IP", "SO"],
  rows: [
    ["S. Martinez", "Hawks", 14, 3, "2.15", 22, "155.1", 198],
    ["B. Kim", "Bears", 12, 4, "2.48", 21, "148.0", 175],
    ["C. Davis", "Wolves", 11, 5, "2.72", 23, "160.2", 210],
    ["F. Nguyen", "Eagles", 13, 3, "2.85", 20, "142.0", 165],
    ["H. Wilson", "Lions", 10, 6, "3.01", 22, "150.1", 188],
    ["G. Patel", "Foxes", 9, 4, "3.12", 21, "138.2", 155],
  ],
  highlightCol: 4,
};

const eastStandings = [
  { name: "Hawks", w: 58, l: 24, pct: ".707", gb: "—", streak: "W5" },
  { name: "Wolves", w: 52, l: 30, pct: ".634", gb: "6.0", streak: "W2" },
  { name: "Bears", w: 48, l: 34, pct: ".585", gb: "10.0", streak: "L1" },
  { name: "Eagles", w: 40, l: 42, pct: ".488", gb: "18.0", streak: "L3" },
  { name: "Cobras", w: 30, l: 52, pct: ".366", gb: "28.0", streak: "W1" },
];

const westStandings = [
  { name: "Lions", w: 55, l: 27, pct: ".671", gb: "—", streak: "W3" },
  { name: "Foxes", w: 50, l: 32, pct: ".610", gb: "5.0", streak: "L2" },
  { name: "Sharks", w: 45, l: 37, pct: ".549", gb: "10.0", streak: "W4" },
  { name: "Tigers", w: 38, l: 44, pct: ".463", gb: "17.0", streak: "L1" },
  { name: "Falcons", w: 25, l: 57, pct: ".305", gb: "30.0", streak: "L6" },
];

const recentScores = [
  { away: "Hawks", home: "Lions", awayScore: 7, homeScore: 3, status: "Final", date: "Feb 14" },
  { away: "Wolves", home: "Foxes", awayScore: 4, homeScore: 5, status: "Final", date: "Feb 14" },
  { away: "Bears", home: "Sharks", awayScore: 2, homeScore: 2, status: "Top 9th", date: "Feb 15" },
  { away: "Eagles", home: "Tigers", awayScore: 6, homeScore: 1, status: "Final", date: "Feb 14" },
  { away: "Cobras", home: "Falcons", awayScore: 3, homeScore: 8, status: "Final", date: "Feb 14" },
];

const Index = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* Scores ticker */}
        <div className="bg-secondary border-b border-border">
          <div className="container py-3">
            <div className="flex items-center gap-3 overflow-x-auto pb-1">
              <span className="text-xs font-sans font-semibold text-muted-foreground uppercase tracking-wide shrink-0">
                Scores
              </span>
              {recentScores.map((game, i) => (
                <ScoreCard key={i} {...game} />
              ))}
            </div>
          </div>
        </div>

        <div className="container py-8">
          {/* Today's date header */}
          <div className="mb-6 border-b-2 border-primary pb-2">
            <h2 className="font-display text-2xl font-bold text-foreground">
              2026 Season Dashboard
            </h2>
            <p className="text-sm text-muted-foreground font-sans mt-1">
              Saturday, February 15, 2026 — Week 12
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main content */}
            <div className="lg:col-span-2 space-y-6">
              <StatTable {...battingLeaders} />
              <StatTable {...pitchingLeaders} />
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              <StandingsTable title="East Division" teams={eastStandings} />
              <StandingsTable title="West Division" teams={westStandings} />

              {/* Quick stats */}
              <div className="border border-border rounded overflow-hidden">
                <div className="bg-table-header px-3 py-2">
                  <h3 className="font-display text-sm font-bold text-table-header-foreground">
                    Today's Milestones
                  </h3>
                </div>
                <div className="p-3 space-y-3 text-sm font-sans bg-card">
                  <div className="border-b border-border pb-2">
                    <p className="font-medium text-accent">M. Rodriguez</p>
                    <p className="text-muted-foreground">Reached 100th hit of the season, earliest since 2019</p>
                  </div>
                  <div className="border-b border-border pb-2">
                    <p className="font-medium text-accent">C. Davis</p>
                    <p className="text-muted-foreground">Recorded 200th strikeout, 3rd pitcher to reach mark this season</p>
                  </div>
                  <div>
                    <p className="font-medium text-accent">Hawks</p>
                    <p className="text-muted-foreground">Clinched playoff spot with win over Lions</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
};

export default Index;
