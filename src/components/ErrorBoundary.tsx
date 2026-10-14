import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary ha capturado un error no controlado:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center select-none">
          <div className="w-16 h-16 rounded-2xl bg-orange-950/40 border border-orange-600/40 flex items-center justify-center text-orange-500 mb-6 shadow-xl shadow-orange-950/50">
            <AlertTriangle size={32} />
          </div>
          <h2 className="text-xl font-black uppercase tracking-tight text-zinc-100 mb-2">
            Ha ocurrido un inconveniente
          </h2>
          <p className="text-xs text-zinc-400 max-w-md font-medium mb-6">
            El sistema evitó que la pantalla quedara en blanco. Puedes reiniciar la vista para continuar trabajando con normalidad.
          </p>
          {this.state.error && (
            <pre className="text-[10px] text-zinc-600 bg-zinc-950 border border-zinc-900 rounded-xl p-3 max-w-lg overflow-auto mb-6">
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={this.handleReset}
            className="flex items-center gap-2 px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-orange-600/20 active:scale-95"
          >
            <RefreshCw size={14} /> Recargar Aplicación
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
