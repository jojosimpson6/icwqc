import { Star } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth, type FavoriteType } from "@/hooks/useAuth";

interface Props {
  type: FavoriteType;
  id: number;
  label?: string;
  className?: string;
}

export function FavoriteButton({ type, id, label, className = "" }: Props) {
  const { user, isFavorite, toggleFavorite } = useAuth();
  const navigate = useNavigate();
  const active = isFavorite(type, id);

  const handle = () => {
    if (!user) {
      navigate(`/auth?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    toggleFavorite(type, id);
  };

  return (
    <button
      onClick={handle}
      title={user ? (active ? "Remove from favorites" : "Add to favorites") : "Sign in to save favorites"}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 text-xs font-sans font-semibold px-2.5 py-1 rounded border transition-colors
        ${active
          ? "border-accent bg-accent/10 text-accent"
          : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-accent/50"} ${className}`}
    >
      <Star size={14} className={active ? "fill-current" : ""} />
      {label ?? (active ? "Favorited" : "Favorite")}
    </button>
  );
}
