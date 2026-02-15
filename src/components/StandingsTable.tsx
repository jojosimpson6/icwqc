interface StandingsTableProps {
  title: string;
  teams: { name: string; w: number; l: number; pct: string; gb: string; streak: string }[];
}

export function StandingsTable({ title, teams }: StandingsTableProps) {
  return (
    <div className="border border-border rounded overflow-hidden">
      <div className="bg-table-header px-3 py-2">
        <h3 className="font-display text-sm font-bold text-table-header-foreground">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-sans">
          <thead>
            <tr className="bg-secondary">
              <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Team</th>
              <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">W</th>
              <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">L</th>
              <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">PCT</th>
              <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">GB</th>
              <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Strk</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((team, i) => (
              <tr
                key={team.name}
                className={`border-t border-border ${
                  i % 2 === 1 ? "bg-table-stripe" : "bg-card"
                } hover:bg-highlight/20 transition-colors`}
              >
                <td className="px-3 py-1.5 font-medium text-accent hover:underline cursor-pointer">{team.name}</td>
                <td className="px-3 py-1.5 text-right font-mono">{team.w}</td>
                <td className="px-3 py-1.5 text-right font-mono">{team.l}</td>
                <td className="px-3 py-1.5 text-right font-mono font-bold">{team.pct}</td>
                <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">{team.gb}</td>
                <td className={`px-3 py-1.5 text-right font-mono ${
                  team.streak.startsWith("W") ? "text-stat-green" : "text-stat-red"
                }`}>{team.streak}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
