
-- Fix views to use security_invoker
ALTER VIEW public.standings SET (security_invoker = on);
ALTER VIEW public.stats SET (security_invoker = on);
ALTER VIEW public.elo SET (security_invoker = on);
