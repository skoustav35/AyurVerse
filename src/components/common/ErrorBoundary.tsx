import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Flower2 } from 'lucide-react';

interface Props {
  children: ReactNode;
}
interface State {
  message: string | null;
}

/** Visible crash-catcher: a silent white screen is forbidden in this atelier. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { message: null };

  static getDerivedStateFromError(err: Error): State {
    return { message: err.message || String(err) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ayurverse-error]', error, info.componentStack);
  }

  render() {
    if (this.state.message) {
      return (
        <div className="min-h-[60vh] grid place-items-center p-6">
          <div className="card-warm max-w-md w-full p-8 text-center">
            <Flower2 className="mx-auto text-terra-500" size={30} />
            <p className="font-display text-xl text-ink-900 mt-4">A brushstroke slipped</p>
            <p className="mt-2 text-[12.5px] font-mono text-terra-600 bg-terra-500/10 border border-terra-500/30 rounded-xl px-3 py-2.5 break-words text-left">
              {this.state.message}
            </p>
            <button
              onClick={() => {
                this.setState({ message: null });
                window.location.reload();
              }}
              className="mt-5 rounded-full bg-neem-800 text-parchment px-6 py-2.5 text-sm font-semibold hover:bg-neem-700 transition-colors"
            >
              Reload the atelier
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
