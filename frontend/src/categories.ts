import type { Category } from './api/types.ts'

// Solo presentación (nombre, letra y color). Los umbrales y el cálculo de la categoría viven en el servicio.
// Los colores son variables de styles.css (cambian con el tema claro u oscuro).
export type CategoryKey = Category | 'sin_medir'

// `hint` repite, solo como texto de la leyenda, los umbrales de backend/src/services/signal-category.ts
// (> −65, −65 a −70, < −70 dBm). Si allá cambian, hay que cambiarlos aquí a mano.
export const CATEGORY_STYLE: Record<CategoryKey, { label: string; letter: string; color: string; hint?: string }> = {
  buena: { label: 'Buena', letter: 'B', color: 'var(--buena)', hint: 'más de −65 dBm' },
  regular: { label: 'Regular', letter: 'R', color: 'var(--regular)', hint: '−65 a −70 dBm' },
  debil: { label: 'Débil', letter: 'D', color: 'var(--debil)', hint: 'menos de −70 dBm' },
  sin_senal: { label: 'Sin señal', letter: '×', color: 'var(--sin-senal)' },
  // Sin medición: círculo del fondo con borde y letra de este color (discontinuo).
  sin_medir: { label: 'Sin medir', letter: '–', color: 'var(--sin-medir)' },
}
