"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Rendered when wallet/wagmi fails so the site still works without Web3. */
  fallback?: ReactNode;
};
type State = { hasError: boolean; message: string };

/**
 * Catches wallet/wagmi client failures so they do not white-screen the site.
 */
export class Web3ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || "Wallet provider failed to load",
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Web3ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <>
          <div className="border-b border-amber-500/40 bg-amber-950/40 px-4 py-2 text-center text-xs text-amber-200">
            Wallet features unavailable ({this.state.message}). Browsing still works.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => this.setState({ hasError: false, message: "" })}
            >
              Retry
            </button>
          </div>
          {this.props.fallback ?? null}
        </>
      );
    }
    return this.props.children;
  }
}
