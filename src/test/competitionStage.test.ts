import { describe, it, expect } from "vitest";
import {
  seasonLabel,
  ordinal,
  cupRoundName,
  buildCupStageMap,
  computeStageReached,
  QUAL_PARENT_MAP,
  TournamentMatch,
} from "@/lib/competitionStage";

describe("seasonLabel", () => {
  it("renders a season id as a YYYY–YY range", () => {
    expect(seasonLabel(2020)).toBe("2019–20");
    expect(seasonLabel(2000)).toBe("1999–00");
  });
});

describe("ordinal", () => {
  it("handles the standard suffixes", () => {
    expect(ordinal(1)).toBe("1st");
    expect(ordinal(2)).toBe("2nd");
    expect(ordinal(3)).toBe("3rd");
    expect(ordinal(4)).toBe("4th");
  });
  it("handles the 'teens' exception (11th/12th/13th, not 11st/12nd/13rd)", () => {
    expect(ordinal(11)).toBe("11th");
    expect(ordinal(12)).toBe("12th");
    expect(ordinal(13)).toBe("13th");
  });
  it("handles larger numbers", () => {
    expect(ordinal(21)).toBe("21st");
    expect(ordinal(22)).toBe("22nd");
    expect(ordinal(101)).toBe("101st");
  });
});

describe("cupRoundName", () => {
  it("names the standard late-tournament rounds", () => {
    expect(cupRoundName(1, false)).toBe("Final");
    expect(cupRoundName(1, true)).toBe("CL Final");
    expect(cupRoundName(2, false)).toBe("Semifinals");
    expect(cupRoundName(4, false)).toBe("Quarterfinals");
  });
  it("falls back to an ordinal placeholder for earlier rounds", () => {
    expect(cupRoundName(8, false)).toBe("__ordinal__8");
  });
});

describe("buildCupStageMap", () => {
  it("labels a straightforward single-leg bracket (QF -> SF -> Final)", () => {
    const matches: TournamentMatch[] = [
      // Quarterfinals — week 1, 4 matches
      { homeId: 1, awayId: 2, homeScore: 100, awayScore: 90, weekId: 1 },
      { homeId: 3, awayId: 4, homeScore: 100, awayScore: 90, weekId: 1 },
      { homeId: 5, awayId: 6, homeScore: 100, awayScore: 90, weekId: 1 },
      { homeId: 7, awayId: 8, homeScore: 100, awayScore: 90, weekId: 1 },
      // Semifinals — week 2, 2 matches
      { homeId: 1, awayId: 3, homeScore: 100, awayScore: 90, weekId: 2 },
      { homeId: 5, awayId: 7, homeScore: 100, awayScore: 90, weekId: 2 },
      // Final — week 3, 1 match
      { homeId: 1, awayId: 5, homeScore: 100, awayScore: 90, weekId: 3 },
    ];
    const map = buildCupStageMap(matches, false);
    expect(map.get(1)).toBe("Quarterfinals");
    expect(map.get(2)).toBe("Semifinals");
    expect(map.get(3)).toBe("Final");
  });

  it("collapses two-leg ties into a single round label", () => {
    const matches: TournamentMatch[] = [
      { homeId: 1, awayId: 2, homeScore: 100, awayScore: 90, weekId: 1 },
      { homeId: 3, awayId: 4, homeScore: 100, awayScore: 90, weekId: 1 },
      { homeId: 2, awayId: 1, homeScore: 100, awayScore: 95, weekId: 2 }, // 2nd leg, reversed venue
      { homeId: 4, awayId: 3, homeScore: 100, awayScore: 95, weekId: 2 },
    ];
    const map = buildCupStageMap(matches, false);
    // Both legs of the same tie should carry the same round label.
    expect(map.get(1)).toBe(map.get(2));
  });
});

describe("computeStageReached", () => {
  describe("single-elimination cup bracket", () => {
    // Semifinals (week 1): team1 beats team2, team3 beats team4.
    // Final (week 2): team1 beats team3.
    const matches: TournamentMatch[] = [
      { homeId: 1, awayId: 2, homeScore: 110, awayScore: 90, weekId: 1 },
      { homeId: 3, awayId: 4, homeScore: 110, awayScore: 90, weekId: 1 },
      { homeId: 1, awayId: 3, homeScore: 100, awayScore: 80, weekId: 2 },
    ];

    it("crowns the final winner champion", () => {
      expect(computeStageReached(1, 15, matches)).toBe("🏆 Champion");
    });
    it("marks the final loser as runner-up", () => {
      expect(computeStageReached(3, 15, matches)).toBe("Runner-Up");
    });
    it("marks semifinal losers with the round they were eliminated in", () => {
      expect(computeStageReached(2, 15, matches)).toBe("Semifinals");
      expect(computeStageReached(4, 15, matches)).toBe("Semifinals");
    });
  });

  describe("international tournament with a 3rd-place playoff", () => {
    // Semifinals (week 1): team1 beats team2, team3 beats team4.
    // Final + 3rd place playoff (week 2): team1 beats team3 (final), team2 beats team4 (3rd place).
    const matches: TournamentMatch[] = [
      { homeId: 1, awayId: 2, homeScore: 100, awayScore: 90, weekId: 1 },
      { homeId: 3, awayId: 4, homeScore: 100, awayScore: 90, weekId: 1 },
      { homeId: 1, awayId: 3, homeScore: 100, awayScore: 80, weekId: 2 },
      { homeId: 2, awayId: 4, homeScore: 100, awayScore: 90, weekId: 2 },
    ];

    it("identifies champion, runner-up, 3rd and 4th place correctly", () => {
      expect(computeStageReached(1, 20, matches)).toBe("🏆 Champion");
      expect(computeStageReached(3, 20, matches)).toBe("Runner-Up");
      expect(computeStageReached(2, 20, matches)).toBe("3rd Place");
      expect(computeStageReached(4, 20, matches)).toBe("4th Place");
    });
  });

  describe("qualifying group stage", () => {
    // Round-robin among teams 1-4. Team 1 wins every match; team 4 loses every match.
    const matches: TournamentMatch[] = [
      { homeId: 1, awayId: 2, homeScore: 110, awayScore: 100, weekId: 1 },
      { homeId: 1, awayId: 3, homeScore: 110, awayScore: 100, weekId: 1 },
      { homeId: 1, awayId: 4, homeScore: 110, awayScore: 100, weekId: 2 },
      { homeId: 2, awayId: 3, homeScore: 105, awayScore: 100, weekId: 2 },
      { homeId: 2, awayId: 4, homeScore: 105, awayScore: 100, weekId: 3 },
      { homeId: 3, awayId: 4, homeScore: 105, awayScore: 100, weekId: 3 },
    ];
    const leagueId = 21; // a qualifying competition per QUAL_PARENT_MAP

    it("reports group placement", () => {
      expect(computeStageReached(1, leagueId, matches)).toMatch(/^1st in Group/);
      expect(computeStageReached(4, leagueId, matches)).toMatch(/^4th in Group/);
    });

    it("notes advancement to the parent competition when flagged", () => {
      const withAdvancement = computeStageReached(1, leagueId, matches, { advancedToParent: true });
      expect(withAdvancement).toContain("Advanced");
      const withoutAdvancement = computeStageReached(1, leagueId, matches, { advancedToParent: false });
      expect(withoutAdvancement).not.toContain("Advanced");
    });

    it("recognizes the qualifier -> parent competition mapping used elsewhere in the app", () => {
      expect(QUAL_PARENT_MAP[21]).toBe(20);
      expect(QUAL_PARENT_MAP[29]).toBe(28);
    });
  });

  it("returns a placeholder when there is no match data", () => {
    expect(computeStageReached(1, 15, [])).toBe("—");
  });
});
