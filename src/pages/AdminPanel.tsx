import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

interface NewsItem {
  id: string;
  title: string;
  body: string;
  published_date: string;
  author: string | null;
  pinned: boolean;
}

interface SiteContent {
  id: string;
  key: string;
  title: string | null;
  content: string;
}

interface GlossaryTerm {
  term: string;
  definition: string;
}

function parseGlossaryTerms(content: string): GlossaryTerm[] {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed.filter((t) => t && typeof t.term === "string");
  } catch { /* not valid JSON yet — treat as empty */ }
  return [];
}

function GlossaryEditor({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const terms = parseGlossaryTerms(value);
  const inputClass = "w-full border border-border rounded px-3 py-2 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary";
  const btnSecondary = "border border-border text-foreground font-sans font-semibold text-xs px-3 py-1.5 rounded hover:bg-secondary transition-colors";
  const btnDanger = "border border-destructive text-destructive font-sans font-semibold text-xs px-2 py-1 rounded hover:bg-destructive/10 transition-colors";

  function update(next: GlossaryTerm[]) {
    onChange(JSON.stringify(next));
  }

  return (
    <div className="space-y-3">
      <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground font-sans">Terms ({terms.length})</label>
      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
        {terms.map((t, i) => (
          <div key={i} className="border border-border rounded p-2 space-y-1.5">
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={t.term}
                onChange={e => update(terms.map((x, j) => j === i ? { ...x, term: e.target.value } : x))}
                placeholder="Term (e.g. GSC)"
                className={`${inputClass} font-semibold`}
              />
              <button onClick={() => update(terms.filter((_, j) => j !== i))} className={btnDanger}>Remove</button>
            </div>
            <textarea
              value={t.definition}
              onChange={e => update(terms.map((x, j) => j === i ? { ...x, definition: e.target.value } : x))}
              placeholder="Definition..."
              className={`${inputClass} h-16 resize-none`}
            />
          </div>
        ))}
      </div>
      <button onClick={() => update([...terms, { term: "", definition: "" }])} className={btnSecondary}>+ Add Term</button>
    </div>
  );
}

export default function AdminPanel() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<"news" | "content">("news");

  // News state
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [editingNews, setEditingNews] = useState<NewsItem | null>(null);
  const [newNews, setNewNews] = useState({ title: "", body: "", published_date: new Date().toISOString().split("T")[0], author: "", pinned: false });
  const [newsMsg, setNewsMsg] = useState("");

  // Site content state
  const [siteContents, setSiteContents] = useState<SiteContent[]>([]);
  const [editingContent, setEditingContent] = useState<SiteContent | null>(null);
  const [contentMsg, setContentMsg] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { navigate("/admin/login"); return; }

      // Check admin role server-side via RLS
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .eq("role", "admin")
        .single();

      if (!roleData) {
        setLoading(false);
        setIsAdmin(false);
        return;
      }

      setIsAdmin(true);
      setLoading(false);
      fetchNews();
      fetchContent();
    });
  }, [navigate]);

  async function fetchNews() {
    // Sort pinned items client-side rather than via .order("pinned", ...) — see
    // the matching comment in NewsFeed.tsx for why.
    const { data, error } = await supabase.from("news_items").select("*").order("published_date", { ascending: false });
    if (error) { console.error("Failed to load news:", error.message); return; }
    if (data) setNewsItems([...data].sort((a: any, b: any) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)) as NewsItem[]);
  }

  async function fetchContent() {
    const { data } = await supabase.from("site_content").select("*");
    if (data) setSiteContents(data as SiteContent[]);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate("/");
  }

  async function saveNews() {
    if (!newNews.title || !newNews.body) return;
    const { error } = await supabase.from("news_items").insert({
      title: newNews.title,
      body: newNews.body,
      published_date: newNews.published_date,
      author: newNews.author || null,
      pinned: newNews.pinned,
    });
    if (error) { setNewsMsg("Error: " + error.message); return; }
    setNewNews({ title: "", body: "", published_date: new Date().toISOString().split("T")[0], author: "", pinned: false });
    setNewsMsg("News item added!");
    fetchNews();
    setTimeout(() => setNewsMsg(""), 3000);
  }

  async function updateNews() {
    if (!editingNews) return;
    const { error } = await supabase.from("news_items").update({
      title: editingNews.title,
      body: editingNews.body,
      published_date: editingNews.published_date,
      author: editingNews.author || null,
      pinned: editingNews.pinned,
    }).eq("id", editingNews.id);
    if (error) { setNewsMsg("Error: " + error.message); return; }
    setEditingNews(null);
    setNewsMsg("Updated!");
    fetchNews();
    setTimeout(() => setNewsMsg(""), 3000);
  }

  async function deleteNews(id: string) {
    if (!confirm("Delete this news item?")) return;
    await supabase.from("news_items").delete().eq("id", id);
    fetchNews();
  }

  async function togglePin(item: NewsItem) {
    const { error } = await supabase.from("news_items").update({ pinned: !item.pinned }).eq("id", item.id);
    if (error) { setNewsMsg("Error: " + error.message); return; }
    fetchNews();
  }

  async function updateContent() {
    if (!editingContent) return;
    const { error } = await supabase.from("site_content").update({
      title: editingContent.title,
      content: editingContent.content,
    }).eq("id", editingContent.id);
    if (error) { setContentMsg("Error: " + error.message); return; }
    setEditingContent(null);
    setContentMsg("Content updated!");
    fetchContent();
    setTimeout(() => setContentMsg(""), 3000);
  }

  const inputClass = "w-full border border-border rounded px-3 py-2 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary";
  const labelClass = "block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 font-sans";
  const btnPrimary = "bg-primary text-primary-foreground font-sans font-semibold text-xs px-3 py-1.5 rounded hover:opacity-90 transition-opacity";
  const btnDanger = "bg-destructive text-destructive-foreground font-sans font-semibold text-xs px-3 py-1.5 rounded hover:opacity-90 transition-opacity";
  const btnSecondary = "border border-border text-foreground font-sans font-semibold text-xs px-3 py-1.5 rounded hover:bg-secondary transition-colors";

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <SiteHeader />
        <main className="flex-1 container py-8"><p className="text-muted-foreground font-sans">Checking access...</p></main>
        <SiteFooter />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <SiteHeader />
        <main className="flex-1 container py-8">
          <div className="text-center space-y-4">
            <p className="text-destructive font-sans font-semibold">Access denied. Admin role required.</p>
            <button onClick={handleSignOut} className={btnSecondary}>Sign Out</button>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1 container py-8">
        <div className="mb-6 border-b-2 border-primary pb-2 flex items-end justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Admin Panel</h1>
            <p className="text-sm text-muted-foreground font-sans mt-1">Manage site content and announcements</p>
          </div>
          <button onClick={handleSignOut} className={btnSecondary}>Sign Out</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-border">
          <button
            onClick={() => setActiveTab("news")}
            className={`px-4 py-2 text-sm font-sans font-medium border-b-2 -mb-px transition-colors ${activeTab === "news" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            News & Announcements
          </button>
          <button
            onClick={() => setActiveTab("content")}
            className={`px-4 py-2 text-sm font-sans font-medium border-b-2 -mb-px transition-colors ${activeTab === "content" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            Site Content
          </button>
        </div>

        {activeTab === "news" && (
          <div className="space-y-6">
            {/* Add new */}
            <div className="border border-border rounded overflow-hidden">
              <div className="bg-table-header px-3 py-2">
                <h3 className="font-display text-sm font-bold text-table-header-foreground">Add News Item</h3>
              </div>
              <div className="bg-card p-4 space-y-3">
                <div>
                  <label className={labelClass}>Date</label>
                  <input type="date" value={newNews.published_date} onChange={e => setNewNews(n => ({ ...n, published_date: e.target.value }))} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Title</label>
                  <input type="text" value={newNews.title} onChange={e => setNewNews(n => ({ ...n, title: e.target.value }))} className={inputClass} placeholder="Headline..." />
                </div>
                <div>
                  <label className={labelClass}>Author</label>
                  <input type="text" value={newNews.author} onChange={e => setNewNews(n => ({ ...n, author: e.target.value }))} className={inputClass} placeholder="Byline (optional)..." />
                </div>
                <div>
                  <label className={labelClass}>Body</label>
                  <textarea value={newNews.body} onChange={e => setNewNews(n => ({ ...n, body: e.target.value }))} className={`${inputClass} h-24 resize-none`} placeholder="Full announcement text..." />
                </div>
                <label className="flex items-center gap-2 text-sm font-sans text-foreground cursor-pointer">
                  <input type="checkbox" checked={newNews.pinned} onChange={e => setNewNews(n => ({ ...n, pinned: e.target.checked }))} className="accent-accent" />
                  📌 Pin to top of front page
                </label>
                <div className="flex items-center gap-3">
                  <button onClick={saveNews} className={btnPrimary}>Publish</button>
                  {newsMsg && <span className="text-xs text-muted-foreground font-sans">{newsMsg}</span>}
                </div>
              </div>
            </div>

            {/* List */}
            <div className="border border-border rounded overflow-hidden">
              <div className="bg-table-header px-3 py-2">
                <h3 className="font-display text-sm font-bold text-table-header-foreground">Published Items ({newsItems.length})</h3>
              </div>
              <div className="bg-card divide-y divide-border">
                {newsItems.map(item => (
                  <div key={item.id} className="p-3">
                    {editingNews?.id === item.id ? (
                      <div className="space-y-2">
                        <input type="date" value={editingNews.published_date} onChange={e => setEditingNews(n => n ? { ...n, published_date: e.target.value } : n)} className={inputClass} />
                        <input type="text" value={editingNews.title} onChange={e => setEditingNews(n => n ? { ...n, title: e.target.value } : n)} className={inputClass} placeholder="Headline..." />
                        <input type="text" value={editingNews.author || ""} onChange={e => setEditingNews(n => n ? { ...n, author: e.target.value } : n)} className={inputClass} placeholder="Byline (optional)..." />
                        <textarea value={editingNews.body} onChange={e => setEditingNews(n => n ? { ...n, body: e.target.value } : n)} className={`${inputClass} h-20 resize-none`} />
                        <label className="flex items-center gap-2 text-sm font-sans text-foreground cursor-pointer">
                          <input type="checkbox" checked={editingNews.pinned} onChange={e => setEditingNews(n => n ? { ...n, pinned: e.target.checked } : n)} className="accent-accent" />
                          📌 Pin to top of front page
                        </label>
                        <div className="flex gap-2">
                          <button onClick={updateNews} className={btnPrimary}>Save</button>
                          <button onClick={() => setEditingNews(null)} className={btnSecondary}>Cancel</button>
                          {newsMsg && <span className="text-xs text-muted-foreground font-sans">{newsMsg}</span>}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-3">
                        <div className="flex-1">
                          <p className="text-xs text-muted-foreground font-sans mb-0.5">
                            {item.pinned && <span className="text-accent font-semibold mr-1">📌 Pinned</span>}
                            {item.published_date}{item.author ? ` · By ${item.author}` : ""}
                          </p>
                          <p className="font-sans font-semibold text-sm text-foreground">{item.title}</p>
                          <p className="text-xs text-muted-foreground font-sans mt-1 line-clamp-2">{item.body}</p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button onClick={() => togglePin(item)} className={btnSecondary}>{item.pinned ? "Unpin" : "Pin"}</button>
                          <button onClick={() => setEditingNews(item)} className={btnSecondary}>Edit</button>
                          <button onClick={() => deleteNews(item.id)} className={btnDanger}>Delete</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {newsItems.length === 0 && (
                  <div className="p-4 text-sm text-muted-foreground font-sans italic">No news items published yet.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "content" && (
          <div className="space-y-4">
            {contentMsg && <div className="text-sm text-green-600 dark:text-green-400 font-sans">{contentMsg}</div>}
            {siteContents.map(sc => (
              <div key={sc.id} className="border border-border rounded overflow-hidden">
                <div className="bg-table-header px-3 py-2 flex items-center justify-between">
                  <h3 className="font-display text-sm font-bold text-table-header-foreground">{sc.title || sc.key}</h3>
                  {editingContent?.id !== sc.id && (
                    <button onClick={() => setEditingContent(sc)} className={btnSecondary}>Edit</button>
                  )}
                </div>
                <div className="bg-card p-4">
                  {editingContent?.id === sc.id ? (
                    <div className="space-y-3">
                      <div>
                        <label className={labelClass}>Title</label>
                        <input type="text" value={editingContent.title || ""} onChange={e => setEditingContent(n => n ? { ...n, title: e.target.value } : n)} className={inputClass} />
                      </div>
                      {sc.key === "glossary" ? (
                        <GlossaryEditor
                          value={editingContent.content}
                          onChange={next => setEditingContent(n => n ? { ...n, content: next } : n)}
                        />
                      ) : (
                        <div>
                          <label className={labelClass}>Content</label>
                          <textarea value={editingContent.content} onChange={e => setEditingContent(n => n ? { ...n, content: e.target.value } : n)} className={`${inputClass} h-32 resize-none`} />
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button onClick={updateContent} className={btnPrimary}>Save</button>
                        <button onClick={() => setEditingContent(null)} className={btnSecondary}>Cancel</button>
                      </div>
                    </div>
                  ) : sc.key === "glossary" ? (
                    <p className="text-sm text-muted-foreground font-sans">{parseGlossaryTerms(sc.content).length} terms defined.</p>
                  ) : (
                    <p className="text-sm text-muted-foreground font-sans whitespace-pre-wrap">{sc.content}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
