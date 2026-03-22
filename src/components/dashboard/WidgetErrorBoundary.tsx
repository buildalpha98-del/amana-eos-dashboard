"use client";

import { Component, type ReactNode, type ErrorInfo } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  widgetName?: string;
}

interface State {
  hasError: boolean;
}

/**
 * Error boundary for individual dashboard widgets.
 * If one widget crashes, the rest of the dashboard keeps rendering.
 */
export class WidgetErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `Dashboard widget error (${this.props.widgetName ?? "unknown"}):`,
      error,
      info
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-card rounded-xl border border-border p-6 flex flex-col items-center justify-center text-center min-h-[120px]">
          <AlertCircle className="w-6 h-6 text-muted mb-2" />
          <p className="text-sm font-medium text-muted">
            {this.props.widgetName || "Widget"} failed to load
          </p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="mt-2 inline-flex items-center gap-1.5 text-xs text-brand hover:text-brand-hover transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
