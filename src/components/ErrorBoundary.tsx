import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Sparkles } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  isChunkError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    isChunkError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    const isChunkError =
      error?.message?.includes('dynamically imported module') ||
      error?.message?.includes('Failed to fetch') ||
      error?.message?.includes('Loading chunk') ||
      error?.name === 'ChunkLoadError';

    return { hasError: true, error, isChunkError };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary ha capturado un error:", error, errorInfo);

    // Si es un error de versión desactualizada de chunks tras despliegue en Netlify, auto-recargar de forma transparente una vez
    const isChunkError =
      error?.message?.includes('dynamically imported module') ||
      error?.message?.includes('Failed to fetch') ||
      error?.message?.includes('Loading chunk') ||
      error?.name === 'ChunkLoadError';

    if (isChunkError) {
      const hasAutoReloaded = sessionStorage.getItem('chunk_auto_reloaded');
      if (!hasAutoReloaded) {
        sessionStorage.setItem('chunk_auto_reloaded', 'true');
        window.location.reload();
      }
    }
  }

  private handleReset = () => {
    sessionStorage.removeItem('chunk_auto_reloaded');
    this.setState({ hasError: false, error: null, isChunkError: false });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { isChunkError } = this.state;

      return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center select-none animate-in fade-in">
          <div className="w-16 h-16 rounded-2xl bg-orange-950/40 border border-orange-600/40 flex items-center justify-center text-orange-500 mb-6 shadow-xl shadow-orange-950/50">
            {isChunkError ? <Sparkles size={32} /> : <AlertTriangle size={32} />}
          </div>
          <h2 className="text-xl font-black uppercase tracking-tight text-zinc-100 mb-2">
            {isChunkError ? 'Nueva Versión Disponible' : 'Ha ocurrido un inconveniente'}
          </h2>
          <p className="text-xs text-zinc-400 max-w-md font-medium mb-6">
            {isChunkError
              ? 'Se ha desplegado una nueva versión del sistema en el servidor. Haz clic en el botón para cargar los últimos cambios.'
              : 'El sistema evitó que la pantalla quedara en blanco. Puedes reiniciar la vista para continuar trabajando con normalidad.'}
          </p>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-2 px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-orange-600/20 active:scale-95"
          >
            <RefreshCw size={14} /> {isChunkError ? 'Actualizar Aplicación' : 'Recargar Aplicación'}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
