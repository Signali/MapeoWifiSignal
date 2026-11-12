import type { Category, Point } from '../api/types.ts'

interface Props {
  points: Point[]
  categoryOf: (pointId: number) => Category | null
  selectedId?: number
  onSelect: (id: number) => void
}

// Lista de puntos del piso como botones: otra forma de elegir un punto, sin apuntar en el plano.
// Los sin medir van con borde punteado.
export function PointChips({ points, categoryOf, selectedId, onSelect }: Props) {
  return (
    <div className="point-chips">
      {points.map((p) => (
        <button
          key={p.id}
          type="button"
          className={categoryOf(p.id) === null ? 'empty' : undefined}
          aria-pressed={p.id === selectedId}
          onClick={() => onSelect(p.id)}
        >
          {p.code}
        </button>
      ))}
    </div>
  )
}
