import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

type Props = { children: ReactNode; title?: string }

type State = { err: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { err: null }

  static getDerivedStateFromError(err: Error) {
    return { err }
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', err, info.componentStack)
  }

  render() {
    if (this.state.err) {
      return (
        <div className="flex min-h-dvh items-center justify-center p-6">
          <Alert variant="destructive" className="max-w-lg">
            <AlertTitle>{this.props.title ?? 'Algo salió mal'}</AlertTitle>
            <AlertDescription className="mt-2">{this.state.err.message}</AlertDescription>
            <Button
              type="button"
              className="mt-6"
              variant="secondary"
              onClick={() => window.location.assign('/')}
            >
              Volver al inicio
            </Button>
          </Alert>
        </div>
      )
    }
    return this.props.children
  }
}
