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
import TeamsIndex from "./pages/TeamsIndex";
import SearchPage from "./pages/SearchPage";
import AboutPage from "./pages/AboutPage";
import GlossaryPage from "./pages/GlossaryPage";
import PlayersIndex from "./pages/PlayersIndex";
import LeaguesIndex from "./pages/LeaguesIndex";
import AdminLogin from "./pages/AdminLogin";
import AdminPanel from "./pages/AdminPanel";
import MatchPage from "./pages/MatchPage";
import NationPage from "./pages/NationPage";
import NationsIndex from "./pages/NationsIndex";
import NewsArticle from "./pages/NewsArticle";
import LeagueHistory from "./pages/LeagueHistory";
import AwardHistory from "./pages/AwardHistory";
import EloPage from "./pages/EloPage";
import ComparePage from "./pages/ComparePage";
import LeadersIndex from "./pages/LeadersIndex";
import SchedulePage from "./pages/SchedulePage";
import ManagerProfile from "./pages/ManagerProfile";
import ManagersIndex from "./pages/ManagersIndex";
import { ErrorBoundary } from "./components/ErrorBoundary";
import AuthPage from "./pages/AuthPage";
import AccountPage from "./pages/AccountPage";
import FantasyPage from "./pages/FantasyPage";
import { AuthProvider } from "./hooks/useAuth";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/fantasy" element={<FantasyPage />} />
          <Route path="/player/:id" element={<ErrorBoundary><PlayerProfile /></ErrorBoundary>} />
          <Route path="/players" element={<PlayersIndex />} />
          <Route path="/league/:id" element={<LeaguePage />} />
          <Route path="/league/:id/history" element={<LeagueHistory />} />
          <Route path="/league/:id/award/:awardName" element={<AwardHistory />} />
          <Route path="/elo" element={<EloPage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/leagues" element={<LeaguesIndex />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/glossary" element={<GlossaryPage />} />
          <Route path="/teams" element={<TeamsIndex />} />
          <Route path="/team/:name" element={<TeamPage />} />
          <Route path="/match/:id" element={<MatchPage />} />
          <Route path="/nation/:id" element={<NationPage />} />
          <Route path="/nations" element={<NationsIndex />} />
          <Route path="/news/:id" element={<NewsArticle />} />
          <Route path="/leaders" element={<LeadersIndex />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/managers" element={<ManagersIndex />} />
          <Route path="/manager/:id" element={<ErrorBoundary><ManagerProfile /></ErrorBoundary>} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminPanel />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
