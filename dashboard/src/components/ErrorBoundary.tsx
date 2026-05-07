import React from 'react'

interface ErrorBoundaryProps {
  children: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  showDetails: boolean
  errorInfo: React.ErrorInfo | null
}

// Common error patterns and their user-friendly explanations
const ERROR_PATTERNS: Array<{
  pattern: RegExp
  title: string
  message: string
  suggestion: string
}> = [
  {
    pattern: /WebSocket|connection|disconnect/i,
    title: 'Connection Lost',
    message: 'The dashboard lost connection to the server.',
    suggestion: 'Check that the development server is running (npm run dev) and try refreshing.',
  },
  {
    pattern: /JSON|parse|syntax/i,
    title: 'Data Format Error',
    message: 'There was a problem reading the deal data.',
    suggestion: 'Verify that config/deal.json is valid JSON. Use a JSON validator to check for syntax errors.',
  },
  {
    pattern: /undefined|null|cannot read property/i,
    title: 'Missing Data',
    message: 'Expected data was not available.',
    suggestion: 'The pipeline may still be running. Wait for more data or check the Logs tab for details.',
  },
  {
    pattern: /network|fetch|CORS/i,
    title: 'Network Error',
    message: 'A network request failed.',
    suggestion: 'Check your network connection and firewall settings. Ensure localhost requests are allowed.',
  },
  {
    pattern: /timeout|timed out/i,
    title: 'Request Timeout',
    message: 'An operation took too long to complete.',
    suggestion: 'The server may be processing a complex task. Try again in a few moments.',
  },
]

function getErrorDetails(error: Error): { title: string; message: string; suggestion: string } {
  const errorMessage = error.message || error.toString()

  for (const pattern of ERROR_PATTERNS) {
    if (pattern.pattern.test(errorMessage)) {
      return {
        title: pattern.title,
        message: pattern.message,
        suggestion: pattern.suggestion,
      }
    }
  }

  return {
    title: 'Something Went Wrong',
    message: 'An unexpected error occurred while rendering this view.',
    suggestion: 'Try refreshing the page. If the problem persists, check the browser console for details.',
  }
}

export default class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      showDetails: false,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Uncaught rendering error:', error)
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack)
    this.setState({ errorInfo })
  }

  resetErrorBoundary = (): void => {
    this.setState({
      hasError: false,
      error: null,
      showDetails: false,
      errorInfo: null,
    })
  }

  toggleDetails = (): void => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }))
  }

  copyErrorDetails = (): void => {
    if (!this.state.error) return

    const details = [
      `Error: ${this.state.error.message}`,
      `Time: ${new Date().toISOString()}`,
      `URL: ${window.location.href}`,
      '',
      'Stack Trace:',
      this.state.error.stack || 'Not available',
      '',
      'Component Stack:',
      this.state.errorInfo?.componentStack || 'Not available',
    ].join('\n')

    navigator.clipboard.writeText(details).then(() => {
      alert('Error details copied to clipboard')
    }).catch(() => {
      console.log('Failed to copy, details:', details)
    })
  }

  render() {
    if (this.state.hasError && this.state.error) {
      const { title, message, suggestion } = getErrorDetails(this.state.error)

      return (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="card text-center max-w-lg">
            {/* Error Icon */}
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-cre-danger/20 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-cre-danger"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>

            {/* Error Title */}
            <h2 className="text-xl font-semibold mb-2 text-gray-200">
              {title}
            </h2>

            {/* User-Friendly Message */}
            <p className="text-gray-400 mb-4">
              {message}
            </p>

            {/* Suggestion Box */}
            <div className="bg-cre-surface/50 rounded-lg p-4 mb-6 text-left">
              <p className="text-sm text-gray-300">
                <span className="font-medium text-cre-accent">Suggestion: </span>
                {suggestion}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-4">
              <button
                onClick={() => {
                  this.resetErrorBoundary()
                  window.location.reload()
                }}
                className="px-5 py-2.5 bg-white text-black text-sm font-semibold uppercase hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh Page
              </button>

              <button
                onClick={this.resetErrorBoundary}
                className="px-5 py-2.5 rounded-lg bg-cre-surface text-gray-300 text-sm font-medium hover:bg-cre-surface/80 transition-colors border border-cre-border"
              >
                Try Again
              </button>
            </div>

            {/* Show/Hide Details Toggle */}
            <button
              onClick={this.toggleDetails}
              className="text-sm text-gray-500 hover:text-gray-400 transition-colors mb-4"
            >
              {this.state.showDetails ? 'Hide' : 'Show'} Technical Details
            </button>

            {/* Technical Details (Collapsible) */}
            {this.state.showDetails && (
              <div className="mt-4 text-left">
                <div className="bg-cre-bg rounded-lg p-4 border border-cre-border">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-gray-500 uppercase tracking-wider">
                      Error Details
                    </span>
                    <button
                      onClick={this.copyErrorDetails}
                      className="text-xs text-cre-accent hover:text-cre-accent/80 transition-colors"
                    >
                      Copy to Clipboard
                    </button>
                  </div>
                  <pre className="text-xs text-gray-400 font-mono overflow-x-auto whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                    {this.state.error.message}
                    {'\n\n'}
                    {this.state.error.stack}
                  </pre>
                </div>
              </div>
            )}

            {/* Support Information */}
            <div className="mt-6 pt-4 border-t border-cre-border">
              <p className="text-xs text-gray-600">
                If this problem persists, check the{' '}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    window.open('/demo/known-issues.md', '_blank')
                  }}
                  className="text-cre-accent hover:underline"
                >
                  Known Issues
                </a>
                {' '}guide or contact support.
              </p>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
