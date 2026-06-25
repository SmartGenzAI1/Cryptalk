'use client'

import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  // optional custom fallback; use a small one to isolate per-item errors
  fallback?: ReactNode
}

interface State {
  hasError: boolean
}

// top-level error boundary. wrap children in their own <ErrorBoundary fallback={…}>
// for finer-grained isolation (e.g. around each MessageItem)
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    console.error('UI Error:', error)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback !== undefined) {
        return this.props.fallback
      }
      return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-6">
          <p className="text-lg font-medium">Something went wrong</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
