interface ScoreCardProps {
  away: string;
  home: string;
  awayScore: number;
  homeScore: number;
  status: string;
  date: string;
}

export function ScoreCard({ away, home, awayScore, homeScore, status, date }: ScoreCardProps) {
  return (
    <div className="border border-border rounded bg-card hover:shadow-md transition-shadow cursor-pointer min-w-[180px]">
      <div className="px-3 py-1 bg-secondary text-xs text-muted-foreground font-sans border-b border-border">
        {date} · {status}
      </div>
      <div className="px-3 py-2 space-y-1">
        <div className={`flex justify-between text-sm font-sans ${awayScore > homeScore ? "font-bold" : ""}`}>
          <span>{away}</span>
          <span className="font-mono">{awayScore}</span>
        </div>
        <div className={`flex justify-between text-sm font-sans ${homeScore > awayScore ? "font-bold" : ""}`}>
          <span>{home}</span>
          <span className="font-mono">{homeScore}</span>
        </div>
      </div>
    </div>
  );
}
