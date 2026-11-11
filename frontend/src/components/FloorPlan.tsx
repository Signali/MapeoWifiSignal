import type { KeyboardEvent } from 'react'
import type { Category, Floor, Point } from '../api/types.ts'
import { CATEGORY_STYLE } from '../categories.ts'

interface Props {
  floor: Floor
  points: Point[]
  categoryOf: (pointId: number) => Category | null
  selectedId?: number
  onSelect: (id: number) => void
}

const RADIUS_M = 0.9
const GRID_M = 5

// Plano a escala: 1 unidad del viewBox = 1 metro, con y creciendo hacia abajo (igual que el contrato).
export function FloorPlan({ floor, points, categoryOf, selectedId, onSelect }: Props) {
  const lines: number[] = []
  for (let v = GRID_M; v < Math.max(floor.width_m, floor.height_m); v += GRID_M) lines.push(v)

  return (
    <svg
      className="plan"
      viewBox={`0 0 ${floor.width_m} ${floor.height_m}`}
      role="group"
      aria-label={`Plano de ${floor.name}`}
    >
      {lines.map((v) => (
        <g key={v} className="grid">
          {v < floor.width_m && <line x1={v} y1={0} x2={v} y2={floor.height_m} />}
          {v < floor.height_m && <line x1={0} y1={v} x2={floor.width_m} y2={v} />}
        </g>
      ))}
      <rect className="border" x={0} y={0} width={floor.width_m} height={floor.height_m} />

      {points.map((p) => {
        const key = categoryOf(p.id) ?? 'sin_medir'
        const { label, letter, color } = CATEGORY_STYLE[key]
        const empty = key === 'sin_medir'
        const onKeyDown = (e: KeyboardEvent<SVGGElement>) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect(p.id)
          }
        }
        return (
          <g
            key={p.id}
            className={`point${p.id === selectedId ? ' selected' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={`${p.code}: ${label}`}
            aria-pressed={p.id === selectedId}
            onClick={() => onSelect(p.id)}
            onKeyDown={onKeyDown}
          >
            <circle className="ring" cx={p.x} cy={p.y} r={RADIUS_M + 0.4} />
            <circle
              className={empty ? 'dot dot-empty' : 'dot'}
              cx={p.x}
              cy={p.y}
              r={RADIUS_M}
              fill={empty ? '#fff' : color}
              stroke={color}
            />
            <text className="letter" x={p.x} y={p.y} fill={empty ? color : '#fff'}>
              {letter}
            </text>
            <text className="code" x={p.x} y={p.y + RADIUS_M + 1.1}>
              {p.code}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
