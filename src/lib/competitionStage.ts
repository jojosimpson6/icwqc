// Shared helpers for computing competition stage/round labels for cup, Champions
// League, and international tournaments. Extracted from TeamPage so the same
// battle-tested logic can be reused by ManagerProfile (and anywhere else that
// needs "how far did this team get in this tournament" style displays).

export interface TournamentMatch {
  matchId?: number;
  homeId: number;
  awayId: number;
  homeScore: number;
  awayScore: number;
  weekId: number;
}

export function seasonLabel(id: number): string {
  return `${id - 1}–${String(id).slice(-2)}`;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Map match count per week → round label (ordinal for cups, descriptive for CL)
// Uses match count (not team count) so variable-draw tournaments work correctly.
export function cupRoundName(matchCount: number, isCL: boolean): string {
  if (matchCount === 1) return isCL ? "CL Final" : "Final";
  if (matchCount === 2) return "Semifinals";
  if (matchCount === 4) return "Quarterfinals";
  return `__ordinal__${matchCount}`;
}

// Build a map of weekId → round label for a cup/CL tournament.
export function buildCupStageMap(
  knockoutMatches: TournamentMatch[],
  isCL: boolean
): Map<number, string> {
  const weekMap = new Map<number, TournamentMatch[]>();
  knockoutMatches.forEach(m => {
    if (!weekMap.has(m.weekId)) weekMap.set(m.weekId, []);
    weekMap.get(m.weekId)!.push(m);
  });
  const sortedWeeks = [...weekMap.keys()].sort((a, b) => a - b);

  const weekToRound = new Map<number, string>();
  let wi = 0;
  while (wi < sortedWeeks.length) {
    const w = sortedWeeks[wi];
    const cnt = weekMap.get(w)!.length;
    const lbl = cupRoundName(cnt, isCL);
    weekToRound.set(w, lbl);
    if (wi + 1 < sortedWeeks.length && weekMap.get(sortedWeeks[wi + 1])!.length === cnt && cnt > 1) {
      weekToRound.set(sortedWeeks[wi + 1], lbl);
      wi += 2;
    } else {
      wi++;
    }
  }

  const ordinalRounds: number[] = [];
  const seenRounds = new Set<string>();
  sortedWeeks.forEach(w => {
    const lbl = weekToRound.get(w)!;
    if (lbl.startsWith("__ordinal__") && !seenRounds.has(lbl)) {
      seenRounds.add(lbl);
      ordinalRounds.push(w);
    }
  });

  const ordinals = ["1st Round", "2nd Round", "3rd Round", "4th Round", "5th Round", "6th Round"];
  const ordinalMap = new Map<string, string>();
  ordinalRounds.forEach((w, i) => {
    ordinalMap.set(weekToRound.get(w)!, ordinals[i] || `${i + 1}th Round`);
  });

  const result = new Map<number, string>();
  sortedWeeks.forEach(w => {
    const lbl = weekToRound.get(w)!;
    result.set(w, lbl.startsWith("__ordinal__") ? (ordinalMap.get(lbl) || lbl) : lbl);
  });
  return result;
}

export const QUAL_PARENT_MAP: Record<number, number> = { 21: 20, 23: 22, 25: 24, 27: 26, 29: 28 };

/**
 * Compute the "stage reached" label for a given team in a given cup / CL /
 * international / qualifying tournament, given ALL matches played in that
 * tournament (not just the team's own matches).
 */
export function computeStageReached(
  teamId: number,
  leagueId: number,
  allMatches: TournamentMatch[],
  opts: { isCL?: boolean; advancedToParent?: boolean } = {}
): string {
  if (!allMatches || allMatches.length === 0) return "—";
  const isQualifier = leagueId in QUAL_PARENT_MAP;

  // Qualifying competitions: show group placing + advancement to parent comp
  if (isQualifier) {
    const adj = new Map<number, Set<number>>();
    allMatches.forEach(m => {
      if (!m.homeId || !m.awayId) return;
      if (!adj.has(m.homeId)) adj.set(m.homeId, new Set());
      if (!adj.has(m.awayId)) adj.set(m.awayId, new Set());
      adj.get(m.homeId)!.add(m.awayId);
      adj.get(m.awayId)!.add(m.homeId);
    });
    const visited = new Set<number>();
    const groups: number[][] = [];
    for (const t of adj.keys()) {
      if (visited.has(t)) continue;
      const g: number[] = []; const q = [t];
      while (q.length) {
        const x = q.shift()!;
        if (visited.has(x)) continue;
        visited.add(x); g.push(x);
        adj.get(x)?.forEach(n => { if (!visited.has(n)) q.push(n); });
      }
      groups.push(g.sort((a, b) => a - b));
    }
    groups.sort((a, b) => a[0] - b[0]);
    const myGroupIdx = groups.findIndex(g => g.includes(teamId));
    if (myGroupIdx < 0) return opts.advancedToParent ? "Advanced" : "Group Stage";
    const groupTeams = groups[myGroupIdx];
    const teamSet = new Set(groupTeams);
    const stats = new Map<number, { pts: number; gf: number; ga: number }>();
    groupTeams.forEach(t => stats.set(t, { pts: 0, gf: 0, ga: 0 }));
    allMatches.forEach(m => {
      if (!teamSet.has(m.homeId) || !teamSet.has(m.awayId)) return;
      const h = stats.get(m.homeId)!; const a = stats.get(m.awayId)!;
      h.gf += m.homeScore; h.ga += m.awayScore;
      a.gf += m.awayScore; a.ga += m.homeScore;
      if (m.homeScore > m.awayScore) {
        const diff = m.homeScore - m.awayScore;
        const bonus = diff > 150 ? 5 : diff > 100 ? 3 : diff > 50 ? 1 : 0;
        h.pts += 2 + bonus;
      } else if (m.awayScore > m.homeScore) {
        const diff = m.awayScore - m.homeScore;
        const bonus = diff > 150 ? 5 : diff > 100 ? 3 : diff > 50 ? 1 : 0;
        a.pts += 2 + bonus;
      } else {
        h.pts += 1; a.pts += 1;
      }
    });
    const sorted = [...groupTeams].sort((a, b) => {
      const sa = stats.get(a)!, sb = stats.get(b)!;
      if (sb.pts !== sa.pts) return sb.pts - sa.pts;
      return (sb.gf - sb.ga) - (sa.gf - sa.ga);
    });
    const pos = sorted.indexOf(teamId) + 1;
    const groupLabel = String.fromCharCode(65 + myGroupIdx);
    const posLabel = pos === 1 ? "1st" : pos === 2 ? "2nd" : pos === 3 ? "3rd" : `${pos}th`;
    return `${posLabel} in Group ${groupLabel}${opts.advancedToParent ? " · ✓ Advanced" : ""}`;
  }

  // International comps (LeagueID ≥ 20): last week has Final + 3rd-place playoff.
  if (leagueId >= 20) {
    const teamMatches = allMatches.filter(m => m.homeId === teamId || m.awayId === teamId);
    if (teamMatches.length === 0) return "—";
    const maxWeek = Math.max(...allMatches.map(m => m.weekId));
    const lastWeekMatches = allMatches.filter(m => m.weekId === maxWeek);
    const semiMatches = allMatches.filter(m => m.weekId === maxWeek - 1);
    if (lastWeekMatches.length === 2 && semiMatches.length === 2) {
      const semiWinners = new Set<number>();
      semiMatches.forEach(m => {
        if (m.homeScore >= m.awayScore && m.homeId) semiWinners.add(m.homeId);
        else if (m.awayScore > m.homeScore && m.awayId) semiWinners.add(m.awayId);
      });
      const finalMatch = lastWeekMatches.find(m =>
        m.homeId && m.awayId && semiWinners.has(m.homeId) && semiWinners.has(m.awayId)
      );
      const thirdMatch = lastWeekMatches.find(m => m !== finalMatch);
      if (finalMatch && (finalMatch.homeId === teamId || finalMatch.awayId === teamId)) {
        const isHome = finalMatch.homeId === teamId;
        const won = (isHome ? finalMatch.homeScore : finalMatch.awayScore) > (isHome ? finalMatch.awayScore : finalMatch.homeScore);
        return won ? "🏆 Champion" : "Runner-Up";
      }
      if (thirdMatch && (thirdMatch.homeId === teamId || thirdMatch.awayId === teamId)) {
        const isHome = thirdMatch.homeId === teamId;
        const won = (isHome ? thirdMatch.homeScore : thirdMatch.awayScore) > (isHome ? thirdMatch.awayScore : thirdMatch.homeScore);
        return won ? "3rd Place" : "4th Place";
      }
    }
    const lastMyWeek = Math.max(...teamMatches.map(m => m.weekId));
    if (lastMyWeek === maxWeek - 1) return "Semifinals";
    if (lastMyWeek === maxWeek - 2) return "Quarterfinals";
    return `Round ${lastMyWeek}`;
  }

  // For CL: knockout starts at week 7; for cups: all weeks are knockout
  const knockoutMatches = opts.isCL ? allMatches.filter(m => m.weekId > 6) : allMatches;
  if (knockoutMatches.length === 0) {
    return opts.isCL ? "Group Stage" : "—";
  }

  const weekToRound = buildCupStageMap(knockoutMatches, opts.isCL ?? false);
  const teamKOMMatches = knockoutMatches.filter(m => m.homeId === teamId || m.awayId === teamId);
  if (teamKOMMatches.length === 0) return opts.isCL ? "Group Stage" : "—";
  const lastWeek = Math.max(...teamKOMMatches.map(m => m.weekId));
  const stageName = weekToRound.get(lastWeek) || "—";

  const lastRoundMatches = teamKOMMatches.filter(m => weekToRound.get(m.weekId) === stageName);
  let teamAgg = 0, oppAgg = 0;
  lastRoundMatches.forEach(m => {
    const isHome = m.homeId === teamId;
    teamAgg += isHome ? m.homeScore : m.awayScore;
    oppAgg += isHome ? m.awayScore : m.homeScore;
  });
  const won = teamAgg > oppAgg;

  if ((stageName === "Final" || stageName === "CL Final") && won) return "🏆 Champion";
  if ((stageName === "Final" || stageName === "CL Final") && !won) return "Runner-Up";
  return stageName;
}
