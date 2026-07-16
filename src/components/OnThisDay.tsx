import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAllRows } from "@/lib/fetchAll";
import { getNationFlag } from "@/lib/helpers";

interface MatchdayRow {
  SeasonID: number | null;
  LeagueID: number | null;
  MatchdayWeek: number | null;
  Matchday: string | null;
}

interface ResultRow {
  MatchID: number;
  HomeTeamID: number | null;
  AwayTeamID: number | null;
  HomeTeamScore: number | null;
  AwayTeamScore: number | null;
  SeasonID: number | null;
  LeagueID: number | null;
  WeekID: number | null;
}

interface BirthdayPerson {
  id: number;
  name: string;
  birthYear: number;
  kind: "player" | "manager";
  nationFlag?: string;
}

function seasonLabel(id: number): string {
  return `${id - 1}–${String(id).slice(-2)}`;
}

// Today's real-world month/day (1-indexed month), used to match historical records
// regardless of which year they happened in.
function todayMonthDay(): { month: number; day: number } {
  const now = new Date();
  return { month: now.getMonth() + 1, day: now.getDate() };
}

export function OnThisDay() {
  const [matches, setMatches] = useState<{ match: ResultRow; homeName: string; awayName: string; leagueName: string; yearsAgo: number }[]>([]);
  const [birthdays, setBirthdays] = useState<BirthdayPerson[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { month, day } = todayMonthDay();
        const thisYear = new Date().getFullYear();

        const [matchdays, teams, leagues, players, managers, nations] = await Promise.all([
          fetchAllRows<MatchdayRow>("matchdays", { select: "SeasonID, LeagueID, MatchdayWeek, Matchday" }),
          fetchAllRows<{ TeamID: number; FullName: string }>("teams", { select: "TeamID, FullName" }),
          fetchAllRows<{ LeagueID: number; LeagueName: string }>("leagues", { select: "LeagueID, LeagueName" }),
          fetchAllRows<{ PlayerID: number; PlayerName: string; DOB: string | null; NationalityID: number | null }>("players", { select: "PlayerID, PlayerName, DOB, NationalityID" }),
          fetchAllRows<{ ManagerID: number; FirstName: string; LastName: string; DOB: string | null; NationalityID: number | null }>("managers", { select: "ManagerID, FirstName, LastName, DOB, NationalityID" }),
          fetchAllRows<{ NationID: number; Nation: string }>("nations", { select: "NationID, Nation" }),
        ]);

        const teamMap = new Map(teams.map(t => [t.TeamID, t.FullName]));
        const leagueMap = new Map(leagues.map(l => [l.LeagueID, l.LeagueName]));
        const nationMap = new Map(nations.map(n => [n.NationID, n.Nation]));

        // Matches played on this calendar day in a past year.
        const matchingDays = matchdays.filter(md => {
          if (!md.Matchday) return false;
          const d = new Date(md.Matchday);
          if (isNaN(d.getTime())) return false;
          return d.getMonth() + 1 === month && d.getDate() === day && d.getFullYear() < thisYear;
        });

        let matchList: { match: ResultRow; homeName: string; awayName: string; leagueName: string; yearsAgo: number }[] = [];
        if (matchingDays.length > 0) {
          const keys = new Set(matchingDays.map(md => `${md.SeasonID}|${md.LeagueID}|${md.MatchdayWeek}`));
          const seasons = [...new Set(matchingDays.map(md => md.SeasonID).filter((s): s is number => s != null))];
          const leagueIds = [...new Set(matchingDays.map(md => md.LeagueID).filter((l): l is number => l != null))];
          const yearByKey = new Map(matchingDays.map(md => [`${md.SeasonID}|${md.LeagueID}|${md.MatchdayWeek}`, new Date(md.Matchday!).getFullYear()]));

          const results = await fetchAllRows<ResultRow>("results", {
            select: "MatchID, HomeTeamID, AwayTeamID, HomeTeamScore, AwayTeamScore, SeasonID, LeagueID, WeekID",
            filters: [
              { method: "in", args: ["SeasonID", seasons] },
              { method: "in", args: ["LeagueID", leagueIds] },
            ],
          });

          const relevant = results.filter(r => keys.has(`${r.SeasonID}|${r.LeagueID}|${r.WeekID}`) && r.HomeTeamScore != null && r.AwayTeamScore != null);
          matchList = relevant
            .map(match => ({
              match,
              homeName: match.HomeTeamID ? (teamMap.get(match.HomeTeamID) || `Team ${match.HomeTeamID}`) : "TBD",
              awayName: match.AwayTeamID ? (teamMap.get(match.AwayTeamID) || `Team ${match.AwayTeamID}`) : "TBD",
              leagueName: match.LeagueID ? (leagueMap.get(match.LeagueID) || "") : "",
              yearsAgo: thisYear - (yearByKey.get(`${match.SeasonID}|${match.LeagueID}|${match.WeekID}`) || thisYear),
            }))
            // Prefer more recent, higher-scoring (more "notable") matches; cap the list.
            .sort((a, b) => (b.match.HomeTeamScore! + b.match.AwayTeamScore!) - (a.match.HomeTeamScore! + a.match.AwayTeamScore!))
            .slice(0, 4);
        }

        // Players / managers born on this calendar day (any year).
        const bdays: BirthdayPerson[] = [];
        players.forEach(p => {
          if (!p.DOB) return;
          const d = new Date(p.DOB);
          if (isNaN(d.getTime()) || d.getMonth() + 1 !== month || d.getDate() !== day) return;
          const nation = p.NationalityID ? nationMap.get(p.NationalityID) : undefined;
          bdays.push({ id: p.PlayerID, name: p.PlayerName, birthYear: d.getFullYear(), kind: "player", nationFlag: nation ? getNationFlag(nation) : undefined });
        });
        managers.forEach(m => {
          if (!m.DOB) return;
          const d = new Date(m.DOB);
          if (isNaN(d.getTime()) || d.getMonth() + 1 !== month || d.getDate() !== day) return;
          const nation = m.NationalityID ? nationMap.get(m.NationalityID) : undefined;
          bdays.push({ id: m.ManagerID, name: `${m.FirstName} ${m.LastName}`, birthYear: d.getFullYear(), kind: "manager", nationFlag: nation ? getNationFlag(nation) : undefined });
        });
        // Shuffle lightly so the same few names don't always lead, then cap.
        bdays.sort(() => Math.random() - 0.5);

        setMatches(matchList);
        setBirthdays(bdays.slice(0, 5));
      } catch (err) {
        console.error("OnThisDay error:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="border border-border rounded overflow-hidden">
        <div className="bg-table-header px-3 py-2">
          <h3 className="font-display text-sm font-bold text-table-header-foreground">On This Day</h3>
        </div>
        <div className="bg-card divide-y divide-border">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="px-3 py-2.5 space-y-1.5 animate-pulse">
              <div className="h-3 bg-secondary rounded w-3/4" />
              <div className="h-2.5 bg-secondary rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (matches.length === 0 && birthdays.length === 0) return null;

  return (
    <div className="border border-border rounded overflow-hidden">
      <div className="bg-table-header px-3 py-2">
        <h3 className="font-display text-sm font-bold text-table-header-foreground">On This Day</h3>
      </div>
      <div className="bg-card divide-y divide-border">
        {matches.map(m => (
          <Link key={m.match.MatchID} to={`/match/${m.match.MatchID}`} className="block px-3 py-2.5 hover:bg-highlight/20 transition-colors">
            <p className="text-xs text-muted-foreground font-sans mb-0.5">
              {m.yearsAgo === 0 ? "Earlier today" : `${m.yearsAgo} year${m.yearsAgo === 1 ? "" : "s"} ago`}{m.leagueName ? ` · ${m.leagueName}` : ""}
            </p>
            <p className="text-sm font-sans text-foreground">
              <span className="font-medium">{m.homeName}</span> {m.match.HomeTeamScore}–{m.match.AwayTeamScore} <span className="font-medium">{m.awayName}</span>
            </p>
          </Link>
        ))}
        {birthdays.map(b => (
          <Link key={`${b.kind}-${b.id}`} to={b.kind === "player" ? `/player/${b.id}` : `/manager/${b.id}`} className="block px-3 py-2.5 hover:bg-highlight/20 transition-colors">
            <p className="text-sm font-sans text-foreground">
              🎂 <span className="font-medium">{b.name}</span> {b.nationFlag && <span>{b.nationFlag}</span>} — born this day, {b.birthYear}
            </p>
            <p className="text-xs text-muted-foreground font-sans">{b.kind === "player" ? "Player" : "Manager"}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
