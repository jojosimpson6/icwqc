export function SiteFooter() {
  return (
    <footer className="bg-primary text-primary-foreground mt-12">
      <div className="container py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-sm font-sans">
          <div>
            <h4 className="font-display font-bold text-base mb-3">StatReference</h4>
            <p className="opacity-70 leading-relaxed">
              Your comprehensive source for custom league statistics, standings, and player data.
            </p>
          </div>
          <div>
            <h4 className="font-display font-bold text-base mb-3">Quick Links</h4>
            <ul className="space-y-1.5 opacity-70">
              <li className="hover:opacity-100 cursor-pointer">Players</li>
              <li className="hover:opacity-100 cursor-pointer">Teams</li>
              <li className="hover:opacity-100 cursor-pointer">Standings</li>
              <li className="hover:opacity-100 cursor-pointer">Leaders</li>
            </ul>
          </div>
          <div>
            <h4 className="font-display font-bold text-base mb-3">Seasons</h4>
            <ul className="space-y-1.5 opacity-70">
              <li className="hover:opacity-100 cursor-pointer">2026 Season</li>
              <li className="hover:opacity-100 cursor-pointer">2025 Season</li>
              <li className="hover:opacity-100 cursor-pointer">2024 Season</li>
              <li className="hover:opacity-100 cursor-pointer">All-Time Records</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-primary-foreground/20 mt-6 pt-4 text-xs opacity-50 text-center font-sans">
          StatReference — Custom League Statistics
        </div>
      </div>
    </footer>
  );
}
