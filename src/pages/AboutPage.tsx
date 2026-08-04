import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { CardSkeleton, ErrorState } from "@/components/StateMessage";

export default function AboutPage() {
  const [title, setTitle] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    supabase.from("site_content").select("*").eq("key", "about").single()
      .then(({ data }) => {
        if (data) {
          setTitle(data.title);
          setContent(data.content);
        }
        setLoading(false);
      }, err => {
        console.error("Failed to load About content:", err);
        setLoadError(true);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col pb-14 md:pb-0">
      <SiteHeader />
      <main className="flex-1 container py-8 max-w-3xl">
        <div className="mb-6 border-b-2 border-primary pb-2">
          <h1 className="font-display text-3xl font-bold text-foreground">{title || "About"}</h1>
        </div>
        {loading ? (
          <CardSkeleton rows={5} />
        ) : loadError ? (
          <ErrorState
            title="We couldn't load this page"
            message="Something went wrong while fetching the About page content."
            onRetry={() => window.location.reload()}
          />
        ) : content ? (
          <div className="prose prose-sm max-w-none font-sans text-foreground space-y-4">
            {content.split(/\n+/).filter(Boolean).map((para, i) => (
              <p key={i} className="leading-relaxed">{para}</p>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground font-sans italic">This page hasn't been written yet.</p>
        )}
      </main>
      <SiteFooter />
      <MobileBottomNav />
    </div>
  );
}
