import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string | null;
}

/**
 * Without this, any error thrown during render unmounts the entire tree and leaves a blank white
 * page with nothing to go on. This app renders live API data (hex strings, image URLs) that may
 * be missing or shaped unexpectedly, so a render-time throw is a realistic failure — surface it
 * rather than showing nothing.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Render error:", error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col justify-center gap-4 px-8 py-12">
        <h1 className="font-headline text-2xl font-medium text-foreground">Something broke</h1>
        <p className="font-body text-sm text-destructive">{error.message}</p>

        <details className="font-body text-xs text-muted">
          <summary className="cursor-pointer py-2">Technical details</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-surface p-3 text-[11px] leading-relaxed">
            {error.stack}
            {componentStack}
          </pre>
        </details>

        <button
          type="button"
          onClick={() => window.location.reload()}
          className="font-label transition-interactive mt-2 w-full rounded-lg bg-primary px-6 py-4 text-base font-medium text-on-primary hover:bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Reload
        </button>
      </div>
    );
  }
}
