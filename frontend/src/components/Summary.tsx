import type { Category } from '../api/types.ts'
import { CATEGORY_STYLE } from '../categories.ts'
import type { CategoryKey } from '../categories.ts'

const ORDER: CategoryKey[] = ['buena', 'regular', 'debil', 'sin_senal', 'sin_medir']

interface Props {
  // Una categoría por punto del piso; null = sin medición en la fase.
  categories: (Category | null)[]
}

// Conteo por categoría: «Buena 1 · Regular 0 · … · Sin medir 23».
export function Summary({ categories }: Props) {
  const counts: Record<CategoryKey, number> = { buena: 0, regular: 0, debil: 0, sin_senal: 0, sin_medir: 0 }
  for (const c of categories) counts[c ?? 'sin_medir']++

  return (
    <p className="summary">
      {ORDER.map((key, i) => (
        <span key={key}>
          {i > 0 && ' · '}
          {CATEGORY_STYLE[key].label} {counts[key]}
        </span>
      ))}
    </p>
  )
}
