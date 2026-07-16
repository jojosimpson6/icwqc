import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { CardSkeleton, ErrorState } from "@/components/StateMessage";

interface GlossaryTerm {
  term: string;
  definition: string;
}

function parseGlossaryTerms(content: string): GlossaryTerm[] {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed.filter((t): t is GlossaryTerm => t && typeof t.term === "string" && typeof t.definition === "string");
    }
  } catch { /* ignore malformed content */ }
  return [];
}

export default function GlossaryPage() {
  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    supabase.from("site_content").select("*").eq("key", "glossary").single()
      .then(({ data }) => {
        if (data) setTerms(parseGlossaryTerms(data.content).sort((a, b) => a.term.localeCompare(b.term)));
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to load glossary:", err);
        setLoadError(true);
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return terms;
    return terms.filter(t => t.term.toLowerCase().includes(q) || t.definition.toLowerCase().includes(q));
  }, [terms, filter]);

  return (
    <div className="min-h-screen bg-background flex flex-col pb-14 md:pb-0">
      <SiteHeader />
      <main className="flex-1 container py-8 max-w-3xl">
        <div className="mb-6 border-b-2 border-primary pb-2">
          <h1 className="font-display text-3xl font-bold text-foreground">Glossary</h1>
          <p className="text-sm text-muted-foreground font-sans mt-1">
            Definitions for the stats, abbreviations, and terminology used across the site.
          </p>
        </div>

        {loading ? (
          <CardSkeleton rows={6} />
        ) : loadError ? (
          <ErrorState
            title="We couldn't load the glossary"
            message="Something went wrong while fetching glossary terms."
            onRetry={() => window.location.reload()}
          />
        ) : (
          <>
            <input
              type="text"
              placeholder="Search terms…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="w-full max-w-xs mb-4 px-3 py-2 border border-border rounded bg-card text-sm font-sans focus:outline-none focus:ring-2 focus:ring-accent"
            />
            {filtered.length === 0 ? (
              <p className="text-muted-foreground font-sans italic">
                {terms.length === 0 ? "The glossary hasn't been written yet." : "No terms match your search."}
              </p>
            ) : (
              <dl className="divide-y divide-border border border-border rounded overflow-hidden">
                {filtered.map((t, i) => (
                  <div key={i} className={`px-4 py-3 ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"}`}>
                    <dt className="font-display font-bold text-foreground">{t.term}</dt>
                    <dd className="text-sm text-muted-foreground font-sans leading-relaxed mt-0.5">{t.definition}</dd>
                  </div>
                ))}
              </dl>
            )}
          </>
        )}
      </main>
      <SiteFooter />
      <MobileBottomNav />
    </div>
  );
}
