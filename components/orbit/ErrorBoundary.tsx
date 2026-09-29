'use client';
import * as React from 'react';

interface Props {
  name: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Keeps one failing Orbit widget (stage tile, side panel) from unmounting the
 * whole meeting. Reports the React component stack to the console so field
 * failures are diagnosable, and shows an inline fallback instead.
 */
export class OrbitErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[orbit:${this.props.name}]`, error);
    if (info?.componentStack) console.error(`[orbit:${this.props.name}]`, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <div className="orbit-empty">
            Something in this panel failed to render ({this.state.error.message}).
          </div>
        )
      );
    }
    return this.props.children;
  }
}
