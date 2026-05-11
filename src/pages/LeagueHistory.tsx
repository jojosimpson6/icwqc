import { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { SiteFooter } from "@/components/SiteFooter";
import { getLeagueTierLabel } from "@/lib/helpers";
import { fetchAllRows } from "@/lib/fetchAll";

interface League {
  LeagueID: number;
  LeagueName: string | null;
  LeagueTier: number | null;
}
interface SeasonSummary {
  seasonId: number;
  champion: string | null;
  runnerUp: string | null;
  third: string | null;
  isCupFinal?: boolean;
  teams: { name: string; pts: number; gp: number; gf: number; ga: number; gsc: number }[];
}
interface AwardEntry {
  awardname: string;
  placement: number;
  playerid: number;
  seasonid: number;
}
interface StatLeader {
  PlayerName: string;
  PlayerID: number | null;
  value: number;
  seasons: number;
  team: string;
}

function seasonLabel(id: number): string { return `${id - 1}–${String(id).slice(-2)}`; }
function ordinal(n: number): string {
  const s = ["th","st","nd","rd"]; const v = n % 100;
  return n + (s[(v-20)%10] || s[v] || s[0]);
}

const MEDAL = {
  gold:   { bg:"bg-yellow-500/15", border:"border-yellow-500/40", text:"text-yellow-600 dark:text-yellow-400", badge:"bg-yellow-500 text-yellow-950", label:"1st", rowBg:"bg-yellow-500/10" },
  silver: { bg:"bg-slate-400/15",  border:"border-slate-400/40",  text:"text-slate-600 dark:text-slate-300",  badge:"bg-slate-400 text-slate-950",  label:"2nd", rowBg:"bg-slate-400/10"  },
  bronze: { bg:"bg-amber-700/15",  border:"border-amber-700/40",  text:"text-amber-700 dark:text-amber-500",  badge:"bg-amber-700 text-amber-50",   label:"3rd", rowBg:"bg-amber-700/10" },
} as const;

// LeagueIDs that are cup/knockout competitions (not round-robin)
const CUP_IDS = new Set([15,16,17,18,19,20,21]);

type TabType = "timeline" | "awards" | "player_season_stats";

export default function LeagueHistory() {
  const { id } = useParams();
  const [league, setLeague] = useState<League | null>(null);
  const [seasons, setSeasons] = useState<SeasonSummary[]>([]);
  const [awards, setAwards] = useState<AwardEntry[]>([]);
  const [playerMap, setPlayerMap] = useState<Map<number,string>>(new Map());
  const [expandedSeason, setExpandedSeason] = useState<number|null>(null);
  const [seasonResults, setSeasonResults] = useState<any[]>([]);
  const [teamMap, setTeamMap] = useState<Record<number,string>>({});
  const [activeTab, setActiveTab] = useState<TabType>("timeline");
  const [leagueStats, setLeagueStats] = useState<any[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statSort, setStatSort] = useState("Goals");
  const [isCup, setIsCup] = useState(false);

  useEffect(() => {
    if (!id) return;
    const lid = parseInt(id);
    const cup = CUP_IDS.has(lid);
    setIsCup(cup);

    Promise.all([
      supabase.from("leagues").select("*").eq("LeagueID", lid).single(),
      // For cups: teams play under their domestic league IDs, not the cup's LeagueID.
      // Fetch all teams; we'll filter to those appearing in results.
      cup
        ? fetchAllRows("teams", { select:"TeamID,FullName" })
        : fetchAllRows("teams", { select:"TeamID,FullName", filters:[{method:"eq",args:["LeagueID",lid]}] }),
      cup ? Promise.resolve([]) : fetchAllRows("standings", { select:"*", filters:[{method:"eq",args:["LeagueID",lid]}], order:{column:"totalpoints",ascending:false} }),
      fetchAllRows("awards", { select:"*", filters:[{method:"eq",args:["leagueid",lid]}], order:{column:"seasonid",ascending:true} }),
      fetchAllRows("players", { select:"PlayerID,PlayerName" }),
      cup ? fetchAllRows("results", { select:"MatchID,HomeTeamID,AwayTeamID,HomeTeamScore,AwayTeamScore,WeekID,SeasonID", filters:[{method:"eq",args:["LeagueID",lid]}], order:{column:"WeekID",ascending:true} }) : Promise.resolve([]),
      cup ? fetchAllRows("matchdays", { select:"Matchday,MatchdayWeek,SeasonID,LeagueID", filters:[{method:"eq",args:["LeagueID",lid]}] }) : Promise.resolve([]),
    ]).then(([{data:leagueData}, teamData, standingsData, awardsData, playerData, resultsData, matchdaysData]) => {
      if (leagueData) setLeague(leagueData);

      const tMap: Record<number,string> = {};
      const teamNames = new Set<string>();
      if (teamData) { (teamData as any[]).forEach(t => { tMap[t.TeamID]=t.FullName; teamNames.add(t.FullName); }); }
      setTeamMap(tMap);

      if (!cup && Array.isArray(standingsData) && standingsData.length > 0) {
        const leagueStandings = (standingsData as any[]).filter(s => teamNames.has(s.FullName||""));
        const bySeason = new Map<number,any[]>();
        leagueStandings.forEach(s => {
          if (s.SeasonID == null) return;
          if (!bySeason.has(s.SeasonID)) bySeason.set(s.SeasonID,[]);
          bySeason.get(s.SeasonID)!.push(s);
        });
        const summaries: SeasonSummary[] = [];
        bySeason.forEach((rows, sid) => {
          const sorted = rows.sort((a:any,b:any) => (b.totalpoints||0)-(a.totalpoints||0));
          summaries.push({
            seasonId: sid,
            champion: sorted[0]?.FullName??null,
            runnerUp: sorted[1]?.FullName??null,
            third: sorted[2]?.FullName??null,
            teams: sorted.map((r:any) => ({name:r.TeamFullName||"",pts:r.totalpoints||0,gp:r.totalgamesplayed||0,gf:r.GoalsFor||0,ga:r.GoalsAgainst||0,gsc:r.totalgsc||0})),
          });
        });
        setSeasons(summaries.sort((a,b)=>b.seasonId-a.seasonId));

      } else if (cup && Array.isArray(resultsData) && resultsData.length > 0) {
        // Build week→roundName map
        const mdMap = new Map<number,string>();
        if (Array.isArray(matchdaysData)) {
          (matchdaysData as any[]).forEach(md => { if (md.MatchdayWeek!=null && md.Matchday) mdMap.set(md.MatchdayWeek, md.Matchday); });
        }
        const bySeason = new Map<number,any[]>();
        (resultsData as any[]).forEach(r => {
          if (r.SeasonID==null) return;
          if (!bySeason.has(r.SeasonID)) bySeason.set(r.SeasonID,[]);
          bySeason.get(r.SeasonID)!.push(r);
        });
        const summaries: SeasonSummary[] = [];
        bySeason.forEach((matches, sid) => {
          const byWeekDesc = [...matches].sort((a:any,b:any)=>(b.WeekID||0)-(a.WeekID||0));
          // Find the final match
          let finalMatch = byWeekDesc.find((m:any)=>{
            const rn=(mdMap.get(m.WeekID)||"").toLowerCase();
            return rn==="final"||rn==="grand final";
          }) || byWeekDesc[0];
          // Find 3rd place match
          const thirdMatch = byWeekDesc.find((m:any)=>{
            const rn=(mdMap.get(m.WeekID)||"").toLowerCase();
            return rn.includes("3rd")||rn.includes("third")||rn.includes("bronze");
          });
          if (!finalMatch) return;
          const homeWon = (finalMatch.HomeTeamScore||0)>=(finalMatch.AwayTeamScore||0);
          const champion = tMap[homeWon?finalMatch.HomeTeamID:finalMatch.AwayTeamID]||null;
          const runnerUp = tMap[homeWon?finalMatch.AwayTeamID:finalMatch.HomeTeamID]||null;
          let third:string|null=null;
          if (thirdMatch) {
            const tw=(thirdMatch.HomeTeamScore||0)>=(thirdMatch.AwayTeamScore||0);
            third=tMap[tw?thirdMatch.HomeTeamID:thirdMatch.AwayTeamID]||null;
          }
          summaries.push({ seasonId:sid, champion, runnerUp, third, isCupFinal:true, teams:[] });
        });
        setSeasons(summaries.sort((a,b)=>b.seasonId-a.seasonId));
      }

      if (awardsData) setAwards(awardsData as AwardEntry[]);
      if (playerData) {
        const pm = new Map<number,string>();
        (playerData as any[]).forEach(p => { if (p.PlayerID&&p.PlayerName) pm.set(p.PlayerID,p.PlayerName); });
        setPlayerMap(pm);
      }
    });
  }, [id]);

  // Load stats when tab opened
  useEffect(() => {
    if (activeTab!=="player_season_stats"||!league?.LeagueName||leagueStats.length>0) return;
    setStatsLoading(true);
    fetchAllRows("player_season_stats", {
      select:"PlayerID,PlayerName,Goals,GoldenSnitchCatches,KeeperSaves,KeeperShotsFaced,GamesPlayed,Position,SeasonID,TeamFullName",
      filters:[{method:"eq",args:["LeagueName",league.LeagueName]}],
    }).then(data=>{ setLeagueStats(data||[]); setStatsLoading(false); });
  },[activeTab,league]);

  // Season results on expand
  useEffect(() => {
    if (expandedSeason==null||!id) { setSeasonResults([]); return; }
    supabase.from("results")
      .select("MatchID,HomeTeamID,AwayTeamID,HomeTeamScore,AwayTeamScore,WeekID")
      .eq("LeagueID",parseInt(id))
      .eq("SeasonID",expandedSeason)
      .order("WeekID",{ascending:true})
      .then(({data})=>{ setSeasonResults(data||[]); });
  },[expandedSeason,id]);

  // Awards grouped by season
  const awardsBySeason = useMemo(()=>{
    const m = new Map<number,Map<string,AwardEntry[]>>();
    awards.forEach(a=>{
      if (!m.has(a.seasonid)) m.set(a.seasonid,new Map());
      const sm=m.get(a.seasonid)!;
      if (!sm.has(a.awardname)) sm.set(a.awardname,[]);
      sm.get(a.awardname)!.push(a);
    });
    return m;
  },[awards]);

  const allAwardNames = useMemo(()=>[...new Set(awards.map(a=>a.awardname))].sort(),[awards]);

  const mostTitles = useMemo(()=>{
    const counts = new Map<string,number>();
    seasons.forEach(s=>{ if(s.champion) counts.set(s.champion,(counts.get(s.champion)||0)+1); });
    return [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5);
  },[seasons]);

  // Stat leaders
  const positions = useMemo(()=>new Set(leagueStats.map((r:any)=>r.Position).filter(Boolean)),[leagueStats]);
  const statOptions = useMemo(()=>{
    const opts:{key:string;label:string}[]=[{key:"GamesPlayed",label:"Games Played"}];
    if (positions.has("Chaser")) opts.unshift({key:"Goals",label:"Goals"});
    if (positions.has("Seeker")) opts.push({key:"GoldenSnitchCatches",label:"Snitch Catches"});
    if (positions.has("Keeper")) opts.push({key:"KeeperSaves",label:"Keeper Saves"});
    return opts;
  },[positions]);

  const statLeaders = useMemo(():StatLeader[]=>{
    if (!leagueStats.length) return [];
    const byPlayer = new Map<string,{PlayerID:number|null;Goals:number;GSC:number;KS:number;GP:number;team:string;seasons:number}>();
    leagueStats.forEach((r:any)=>{
      const name=r.PlayerName; if(!name) return;
      const cur=byPlayer.get(name)||{PlayerID:r.PlayerID,Goals:0,GSC:0,KS:0,GP:0,team:r.TeamFullName||"",seasons:0};
      cur.Goals+=(r.Goals||0); cur.GSC+=(r.GoldenSnitchCatches||0); cur.KS+=(r.KeeperSaves||0); cur.GP+=(r.GamesPlayed||0); cur.seasons+=1; cur.team=r.TeamFullName||cur.team;
      byPlayer.set(name,cur);
    });
    return [...byPlayer.entries()]
      .map(([name,d])=>({ PlayerName:name, PlayerID:d.PlayerID,
        value: statSort==="Goals"?d.Goals:statSort==="GoldenSnitchCatches"?d.GSC:statSort==="KeeperSaves"?d.KS:d.GP,
        seasons:d.seasons, team:d.team }))
      .filter(r=>r.value>0)
      .sort((a,b)=>b.value-a.value)
      .slice(0,25);
  },[leagueStats,statSort]);

  const tabs: {key:TabType;label:string}[] = [
    {key:"timeline",label:"Season Timeline"},
    ...(allAwardNames.length>0?[{key:"awards" as TabType,label:"Award History"}]:[]),
    {key:"player_season_stats",label:"All-Time Stats"},
  ];

  if (!league) return (
    <div className="min-h-screen bg-background flex flex-col pb-14 md:pb-0">
      <SiteHeader/>
      <main className="flex-1 container py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-secondary rounded w-1/3"/>
          <div className="h-4 bg-secondary rounded w-1/4"/>
          <div className="h-32 bg-secondary rounded"/>
        </div>
      </main>
      <SiteFooter/>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader/>
      <main className="flex-1 container py-8">

        {/* Header */}
        <div className="mb-6 border-b-2 border-primary pb-3">
          <p className="text-xs text-muted-foreground font-sans uppercase tracking-wide">
            <Link to={`/league/${league.LeagueID}`} className="hover:text-accent">{league.LeagueName}</Link>
            {" · "}{getLeagueTierLabel(league.LeagueTier)}
          </p>
          <h1 className="font-display text-3xl font-bold text-foreground">
            {isCup?"Competition History":"League History"}
          </h1>
          <p className="text-sm text-muted-foreground font-sans mt-1">
            {seasons.length} {isCup?"edition":"season"}{seasons.length!==1?"s":""}
            {seasons.length>0?` · ${seasonLabel(seasons[seasons.length-1].seasonId)} — ${seasonLabel(seasons[0].seasonId)}`:""}
          </p>
        </div>

        {/* Most Titles */}
        {mostTitles.length>0&&(
          <div className="mb-6 border border-border rounded overflow-hidden">
            <div className="bg-table-header px-3 py-2">
              <h3 className="font-display text-sm font-bold text-table-header-foreground">
                {isCup?"Most Titles":"Most League Titles"}
              </h3>
            </div>
            <div className="flex flex-wrap divide-x divide-border bg-card">
              {mostTitles.map(([team,count],i)=>(
                <div key={team} className={`px-4 py-3 flex-1 min-w-[120px] ${i===0?MEDAL.gold.bg:""}`}>
                  <div className="flex items-center gap-2">
                    {i===0&&<span className="text-lg leading-none">🏆</span>}
                    <div>
                      <Link to={`/team/${encodeURIComponent(team)}`} className="text-accent hover:underline font-sans font-medium text-sm block leading-tight">{team}</Link>
                      <span className="text-xs text-muted-foreground font-mono">{count} title{count!==1?"s":""}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-0 mb-5 border-b border-border">
          {tabs.map(tab=>(
            <button key={tab.key} onClick={()=>setActiveTab(tab.key)}
              className={`px-5 py-2.5 text-sm font-sans font-medium transition-colors border-b-2 -mb-px ${
                activeTab===tab.key?"border-primary text-foreground":"border-transparent text-muted-foreground hover:text-foreground"}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ═══ SEASON TIMELINE ═══ */}
        {activeTab==="timeline"&&(
          <div className="space-y-3">
            {seasons.length===0&&(
              <div className="border border-border rounded p-8 text-center text-muted-foreground font-sans text-sm italic">
                No season data found for this {isCup?"competition":"league"}.
              </div>
            )}
            {seasons.map(s=>{
              const isExpanded=expandedSeason===s.seasonId;
              const seasonAwards=awardsBySeason.get(s.seasonId);
              const indivAwards=seasonAwards?[...seasonAwards.entries()].filter(([n])=>n!=="Team of the Year"):[];
              const medals=(["gold","silver",...(s.isCupFinal&&!s.third?[]:["bronze"])] as const);
              return (
                <div key={s.seasonId} className="border border-border rounded overflow-hidden">
                  <div className="cursor-pointer hover:bg-highlight/10 transition-colors bg-card"
                    onClick={()=>setExpandedSeason(isExpanded?null:s.seasonId)}>
                    <div className="flex items-center justify-between px-4 pt-3 pb-2">
                      <h3 className="font-display text-base font-bold text-foreground">{seasonLabel(s.seasonId)}</h3>
                      <span className="text-xs text-muted-foreground font-sans select-none">{isExpanded?"▲ collapse":"▼ details"}</span>
                    </div>
                    <div className={`grid gap-2 px-4 pb-3 ${medals.length===2?"grid-cols-2":"grid-cols-3"}`}>
                      {medals.map((medal,rank)=>{
                        const teamName=rank===0?s.champion:rank===1?s.runnerUp:s.third;
                        const m=MEDAL[medal];
                        const roleLabel=isCup&&rank===0?"Winner":isCup&&rank===1?"Runner-up":m.label;
                        return (
                          <div key={medal} className={`rounded border ${m.border} ${m.bg} px-3 py-2`}>
                            <span className={`text-xs font-bold font-mono px-1.5 py-0.5 rounded ${m.badge} inline-block mb-1`}>{roleLabel}</span>
                            {teamName
                              ? <Link to={`/team/${encodeURIComponent(teamName)}`} onClick={e=>e.stopPropagation()} className={`block text-sm font-medium font-sans hover:underline leading-snug ${m.text}`}>{teamName}</Link>
                              : <span className="block text-xs text-muted-foreground font-sans italic">—</span>}
                          </div>
                        );
                      })}
                    </div>
                    {indivAwards.length>0&&(
                      <div className="border-t border-border/60 bg-secondary/20 px-4 py-2 flex flex-wrap gap-x-5 gap-y-1">
                        {indivAwards.map(([awardName,entries])=>{
                          const winner=entries.find(e=>e.placement===1);
                          if (!winner) return null;
                          return (
                            <span key={awardName} className="text-xs font-sans">
                              <span className="text-muted-foreground">{awardName}: </span>
                              <Link to={`/player/${winner.playerid}`} onClick={e=>e.stopPropagation()} className="text-accent hover:underline font-medium">
                                {playerMap.get(winner.playerid)||`#${winner.playerid}`}
                              </Link>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {isExpanded&&(
                    <div className="border-t border-border">
                      {/* Domestic standings */}
                      {!s.isCupFinal&&s.teams.length>0&&(
                        <div className="p-4">
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Final Standings</h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm font-sans">
                              <thead><tr className="bg-secondary">
                                {["#","Team","GP","Pts","GF","GA","GD","GSC"].map((h,i)=>(
                                  <th key={h} className={`px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground ${i<2?"text-left":"text-right"}`}>{h}</th>
                                ))}
                              </tr></thead>
                              <tbody>
                                {s.teams.map((t,i)=>{
                                  const rowBg=i===0?MEDAL.gold.rowBg:i===1?MEDAL.silver.rowBg:i===2?MEDAL.bronze.rowBg:i%2===1?"bg-table-stripe":"bg-card";
                                  return (
                                    <tr key={t.name} className={`border-t border-border ${rowBg}`}>
                                      <td className="px-2 py-1.5 font-mono text-muted-foreground text-xs">{i+1}</td>
                                      <td className="px-2 py-1.5 font-medium"><Link to={`/team/${encodeURIComponent(t.name)}`} className="text-accent hover:underline">{t.name}</Link></td>
                                      <td className="px-2 py-1.5 text-right font-mono">{t.gp}</td>
                                      <td className="px-2 py-1.5 text-right font-mono font-bold">{t.pts}</td>
                                      <td className="px-2 py-1.5 text-right font-mono">{t.gf}</td>
                                      <td className="px-2 py-1.5 text-right font-mono">{t.ga}</td>
                                      <td className="px-2 py-1.5 text-right font-mono">{t.gf-t.ga}</td>
                                      <td className="px-2 py-1.5 text-right font-mono">{t.gsc}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Season Awards */}
                      {seasonAwards&&seasonAwards.size>0&&(
                        <div className="p-4 border-t border-border">
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Season Awards</h4>
                          <div className="space-y-2.5">
                            {indivAwards.map(([awardName,entries])=>{
                              const sorted=[...entries].sort((a,b)=>a.placement-b.placement).slice(0,3);
                              return (
                                <div key={awardName} className="flex flex-wrap items-center gap-2">
                                  <Link to={`/league/${id}/award/${encodeURIComponent(awardName)}`} className="text-sm font-semibold text-accent hover:underline font-sans w-48 shrink-0">{awardName} →</Link>
                                  <div className="flex gap-2 flex-wrap">
                                    {sorted.map(e=>{
                                      const m=e.placement===1?MEDAL.gold:e.placement===2?MEDAL.silver:MEDAL.bronze;
                                      return (
                                        <span key={e.placement} className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded border ${m.border} ${m.bg}`}>
                                          <span className={`font-mono font-bold ${m.text}`}>{ordinal(e.placement)}</span>
                                          <Link to={`/player/${e.playerid}`} className="text-accent hover:underline">{playerMap.get(e.playerid)||`#${e.playerid}`}</Link>
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                            {/* TOTY */}
                            {seasonAwards.has("Team of the Year")&&(()=>{
                              const toty=seasonAwards.get("Team of the Year")!;
                              const plCounts=new Map<number,number>();
                              toty.forEach(e=>plCounts.set(e.placement,(plCounts.get(e.placement)||0)+1));
                              const isTeamNum=[...plCounts.values()].some(c=>c>1);
                              const pls=[...new Set(toty.map(e=>e.placement))].sort();
                              return (
                                <div className="pt-1">
                                  <Link to={`/league/${id}/award/${encodeURIComponent("Team of the Year")}`} className="text-sm font-semibold text-accent hover:underline font-sans block mb-1.5">Team of the Year →</Link>
                                  {isTeamNum?pls.map(pl=>{
                                    const m=pl===1?MEDAL.gold:pl===2?MEDAL.silver:MEDAL.bronze;
                                    return (
                                      <div key={pl} className="mb-1 flex gap-2 flex-wrap items-center">
                                        <span className={`text-xs font-bold ${m.text} w-24`}>{ordinal(pl)} Team:</span>
                                        {toty.filter(e=>e.placement===pl).map((e,i,arr)=>(
                                          <span key={e.playerid}><Link to={`/player/${e.playerid}`} className="text-accent hover:underline text-xs">{playerMap.get(e.playerid)||`#${e.playerid}`}</Link>{i<arr.length-1&&<span className="text-muted-foreground">, </span>}</span>
                                        ))}
                                      </div>
                                    );
                                  }):(
                                    <div className="flex flex-wrap gap-1">
                                      {[...toty].sort((a,b)=>a.placement-b.placement).map((e,i,arr)=>(
                                        <span key={e.playerid}><Link to={`/player/${e.playerid}`} className="text-accent hover:underline text-xs">{playerMap.get(e.playerid)||`#${e.playerid}`}</Link>{i<arr.length-1&&<span className="text-muted-foreground">, </span>}</span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      )}

                      {/* Match Results */}
                      {seasonResults.length>0&&(
                        <div className="p-4 border-t border-border">
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Results ({seasonResults.length} matches)</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[360px] overflow-y-auto pr-1">
                            {seasonResults.map((r:any)=>(
                              <Link key={r.MatchID} to={`/match/${r.MatchID}`} className="border border-border rounded bg-card hover:bg-highlight/20 p-2 text-sm font-sans block">
                                <div className="text-xs text-muted-foreground mb-1">Week {r.WeekID}</div>
                                <div className={`flex justify-between ${r.HomeTeamScore>r.AwayTeamScore?"font-bold":""}`}>
                                  <span className="truncate mr-2">{teamMap[r.HomeTeamID]||"?"}</span>
                                  <span className="font-mono">{r.HomeTeamScore}</span>
                                </div>
                                <div className={`flex justify-between ${r.AwayTeamScore>r.HomeTeamScore?"font-bold":""}`}>
                                  <span className="truncate mr-2">{teamMap[r.AwayTeamID]||"?"}</span>
                                  <span className="font-mono">{r.AwayTeamScore}</span>
                                </div>
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ═══ AWARD HISTORY TAB ═══ */}
        {activeTab==="awards"&&(
          <div className="space-y-6">
            {allAwardNames.length===0&&<p className="text-sm text-muted-foreground font-sans italic">No award history found.</p>}
            {allAwardNames.map(awardName=>{
              const isTOTY=awardName==="Team of the Year";
              const allWinners=awards.filter(a=>a.awardname===awardName&&a.placement===1).sort((a,b)=>a.seasonid-b.seasonid);
              const winCounts=new Map<number,number>();
              allWinners.forEach(w=>winCounts.set(w.playerid,(winCounts.get(w.playerid)||0)+1));
              const leaders=[...winCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,3);
              const totyEntries=awards.filter(a=>a.awardname==="Team of the Year");
              const totyPlCounts=new Map<number,number>();
              totyEntries.forEach(e=>totyPlCounts.set(e.placement,(totyPlCounts.get(e.placement)||0)+1));
              const totyIsTeamNum=[...totyPlCounts.values()].some(c=>c>1);
              return (
                <div key={awardName} className="border border-border rounded overflow-hidden">
                  <div className="bg-table-header px-4 py-2.5 flex items-center justify-between">
                    <h3 className="font-display text-sm font-bold text-table-header-foreground">{awardName}</h3>
                    <Link to={`/league/${id}/award/${encodeURIComponent(awardName)}`} className="text-xs text-table-header-foreground/70 hover:text-table-header-foreground font-sans">Full history →</Link>
                  </div>
                  {!isTOTY&&leaders.length>0&&(
                    <div className="flex flex-wrap divide-x divide-border border-b border-border">
                      {leaders.map(([pid,count],i)=>{
                        const m=i===0?MEDAL.gold:i===1?MEDAL.silver:MEDAL.bronze;
                        return (
                          <div key={pid} className={`px-4 py-2 flex-1 min-w-[130px] flex items-center gap-2 ${m.bg}`}>
                            <span className={`text-sm font-bold font-mono ${m.text}`}>{count}×</span>
                            <Link to={`/player/${pid}`} className="text-accent hover:underline text-sm font-sans font-medium">{playerMap.get(pid)||`#${pid}`}</Link>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {isTOTY?(
                    <div className="overflow-x-auto"><table className="w-full text-sm font-sans">
                      <thead><tr className="bg-secondary">
                        <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Season</th>
                        {totyIsTeamNum&&<th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Team</th>}
                        <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Players</th>
                      </tr></thead>
                      <tbody>
                        {[...new Set(totyEntries.map(e=>e.seasonid))].sort((a,b)=>a-b).flatMap((sid,i)=>{
                          const entries=totyEntries.filter(e=>e.seasonid===sid);
                          if (totyIsTeamNum) {
                            return [...new Set(entries.map(e=>e.placement))].sort().map(pl=>{
                              const m=pl===1?MEDAL.gold:pl===2?MEDAL.silver:MEDAL.bronze;
                              return (
                                <tr key={`${sid}-${pl}`} className={`border-t border-border ${(i+pl)%2===1?"bg-table-stripe":"bg-card"}`}>
                                  <td className="px-3 py-1.5 font-mono font-medium text-accent">{seasonLabel(sid)}</td>
                                  <td className={`px-3 py-1.5 text-xs font-bold ${m.text}`}>{pl===1?"1st":pl===2?"2nd":"3rd"} Team</td>
                                  <td className="px-3 py-1.5"><div className="flex flex-wrap gap-2">
                                    {entries.filter(e=>e.placement===pl).map(e=><Link key={e.playerid} to={`/player/${e.playerid}`} className="text-accent hover:underline text-xs">{playerMap.get(e.playerid)||`#${e.playerid}`}</Link>)}
                                  </div></td>
                                </tr>
                              );
                            });
                          } else {
                            return [(<tr key={sid} className={`border-t border-border ${i%2===1?"bg-table-stripe":"bg-card"}`}>
                              <td className="px-3 py-1.5 font-mono font-medium text-accent">{seasonLabel(sid)}</td>
                              <td className="px-3 py-1.5"><div className="flex flex-wrap gap-2">
                                {entries.sort((a,b)=>a.placement-b.placement).map(e=><Link key={e.playerid} to={`/player/${e.playerid}`} className="text-accent hover:underline text-xs">{playerMap.get(e.playerid)||`#${e.playerid}`}</Link>)}
                              </div></td>
                            </tr>)];
                          }
                        })}
                      </tbody>
                    </table></div>
                  ):(
                    {(()=>{
                      const awardEntries = awards.filter(a=>a.awardname===awardName);
                      const allPl = [...new Set(awardEntries.map(e=>e.placement))].sort((a,b)=>a-b);
                      const maxPl = Math.min(Math.max(...allPl,1),5);
                      const showPl = Array.from({length:maxPl},(_,i)=>i+1).filter(p=>allPl.includes(p));
                      const PLABEL: Record<number,string> = {1:"🥇 Winner",2:"🥈 Runner-up",3:"🥉 3rd Place",4:"4th Place",5:"5th Place"};
                      const PBG: Record<number,string> = {1:MEDAL.gold.rowBg,2:MEDAL.silver.rowBg,3:MEDAL.bronze.rowBg,4:"",5:""};
                      return (
                        <div className="overflow-x-auto"><table className="w-full text-sm font-sans">
                          <thead><tr className="bg-secondary">
                            <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Season</th>
                            {showPl.map(p=><th key={p} className={`px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground ${PBG[p]||""}`}>{PLABEL[p]||`${p}th`}</th>)}
                          </tr></thead>
                          <tbody>
                            {allWinners.map((w,i)=>{
                              const se=awardEntries.filter(e=>e.seasonid===w.seasonid);
                              return (
                                <tr key={w.seasonid} className={`border-t border-border ${i%2===1?"bg-table-stripe":"bg-card"} hover:bg-highlight/20`}>
                                  <td className="px-3 py-1.5 font-medium text-accent font-mono">{seasonLabel(w.seasonid)}</td>
                                  {showPl.map(p=>{
                                    const e=se.find(x=>x.placement===p);
                                    return (
                                      <td key={p} className={`px-3 py-1.5 ${PBG[p]||""}`}>
                                        {e
                                          ?<Link to={`/player/${e.playerid}`} className={`text-accent hover:underline ${p===1?"font-semibold":""}`}>{playerMap.get(e.playerid)||`#${e.playerid}`}</Link>
                                          :showPl.length>1?<span className="text-muted-foreground">—</span>:null}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table></div>
                      );
                    })()}
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ═══ ALL-TIME STATS TAB ═══ */}
        {activeTab==="player_season_stats"&&(
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-sans font-medium text-muted-foreground">Statistic:</span>
              {statsLoading
                ? <span className="text-sm text-muted-foreground font-sans italic">Loading stats…</span>
                : statOptions.length===0
                  ? <span className="text-sm text-muted-foreground font-sans italic">No stats available for this {isCup?"competition":"league"}.</span>
                  : statOptions.map(opt=>(
                    <button key={opt.key} onClick={()=>setStatSort(opt.key)}
                      className={`px-3 py-1 text-sm font-sans rounded border transition-colors ${statSort===opt.key?"bg-primary text-primary-foreground border-primary":"bg-card text-foreground border-border hover:bg-secondary"}`}>
                      {opt.label}
                    </button>
                  ))}
            </div>
            {!statsLoading&&statOptions.length>0&&(
              <div className="border border-border rounded overflow-hidden">
                <div className="bg-table-header px-3 py-2">
                  <h3 className="font-display text-sm font-bold text-table-header-foreground">
                    All-Time {statOptions.find(o=>o.key===statSort)?.label} Leaders — {league.LeagueName}
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm font-sans">
                    <thead><tr className="bg-secondary">
                      <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground w-8">#</th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Player</th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden sm:table-cell">Team</th>
                      <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Seasons</th>
                      <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">{statOptions.find(o=>o.key===statSort)?.label}</th>
                    </tr></thead>
                    <tbody>
                      {statLeaders.map((leader,i)=>{
                        const rowBg=i===0?MEDAL.gold.rowBg:i===1?MEDAL.silver.rowBg:i===2?MEDAL.bronze.rowBg:i%2===1?"bg-table-stripe":"bg-card";
                        return (
                          <tr key={leader.PlayerName} className={`border-t border-border ${rowBg} hover:bg-highlight/20`}>
                            <td className="px-3 py-2 font-mono text-muted-foreground text-xs">{i+1}</td>
                            <td className="px-3 py-2 font-medium">{leader.PlayerID?<Link to={`/player/${leader.PlayerID}`} className="text-accent hover:underline">{leader.PlayerName}</Link>:leader.PlayerName}</td>
                            <td className="px-3 py-2 text-muted-foreground text-xs hidden sm:table-cell"><Link to={`/team/${encodeURIComponent(leader.team)}`} className="hover:text-accent hover:underline">{leader.team}</Link></td>
                            <td className="px-3 py-2 text-right font-mono text-muted-foreground">{leader.seasons}</td>
                            <td className="px-3 py-2 text-right font-mono font-bold">{leader.value.toLocaleString()}</td>
                          </tr>
                        );
                      })}
                      {!statsLoading&&statLeaders.length===0&&(
                        <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground italic">No stat data found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

      </main>
      <SiteFooter/>
    </div>
  );
}
