import { Link } from "react-router-dom";

/**
 * A generic "profile page" skeleton — header (avatar + name/stat bars) followed
 * by a couple of card-shaped content blocks. Used while player/team/manager/nation
 * profile data is loading, replacing plain "Loading..." text with something that
 * hints at the page's shape.
 */
export function ProfileSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 border-b-2 border-primary/30 pb-4">
        <div className="flex items-start gap-6">
          <div className="w-24 h-24 rounded-full bg-secondary shrink-0" />
          <div className="flex-1 space-y-3 pt-1">
            <div className="h-3 bg-secondary rounded w-24" />
            <div className="h-7 bg-secondary rounded w-64" />
            <div className="flex gap-4 mt-3">
              <div className="h-8 bg-secondary rounded w-20" />
              <div className="h-8 bg-secondary rounded w-20" />
              <div className="h-8 bg-secondary rounded w-20" />
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-4">
        <div className="border border-border rounded overflow-hidden">
          <div className="h-9 bg-table-header/60" />
          <div className="bg-card p-4 space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-4 bg-secondary rounded" style={{ width: `${85 - i * 8}%` }} />
            ))}
          </div>
        </div>
        <div className="border border-border rounded overflow-hidden">
          <div className="h-9 bg-table-header/60" />
          <div className="bg-card p-4 space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-4 bg-secondary rounded" style={{ width: `${70 - i * 6}%` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A compact skeleton for smaller inline sections (a single card/table). */
export function CardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="border border-border rounded overflow-hidden animate-pulse">
      <div className="h-9 bg-table-header/60" />
      <div className="bg-card p-4 space-y-2">
        {[...Array(rows)].map((_, i) => (
          <div key={i} className="h-4 bg-secondary rounded" style={{ width: `${85 - i * 7}%` }} />
        ))}
      </div>
    </div>
  );
}

/**
 * A consistent "couldn't load this" state with an optional retry action and a
 * link back to a sensible fallback (defaults to home). Used whenever a fetch
 * fails outright, as opposed to legitimately returning no data.
 */
export function ErrorState({
  title = "We couldn't load this page",
  message = "Something went wrong while fetching data. Please try again.",
  onRetry,
  backTo,
  backLabel = "Back to home",
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  backTo?: string;
  backLabel?: string;
}) {
  return (
    <div className="border border-destructive/30 bg-destructive/5 rounded p-6 text-center max-w-md mx-auto">
      <p className="font-display text-lg font-bold text-foreground mb-1">{title}</p>
      <p className="text-sm text-muted-foreground font-sans mb-4">{message}</p>
      <div className="flex items-center justify-center gap-3">
        {onRetry && (
          <button
            onClick={onRetry}
            className="text-sm font-sans font-medium px-4 py-2 rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Try again
          </button>
        )}
        <Link
          to={backTo || "/"}
          className="text-sm font-sans font-medium px-4 py-2 rounded border border-border hover:bg-secondary transition-colors"
        >
          {backLabel}
        </Link>
      </div>
    </div>
  );
}
