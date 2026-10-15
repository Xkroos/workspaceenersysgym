import { lazy, ComponentType } from 'react';

/**
 * Envoltorio para React.lazy() que detecta fallos de importación dinámica de chunks
 * (común cuando se despliega una nueva versión en Netlify/Vercel mientras el usuario tiene la app abierta)
 * y recarga la página automáticamente para descargar los chunks actualizados.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  componentImport: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    const pageHasBeenRefreshed = sessionStorage.getItem('chunk_retry_reload');

    try {
      const component = await componentImport();
      // Si cargó con éxito, limpiamos la marca de recarga
      sessionStorage.removeItem('chunk_retry_reload');
      return component;
    } catch (error: any) {
      const isDynamicImportError =
        error?.message?.includes('dynamically imported module') ||
        error?.message?.includes('Failed to fetch') ||
        error?.message?.includes('Loading chunk') ||
        error?.name === 'ChunkLoadError';

      if (isDynamicImportError && !pageHasBeenRefreshed) {
        console.warn('Detectada nueva versión desplegada. Recargando chunks actualizados...');
        sessionStorage.setItem('chunk_retry_reload', 'true');
        window.location.reload();
        return new Promise<{ default: T }>(() => {}); // Espera la recarga de página
      }

      // Si ya se recargó y persiste el error de red, lanzamos la excepción
      throw error;
    }
  });
}
