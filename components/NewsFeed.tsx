import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface NewsItem {
  id: string;
  title: string;
  body: string;
  published_date: string;
}

function formatNewsDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function NewsFeed({ compact = false }: { compact?: boolean }) {
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("news_items").select("*").order("published_date", { ascending: false }).limit(compact ? 4 : 10).then(({ data }) => {
      if (data && data.length > 0) {
        setNewsItems(data as NewsItem[]);
      }
      setLoading(false);
    });
  }, [compact]);

  const displayItems = newsItems.length > 0 ? newsItems : [
    { id: "1", published_date: "1995-02-15", title: "Season 1995 reaches final matchday", body: "The 1995 season of the British and Irish Quidditch League concludes this week with several playoff spots still up for grabs." },
    { id: "2", published_date: "1995-02-12", title: "European Cup group stage heats up", body: "With only two matchdays remaining in the group phase, several teams are fighting for qualification to the knockout rounds." },
    { id: "3", published_date: "1995-02-08", title: "Champions League draw announced", body: "The draw for the next round of the Champions League has been completed. Several marquee matchups await fans." },
    { id: "4", published_date: "1995-02-03", title: "Record-breaking Snitch catch times this season", body: "Multiple matches this season have seen Snitch catches in under 20 minutes, suggesting a trend toward faster-paced games." },
  ];

  if (compact) {
    return (
      <div className="border border-border rounded overflow-hidden">
        <div className="bg-table-header px-3 py-2 flex items-center justify-between">
          <h3 className="font-display text-sm font-bold text-table-header-foreground">News &amp; Announcements</h3>
          <Link to="/news" className="text-xs text-table-header-foreground/70 hover:text-table-header-foreground font-sans">All News →</Link>
        </div>
        <div className="bg-card divide-y divide-border">
          {loading ? (
            <div className="px-3 py-3 text-xs text-muted-foreground font-sans italic">Loading...</div>
          ) : (
            displayItems.slice(0, 4).map((item) => (
              <Link key={item.id} to={`/news/${item.id}`} className="block px-3 py-3 hover:bg-highlight/20 transition-colors">
                <p className="text-xs text-muted-foreground font-sans mb-1">{formatNewsDate(item.published_date)}</p>
                <p className="font-sans font-semibold text-sm text-accent hover:underline mb-1">{item.title}</p>
              </Link>
            ))
          )}
        </div>
      </div>
    );
  }

  // Full-size news feed for homepage main area
  return (
    <div className="border border-border rounded overflow-hidden">
      <div className="bg-table-header px-3 py-2">
        <h3 className="font-display text-sm font-bold text-table-header-foreground">News &amp; Announcements</h3>
      </div>
      <div className="bg-card divide-y divide-border">
        {loading ? (
          <div className="px-3 py-3 text-xs text-muted-foreground font-sans italic">Loading...</div>
        ) : (
          displayItems.map((item, i) => (
            <Link key={item.id} to={`/news/${item.id}`} className="block px-4 py-4 hover:bg-highlight/20 transition-colors">
              <p className="text-xs text-muted-foreground font-sans mb-1">{formatNewsDate(item.published_date)}</p>
              <p className="font-display font-bold text-lg text-foreground mb-2 hover:text-accent transition-colors">{item.title}</p>
              <p className="text-sm text-muted-foreground font-sans leading-relaxed line-clamp-2">{item.body}</p>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
