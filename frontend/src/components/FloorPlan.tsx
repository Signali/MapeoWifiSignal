import type { KeyboardEvent } from 'react'
import type { Category, Emitter, Floor, HeatCell, Point, Vertex } from '../api/types.ts'
import { CATEGORY_STYLE } from '../categories.ts'

interface Props {
  floor: Floor
  points: Point[]
  categoryOf: (pointId: number) => Category | null
  selectedId?: number
  onSelect: (id: number) => void
  // Capas del análisis (todas opcionales): mapa de calor, emisores estimados y ubicación recomendada.
  heat?: { cells: HeatCell[]; cellM: number } | null
  emitters?: Emitter[]
  repeater?: Vertex | null
}

const RADIUS_M = 0.9
const GRID_M = 5
const HEAT_OPACITY = 0.38
// Margen del dibujo para los números de los ejes (en metros).
const MARGIN_LEFT = 3.2
const MARGIN_TOP = 1.2
const MARGIN_RIGHT = 1.8
const MARGIN_BOTTOM = 3.4

// Solo se dibuja una imagen que viene de /plans/ (lo mismo que exige la base); cualquier otra cosa se ignora.
const isPlanUrl = (url: string | null): url is string => url !== null && /^\/plans\/[A-Za-z0-9._-]+$/.test(url)

const range = (max: number) => {
  const values: number[] = []
  for (let v = 0; v <= max; v += GRID_M) values.push(v)
  return values
}

// Plano a escala: 1 unidad del viewBox = 1 metro, con y creciendo hacia abajo (igual que el contrato).
// Se dibuja el contorno real del edificio, la imagen del plano de fondo (si hay) y, encima, las capas.
// Una regla de metros en los bordes hace de escala.
export function FloorPlan({ floor, points, categoryOf, selectedId, onSelect, heat, emitters = [], repeater }: Props) {
  const lines: number[] = []
  for (let v = GRID_M; v < Math.max(floor.width_m, floor.height_m); v += GRID_M) lines.push(v)
  const outline = floor.outline.map((v) => `${v.x},${v.y}`).join(' ')
  const clipId = `plan-clip-${floor.id}`

  return (
    <svg
      className="plan"
      viewBox={`${-MARGIN_LEFT} ${-MARGIN_TOP} ${floor.width_m + MARGIN_LEFT + MARGIN_RIGHT} ${floor.height_m + MARGIN_TOP + MARGIN_BOTTOM}`}
      role="group"
      aria-label={`Plano de ${floor.name}`}
    >
      <defs>
        <clipPath id={clipId}>
          <polygon points={outline} />
        </clipPath>
      </defs>
      <polygon className="outline-fill" points={outline} />
      {isPlanUrl(floor.plan_url) && (
        <image
          href={floor.plan_url}
          x={0}
          y={0}
          width={floor.width_m}
          height={floor.height_m}
          preserveAspectRatio="none"
          clipPath={`url(#${clipId})`}
        />
      )}
      <g clipPath={`url(#${clipId})`}>
        {lines.map((v) => (
          <g key={v} className="grid">
            {v < floor.width_m && <line x1={v} y1={0} x2={v} y2={floor.height_m} />}
            {v < floor.height_m && <line x1={0} y1={v} x2={floor.width_m} y2={v} />}
          </g>
        ))}
      </g>

      {heat && (
        <g className="heat" aria-hidden="true" shapeRendering="crispEdges" clipPath={`url(#${clipId})`}>
          {heat.cells.map((c) =>
            c.category === null ? null : (
              <rect
                key={`${c.x}-${c.y}`}
                x={c.x - heat.cellM / 2}
                y={c.y - heat.cellM / 2}
                width={heat.cellM}
                height={heat.cellM}
                fill={CATEGORY_STYLE[c.category].color}
                fillOpacity={HEAT_OPACITY}
              />
            ),
          )}
        </g>
      )}
      <polygon className="outline" points={outline} />

      <g className="axis" aria-hidden="true">
        {range(floor.width_m).map((v) => (
          <g key={`x${v}`}>
            <line x1={v} y1={floor.height_m} x2={v} y2={floor.height_m + 0.6} />
            <text x={v} y={floor.height_m + 2} textAnchor="middle">
              {v}
            </text>
          </g>
        ))}
        {range(floor.height_m).map((v) => (
          <g key={`y${v}`}>
            <line x1={0} y1={v} x2={-0.6} y2={v} />
            <text x={-1.1} y={v} textAnchor="end" dominantBaseline="central">
              {v}
            </text>
          </g>
        ))}
        <text x={floor.width_m + 0.4} y={floor.height_m + 2}>
          m
        </text>
      </g>

      {/* Los marcadores estimados van antes que los puntos para que no tapen sus códigos. */}
      {emitters.map((e) => (
        <g key={e.bssid} className="marker emitter" role="img" aria-label={`Emisor estimado ${e.bssid}`}>
          <title>{`Emisor estimado ${e.bssid}`}</title>
          <polygon points={`${e.x},${e.y - 1.2} ${e.x + 1.2},${e.y} ${e.x},${e.y + 1.2} ${e.x - 1.2},${e.y}`} />
          <text className="letter" x={e.x} y={e.y} fill="var(--on-cat)">
            E
          </text>
        </g>
      ))}
      {repeater && (
        <g className="marker repeater" role="img" aria-label="Ubicación recomendada del repetidor (estimada)">
          <title>Ubicación recomendada del repetidor (estimada)</title>
          <rect x={repeater.x - 1.1} y={repeater.y - 1.1} width={2.2} height={2.2} rx={0.4} />
          <text className="letter" x={repeater.x} y={repeater.y} fill="var(--on-cat)">
            +
          </text>
        </g>
      )}

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
            <circle className="halo" cx={p.x} cy={p.y} r={RADIUS_M + 1.2} />
            <circle
              className={empty ? 'dot dot-empty' : 'dot'}
              cx={p.x}
              cy={p.y}
              r={RADIUS_M}
              fill={empty ? 'var(--sheet)' : color}
              stroke={color}
            />
            <text className="letter" x={p.x} y={p.y} fill={empty ? color : 'var(--on-cat)'}>
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
