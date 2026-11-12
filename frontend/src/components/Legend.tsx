import type { CSSProperties } from 'react'
import { CATEGORY_STYLE } from '../categories.ts'
import type { CategoryKey } from '../categories.ts'

const ORDER: CategoryKey[] = ['buena', 'regular', 'debil', 'sin_senal', 'sin_medir']

// Leyenda de las 5 categorías, con sus umbrales en dBm. El mapa de calor usa los mismos colores, más
// suaves, de fondo. Los marcadores estimados (emisor y repetidor) se explican en el panel de análisis.
export function Legend() {
  return (
    <ul className="legend" aria-label="Leyenda">
      {ORDER.map((key) => {
        const { label, letter, color, hint } = CATEGORY_STYLE[key]
        return (
          <li key={key}>
            <span className={`swatch${key === 'sin_medir' ? ' swatch-empty' : ''}`} style={{ '--c': color } as CSSProperties} aria-hidden="true">
              {letter}
            </span>
            <span>
              {label} {hint && <small>{hint}</small>}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
