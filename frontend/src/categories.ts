import type { Category } from './api/types.ts'

// Solo presentación (nombre, letra y color). Los umbrales y el cálculo de la categoría viven en el servicio.
export type CategoryKey = Category | 'sin_medir'

export const CATEGORY_STYLE: Record<CategoryKey, { label: string; letter: string; color: string }> = {
  buena: { label: 'Buena', letter: 'B', color: '#2E7D4F' },
  regular: { label: 'Regular', letter: 'R', color: '#8A5A00' },
  debil: { label: 'Débil', letter: 'D', color: '#B3261E' },
  sin_senal: { label: 'Sin señal', letter: '×', color: '#131521' },
  // Sin medición: círculo blanco con borde y letra de este color (discontinuo).
  sin_medir: { label: 'Sin medir', letter: '–', color: '#435570' },
}
