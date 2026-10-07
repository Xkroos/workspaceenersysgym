import { useState, useEffect } from 'react';

/**
 * Hook para retrasar la actualización de un valor hasta que el usuario deja de escribir.
 * Evita ejecuciones excesivas de filtrado y renderizado.
 */
export function useDebounce<T>(value: T, delay: number = 250): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
