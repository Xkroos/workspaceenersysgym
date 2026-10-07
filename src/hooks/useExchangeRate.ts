import { useState, useEffect, useCallback } from 'react';

// Constantes de caché
const CACHE_KEY = 'energym_bcv_rate_cache';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos

interface RateCache {
  rate: number;
  timestamp: number;
}

// Estado singleton en memoria para compartir entre todos los componentes
let memoryRate: number | null = null;
let lastFetchPromise: Promise<number> | null = null;
const listeners = new Set<(rate: number) => void>();

function notifyListeners(rate: number) {
  // Redondeo estricto a 2 decimales para evitar discrepancias en centavos
  const cleanRate = Math.round(rate * 100) / 100;
  memoryRate = cleanRate;
  listeners.forEach(listener => listener(cleanRate));
}

function getStoredCache(): RateCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: RateCache = JSON.parse(raw);
    if (parsed && typeof parsed.rate === 'number' && typeof parsed.timestamp === 'number') {
      return {
        rate: Math.round(parsed.rate * 100) / 100,
        timestamp: parsed.timestamp
      };
    }
  } catch {
    // Si hay error en parseo, ignorar caché corrupta
  }
  return null;
}

function setStoredCache(rate: number) {
  try {
    const cleanRate = Math.round(rate * 100) / 100;
    const cacheData: RateCache = { rate: cleanRate, timestamp: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
  } catch {
    // LocalStorage lleno o restringido
  }
}

async function fetchOfficialRate(forceRefresh = false): Promise<number> {
  const cached = getStoredCache();
  const isFresh = cached && (Date.now() - cached.timestamp < CACHE_TTL_MS);

  if (!forceRefresh && isFresh && cached) {
    notifyListeners(cached.rate);
    return cached.rate;
  }

  // Si ya hay una petición en vuelo, reusarla para evitar llamadas simultáneas duplicadas
  if (lastFetchPromise && !forceRefresh) {
    return lastFetchPromise;
  }

  lastFetchPromise = (async () => {
    try {
      const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
      if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
      const data = await response.json();
      
      const rawRate = Number(data.promedio || data.precio || 0);
      // Redondear a 2 decimales para sincronizar exactamente con el valor comercial
      const newRate = Math.round(rawRate * 100) / 100;

      if (newRate > 0) {
        setStoredCache(newRate);
        notifyListeners(newRate);
        return newRate;
      }
      throw new Error('Respuesta de tasa inválida');
    } catch (err) {
      // Si falla la red pero hay una tasa previa en caché (aunque expiró), usarla como respaldo
      if (cached && cached.rate > 0) {
        notifyListeners(cached.rate);
        return cached.rate;
      }
      throw err;
    } finally {
      lastFetchPromise = null;
    }
  })();

  return lastFetchPromise;
}

export function useExchangeRate() {
  const cached = getStoredCache();
  const initialRate = memoryRate || (cached ? cached.rate : 0);

  const [rate, setRate] = useState<number>(initialRate);
  const [loading, setLoading] = useState<boolean>(!initialRate);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Suscribirse a cambios del singleton
    const listener = (newRate: number) => {
      setRate(newRate);
      setLoading(false);
      setError(null);
    };
    listeners.add(listener);

    // Obtener tasa inicial si no existe o ha expirado
    const cachedData = getStoredCache();
    const isExpired = !cachedData || (Date.now() - cachedData.timestamp >= CACHE_TTL_MS);

    if (!memoryRate || isExpired) {
      setLoading(true);
      fetchOfficialRate()
        .then(val => {
          setRate(val);
          setLoading(false);
        })
        .catch(err => {
          console.error("Error al sincronizar tasa BCV:", err);
          setError("No se pudo sincronizar la tasa BCV");
          setLoading(false);
        });
    }

    return () => {
      listeners.delete(listener);
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const updatedRate = await fetchOfficialRate(true);
      setRate(updatedRate);
      return updatedRate;
    } catch (err: any) {
      setError(err?.message || "Error al refrescar tasa");
      return rate;
    } finally {
      setLoading(false);
    }
  }, [rate]);

  // Permite al usuario ajustar o sobrescribir la tasa manualmente si el BCV cambia durante el día
  const updateRate = useCallback((customRate: number) => {
    const cleanRate = Math.round(customRate * 100) / 100;
    if (cleanRate > 0) {
      setStoredCache(cleanRate);
      notifyListeners(cleanRate);
      setRate(cleanRate);
    }
  }, []);

  return { rate, loading, error, refresh, updateRate };
}
