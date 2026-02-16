
-- Enable RLS on actual tables only (standings, stats, elo are views)
ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matchdays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nations ENABLE ROW LEVEL SECURITY;

-- Public read access for all tables
CREATE POLICY "Public read access" ON public.leagues FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.teams FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.players FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.results FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.matchdays FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.nations FOR SELECT USING (true);
