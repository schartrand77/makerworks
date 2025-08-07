// src/components/system/ErrorBoundary.tsx
import React from 'react'

type ErrorBoundaryProps = {
  fallback?: React.ReactNode
  children: React.ReactNode
}

type ErrorBoundaryState = {
  hasError: boolean
  error?: Error
  info?: React.ErrorInfo
}

export default class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error)
    console.error('[ErrorBoundary] Component stack:', info.componentStack)

    // Optionally: send error and stack trace to logging service
    // logErrorToService(error, info)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="min-h-screen flex items-center justify-center p-8 bg-red-50 dark:bg-red-900 text-red-900 dark:text-red-100 text-center">
          <div className="max-w-md">
            <h1 className="text-3xl font-semibold mb-4">Something went wrong.</h1>
            <p className="text-sm opacity-80">
              This part of the app crashed. Please try again later or contact support.
            </p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
