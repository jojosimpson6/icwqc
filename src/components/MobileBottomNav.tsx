import { Link, useLocation } from "react-router-dom";
import { Home, Users, Trophy, BarChart2, Globe } from "lucide-react";

const NAV_ITEMS = [
  { to: "/",        label: "Home",    icon: Home },
  { to: "/players", label: "Players", icon: Users },
  { to: "/leagues", label: "Leagues", icon: Trophy },
  { to: "/leaders", label: "Leaders", icon: BarChart2 },
  { to: "/nations", label: "Nations", icon: Globe },
];

export function MobileBottomNav() {
  const { pathname } = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-primary border-t border-primary-foreground/20 safe-area-pb">
      <div className="flex items-stretch h-14">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
          const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-primary-foreground transition-opacity ${
                active ? "opacity-100" : "opacity-50 hover:opacity-75"
              }`}
            >
              <Icon size={18} strokeWidth={active ? 2.5 : 1.75} />
              <span className="text-[10px] font-sans font-medium leading-none">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
