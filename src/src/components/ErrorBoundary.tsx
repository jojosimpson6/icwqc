import { Component, ErrorInfo, ReactNode } from "react";

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("PlayerProfile ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
          <p className="text-destructive font-mono text-sm mb-2">Render error:</p>
          <pre className="text-xs text-muted-foreground bg-secondary p-4 rounded max-w-2xl overflow-auto">
            {this.state.error?.message}
            {"\n"}
            {this.state.error?.stack?.split("\n").slice(0, 8).join("\n")}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
