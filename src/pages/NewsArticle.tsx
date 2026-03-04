import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

interface NewsItem {
  id: string;
  title: string;
  body: string;
  published_date: string;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default function NewsArticle() {
  const { id } = useParams();
  const [article, setArticle] = useState<NewsItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    supabase.from("news_items").select("*").eq("id", id).single().then(({ data }) => {
      if (data) setArticle(data as NewsItem);
      setLoading(false);
    });
  }, [id]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1 container py-8 max-w-3xl">
        <Link to="/" className="text-xs text-muted-foreground hover:text-accent font-sans mb-4 block">← Back to Home</Link>
        {loading ? (
          <p className="text-muted-foreground font-sans">Loading article...</p>
        ) : article ? (
          <article>
            <p className="text-sm text-muted-foreground font-sans mb-2">{formatDate(article.published_date)}</p>
            <h1 className="font-display text-3xl font-bold text-foreground mb-6">{article.title}</h1>
            <div className="prose prose-sm max-w-none font-sans text-foreground leading-relaxed whitespace-pre-line">
              {article.body}
            </div>
          </article>
        ) : (
          <p className="text-muted-foreground font-sans">Article not found.</p>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
