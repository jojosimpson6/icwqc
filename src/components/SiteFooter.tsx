import { Link } from "react-router-dom";

export function SiteFooter() {
  return (
    <footer className="bg-primary text-primary-foreground mt-12">
      <div className="container py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-sm font-sans">
          <div>
            <h4 className="font-display font-bold text-base mb-3">QuidReference</h4>
            <p className="opacity-70 leading-relaxed">
              Your comprehensive source for Quidditch statistics, standings, player records, and league history.
            </p>
          </div>
          <div>
            <h4 className="font-display font-bold text-base mb-3">Quick Links</h4>
            <ul className="space-y-1.5 opacity-70">
              <li><Link to="/players" className="hover:opacity-100">Players</Link></li>
              <li><Link to="/leagues" className="hover:opacity-100">Leagues</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-display font-bold text-base mb-3">About</h4>
            <p className="opacity-70 leading-relaxed">
              QuidReference tracks statistics across all professional Quidditch leagues worldwide.
            </p>
          </div>
        </div>
        <div className="border-t border-primary-foreground/20 mt-6 pt-4 text-xs opacity-50 text-center font-sans">
          QuidReference — Quidditch Statistics & Records
        </div>
      </div>
    </footer>
  );
}
