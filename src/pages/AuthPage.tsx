import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export default function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/account";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    if (mode === "signup") {
      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { display_name: displayName.trim() || email.split("@")[0] },
        },
      });
      setLoading(false);
      if (err) { setError(err.message); return; }
      if (!data.session) {
        setNotice("Check your email to confirm your account, then sign in.");
        setMode("signin");
        return;
      }
      navigate(next);
      return;
    }

    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) { setError(err.message); return; }
    navigate(next);
  };

  const inputCls =
    "w-full border border-border rounded px-3 py-2 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1 container py-12 flex items-start justify-center">
        <div className="w-full max-w-sm">
          <div className="border border-border rounded overflow-hidden">
            <div className="bg-table-header px-4 py-3">
              <h1 className="font-display text-base font-bold text-table-header-foreground">
                {mode === "signin" ? "Sign In" : "Create Account"}
              </h1>
            </div>
            <form onSubmit={submit} className="bg-card p-6 space-y-4">
              {error && (
                <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded px-3 py-2 font-sans">
                  {error}
                </div>
              )}
              {notice && (
                <div className="text-sm bg-accent/10 border border-accent/30 rounded px-3 py-2 font-sans">
                  {notice}
                </div>
              )}

              {mode === "signup" && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 font-sans">
                    Display name
                  </label>
                  <input value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={40} className={inputCls} />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 font-sans">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required maxLength={255} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 font-sans">Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} className={inputCls} />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-primary-foreground font-sans font-semibold text-sm py-2 rounded hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {loading ? "Please wait…" : mode === "signin" ? "Sign In" : "Create Account"}
              </button>

              <div className="text-xs text-muted-foreground font-sans text-center">
                {mode === "signin" ? (
                  <>New here?{" "}
                    <button type="button" onClick={() => { setMode("signup"); setError(""); }} className="text-accent font-semibold hover:underline">
                      Create an account
                    </button>
                  </>
                ) : (
                  <>Already have an account?{" "}
                    <button type="button" onClick={() => { setMode("signin"); setError(""); }} className="text-accent font-semibold hover:underline">
                      Sign in
                    </button>
                  </>
                )}
              </div>
            </form>
          </div>
          <p className="text-[11px] text-muted-foreground font-sans text-center mt-3">
            Site administrator? <Link to="/admin/login" className="hover:underline">Admin sign in</Link>
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
