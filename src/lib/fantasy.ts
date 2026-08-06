export interface ScoringRule {
  key: string;
  label: string;
  points: number;
}

/** Seeded into fantasy_scoring_rules when a league is created. */
export const DEFAULT_SCORING_RULES: ScoringRule[] = [
  { key: "goal_scored", label: "Goal scored", points: 10 },
  { key: "shot_attempt", label: "Shot attempt", points: 1 },
  { key: "pass_completed", label: "Pass completed", points: 1 },
  { key: "pass_incomplete", label: "Incomplete pass", points: -1 },
  { key: "keeper_save", label: "Keeper save", points: 4 },
  { key: "keeper_parry", label: "Keeper parry", points: 2 },
  { key: "goal_conceded", label: "Goal conceded", points: -2 },
  { key: "snitch_catch", label: "Snitch catch", points: 30 },
  { key: "snitch_spotted", label: "Snitch spotted", points: 3 },
  { key: "catch_attempt", label: "Catch attempt", points: 1 },
  { key: "bludger_hit", label: "Bludger hit", points: 3 },
  { key: "turnover_forced", label: "Turnover forced", points: 4 },
  { key: "teammate_protected", label: "Teammate protected", points: 2 },
  { key: "match_played", label: "Match played", points: 2 },
];

/** 1994 -> "1994–95" */
export function seasonLabel(seasonId: number): string {
  const next = (seasonId + 1) % 100;
  return `${seasonId}–${String(next).padStart(2, "0")}`;
}
