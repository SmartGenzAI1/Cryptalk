'use client'

import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  /**
   * Optional custom fallback rendered when this boundary catches an error.
   * If omitted, the full-screen "Something went wrong" UI is shown.
   * Use a small `fallback` to wrap individual list items / messages so one
   * bad row only takes itself out instead of killing the whole list (F2).
   */
  fallback?: ReactNode
}

interface State {
  hasError: boolean
}

/**
 * Top-level React error boundary. A single instance wraps the entire app
 * (registered in `app/layout.tsx`). For finer-grained isolation — e.g. around
 * each `MessageItem` so one malformed message doesn't blank the chat list —
 * wrap the children in their own `<ErrorBoundary fallback={…}>`.
 */
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
