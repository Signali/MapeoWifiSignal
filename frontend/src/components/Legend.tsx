import type { CSSProperties } from 'react'
import { CATEGORY_STYLE } from '../categories.ts'
import type { CategoryKey } from '../categories.ts'

const ORDER: CategoryKey[] = ['buena', 'regular', 'debil', 'sin_senal', 'sin_medir']

// Leyenda de las 5 categorías (con sus umbrales en dBm) y de los dos marcadores estimados.
// El mapa de calor usa los mismos colores de las categorías, más suaves, de fondo.
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
      <li>
        <span className="swatch swatch-emitter" aria-hidden="true">
          E
        </span>
        Emisor estimado
      </li>
      <li>
        <span className="swatch swatch-repeater" aria-hidden="true">
          +
        </span>
        Repetidor recomendado (estimado)
      </li>
    </ul>
  )
}
