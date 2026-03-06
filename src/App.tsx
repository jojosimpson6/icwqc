import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import PlayerProfile from "./pages/PlayerProfile";
import LeaguePage from "./pages/LeaguePage";
import TeamPage from "./pages/TeamPage";
import PlayersIndex from "./pages/PlayersIndex";
import LeaguesIndex from "./pages/LeaguesIndex";
import AdminLogin from "./pages/AdminLogin";
import AdminPanel from "./pages/AdminPanel";
import MatchPage from "./pages/MatchPage";
import NationPage from "./pages/NationPage";
import NationsIndex from "./pages/NationsIndex";
import NewsArticle from "./pages/NewsArticle";
import LeagueHistory from "./pages/LeagueHistory";
import LeadersIndex from "./pages/LeadersIndex";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/player/:id" element={<PlayerProfile />} />
          <Route path="/players" element={<PlayersIndex />} />
          <Route path="/league/:id" element={<LeaguePage />} />
          <Route path="/league/:id/history" element={<LeagueHistory />} />
          <Route path="/leagues" element={<LeaguesIndex />} />
          <Route path="/team/:name" element={<TeamPage />} />
          <Route path="/match/:id" element={<MatchPage />} />
          <Route path="/nation/:id" element={<NationPage />} />
          <Route path="/nations" element={<NationsIndex />} />
          <Route path="/news/:id" element={<NewsArticle />} />
          <Route path="/leaders" element={<LeadersIndex />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminPanel />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
