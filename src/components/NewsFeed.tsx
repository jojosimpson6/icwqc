import { useEffect, useState } from "react";
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

export function NewsFeed() {
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("news_items").select("*").order("published_date", { ascending: false }).limit(6).then(({ data }) => {
      if (data && data.length > 0) {
        setNewsItems(data as NewsItem[]);
      }
      setLoading(false);
    });
  }, []);

  const displayItems = newsItems.length > 0 ? newsItems : [
    { id: "1", published_date: "1995-02-15", title: "Season 1995 reaches final matchday", body: "The 1995 season of the British and Irish Quidditch League concludes this week with several playoff spots still up for grabs." },
    { id: "2", published_date: "1995-02-12", title: "European Cup group stage heats up", body: "With only two matchdays remaining in the group phase, several teams are fighting for qualification to the knockout rounds." },
    { id: "3", published_date: "1995-02-08", title: "Champions League draw announced", body: "The draw for the next round of the Champions League has been completed. Several marquee matchups await fans." },
    { id: "4", published_date: "1995-02-03", title: "Record-breaking Snitch catch times this season", body: "Multiple matches this season have seen Snitch catches in under 20 minutes, suggesting a trend toward faster-paced games." },
  ];

  return (
    <div className="border border-border rounded overflow-hidden">
      <div className="bg-table-header px-3 py-2">
        <h3 className="font-display text-sm font-bold text-table-header-foreground">News &amp; Announcements</h3>
      </div>
      <div className="bg-card divide-y divide-border">
        {loading ? (
          <div className="px-3 py-3 text-xs text-muted-foreground font-sans italic">Loading...</div>
        ) : (
          displayItems.map((item) => (
            <div key={item.id} className="px-3 py-3">
              <p className="text-xs text-muted-foreground font-sans mb-1">{formatNewsDate(item.published_date)}</p>
              <p className="font-sans font-semibold text-sm text-foreground mb-1">{item.title}</p>
              <p className="text-xs text-muted-foreground font-sans leading-relaxed">{item.body}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
