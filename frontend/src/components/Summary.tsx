import type { CSSProperties } from 'react'
import type { Category } from '../api/types.ts'
import { CATEGORY_STYLE } from '../categories.ts'
import type { CategoryKey } from '../categories.ts'

interface Props {
  // Una categoría por punto del piso; null = sin medición en la fase.
  categories: (Category | null)[]
}

// Resumen del piso: dos tarjetas («Cobertura buena» y «Zonas débiles»). Solo cuenta lo que el servicio
// ya categorizó; no calcula umbrales. El total de puntos medidos está en el cajetín del plano.
export function Summary({ categories }: Props) {
  const counts: Record<CategoryKey, number> = { buena: 0, regular: 0, debil: 0, sin_senal: 0, sin_medir: 0 }
  for (const c of categories) counts[c ?? 'sin_medir']++
  const measured = categories.length - counts.sin_medir
  const goodShare = measured === 0 ? null : Math.round((counts.buena * 100) / measured)

  return (
    <div className="kpis">
      <div className="kpi kpi-good">
        <span className="swatch" style={{ '--c': CATEGORY_STYLE.buena.color } as CSSProperties} aria-hidden="true">
          {CATEGORY_STYLE.buena.letter}
        </span>
        <div>
          <small>Cobertura buena</small>
          <strong>{goodShare === null ? '–' : `${goodShare} %`}</strong>
          <span className="of">
            {counts.buena} de {measured} medidos
          </span>
        </div>
      </div>
      <div className="kpi kpi-weak">
        <span className="swatch" style={{ '--c': CATEGORY_STYLE.debil.color } as CSSProperties} aria-hidden="true">
          {CATEGORY_STYLE.debil.letter}
        </span>
        <div>
          <small>Zonas débiles</small>
          <strong>{counts.debil}</strong>
          <span className="of">{counts.debil === 1 ? 'punto en Débil' : 'puntos en Débil'}</span>
        </div>
      </div>
    </div>
  )
}
