// Umbrales del Hito 1 (dBm). Única fuente: la app y la web muestran la categoría que devuelve la API.
export const THRESHOLDS = { buena: -65, debil: -70 } as const; // > -65 buena · -65..-70 regular · < -70 débil

export type Category = 'buena' | 'regular' | 'debil' | 'sin_senal';

// bestRssi es la lectura más fuerte guardada; null si no se captó la red de la organización.
export function categoryOf(bestRssi: number | null): Category {
  if (bestRssi === null) return 'sin_senal';
  if (bestRssi > THRESHOLDS.buena) return 'buena';
  if (bestRssi >= THRESHOLDS.debil) return 'regular';
  return 'debil';
}
