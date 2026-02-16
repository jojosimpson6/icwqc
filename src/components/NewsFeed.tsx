const dummyNews = [
  {
    date: "15 Feb 1995",
    title: "Season 1995 reaches final matchday",
    body: "The 1995 season of the British and Irish Quidditch League concludes this week with several playoff spots still up for grabs.",
  },
  {
    date: "12 Feb 1995",
    title: "European Cup group stage heats up",
    body: "With only two matchdays remaining in the group phase, several teams are fighting for qualification to the knockout rounds.",
  },
  {
    date: "8 Feb 1995",
    title: "Champions League draw announced",
    body: "The draw for the next round of the Champions League has been completed. Several marquee matchups await fans.",
  },
  {
    date: "3 Feb 1995",
    title: "Record-breaking Snitch catch times this season",
    body: "Multiple matches this season have seen Snitch catches in under 20 minutes, suggesting a trend toward faster-paced games.",
  },
];

export function NewsFeed() {
  return (
    <div className="border border-border rounded overflow-hidden">
      <div className="bg-table-header px-3 py-2">
        <h3 className="font-display text-sm font-bold text-table-header-foreground">News & Announcements</h3>
      </div>
      <div className="bg-card divide-y divide-border">
        {dummyNews.map((item, i) => (
          <div key={i} className="px-3 py-3">
            <p className="text-xs text-muted-foreground font-sans mb-1">{item.date}</p>
            <p className="font-sans font-semibold text-sm text-foreground mb-1">{item.title}</p>
            <p className="text-xs text-muted-foreground font-sans leading-relaxed">{item.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
