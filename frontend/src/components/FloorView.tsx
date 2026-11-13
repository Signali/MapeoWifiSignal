import { useCallback, useEffect, useRef, useState } from 'react'
import { getHeatmap, getRecommendation, listBuildings, listEmitters, listFloors, listMeasurements, listPoints } from '../api/endpoints.ts'
import type { Session } from '../api/session.ts'
import type { Category, Emitter, Floor, FloorMeasurement, Heatmap, Phase, Point, Recommendation } from '../api/types.ts'
import { useLatest } from '../hooks/useLatest.ts'
import { useRequest } from '../hooks/useRequest.ts'
import { readSelection, writeSelection } from '../selection.ts'
import type { Selection } from '../selection.ts'
import { AnalysisPanel } from './AnalysisPanel.tsx'
import { FloorPlan } from './FloorPlan.tsx'
import { Legend } from './Legend.tsx'
import { PhaseSwitch, PHASES } from './PhaseSwitch.tsx'
import { PointChips } from './PointChips.tsx'
import { PointDetail } from './PointDetail.tsx'
import { StatusMessage } from './StatusMessage.tsx'
import { Summary } from './Summary.tsx'
import { ThemeToggle } from './ThemeToggle.tsx'

interface Props {
  session: Session
  onLogout: () => void
}

// Medida del piso para el cajetín: «40 × 25 m».
const meters = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 })

export function FloorView({ session, onLogout }: Props) {
  const [sel, setSel] = useState<Selection>(readSelection)

  const buildings = useRequest(listBuildings, [])
  // Si la URL trae un edificio que no está en la lista, se usa el primero.
  const buildingId = buildings.data
    ? (buildings.data.find((b) => b.id === sel.buildingId) ?? buildings.data[0])?.id
    : undefined

  const floors = useRequest<Floor[]>(
    () => (buildingId === undefined ? Promise.resolve([]) : listFloors(buildingId)),
    [buildingId],
  )
  // Al cambiar de edificio, un render conserva la lista del anterior: no se usa hasta que llegue la nueva.
  const stale = floors.data !== null && floors.data.length > 0 && floors.data[0].building_id !== buildingId
  const floorList = stale ? null : floors.data
  const floorsLoading = floors.loading || stale
  const floor = floorList ? (floorList.find((f) => f.id === sel.floorId) ?? floorList[0]) : undefined

  // La URL se actualiza solo con lo ya resuelto: mientras carga, se conserva lo que traía.
  useEffect(() => {
    writeSelection({
      buildingId: buildingId ?? sel.buildingId,
      floorId: floor?.id ?? sel.floorId,
      phase: sel.phase,
    })
  }, [buildingId, floor?.id, sel])

  return (
    <>
      <header className="topbar">
        <strong className="brand">SignalMap</strong>
        <section className="controls" aria-label="Selección de piso">
          <div className="field">
            {buildings.data && buildings.data.length > 0 ? (
              <label htmlFor="building">Edificio</label>
            ) : (
              <span className="label">Edificio</span>
            )}
            {buildings.loading && <StatusMessage kind="loading" message="Cargando edificios…" />}
            {buildings.error && <StatusMessage kind="error" message={buildings.error} onRetry={buildings.reload} />}
            {buildings.data?.length === 0 && (
              <StatusMessage kind="empty" message="No tienes edificios asignados. Pide acceso a un administrador." />
            )}
            {buildings.data && buildings.data.length > 0 && (
              <select
                id="building"
                value={buildingId}
                onChange={(e) => setSel({ ...sel, buildingId: Number(e.target.value), floorId: undefined })}
              >
                {buildings.data.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {buildingId !== undefined && (
            <div className="field">
              {floorList && floorList.length > 0 ? (
                <label htmlFor="floor">Piso</label>
              ) : (
                <span className="label">Piso</span>
              )}
              {floorsLoading && <StatusMessage kind="loading" message="Cargando el plano…" />}
              {floors.error && <StatusMessage kind="error" message={floors.error} onRetry={floors.reload} />}
              {!floorsLoading && floorList?.length === 0 && (
                <StatusMessage kind="empty" message="Este edificio todavía no tiene pisos cargados." />
              )}
              {floorList && floorList.length > 0 && (
                <select
                  id="floor"
                  value={floor?.id}
                  onChange={(e) => setSel({ ...sel, floorId: Number(e.target.value) })}
                >
                  {floorList.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

        </section>
        <div className="topbar-end">
          <span className="who">
            {session.email} · {session.role}
          </span>
          <ThemeToggle />
          <button type="button" className="ghost" onClick={onLogout}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="floorview">
        {/* key: cada piso parte con estado nuevo (sin puntos, error ni selección del anterior). */}
        {floor && (
          <PlanArea
            key={floor.id}
            floor={floor}
            buildingName={buildings.data?.find((b) => b.id === buildingId)?.name ?? ''}
            phase={sel.phase}
            onPhase={(phase) => setSel({ ...sel, phase })}
          />
        )}
      </main>
    </>
  )
}

interface PlanAreaProps {
  floor: Floor
  buildingName: string
  phase: Phase
  onPhase: (phase: Phase) => void
}

function PlanArea({ floor, buildingName, phase, onPhase }: PlanAreaProps) {
  const [selectedId, setSelectedId] = useState<number>()
  const points = useRequest<Point[]>(() => listPoints(floor.id), [floor.id])
  const measurements = useRequest<FloorMeasurement[]>(() => listMeasurements(floor.id, phase), [floor.id, phase])
  // Análisis del piso (rutas 19 a 21). Son capas auxiliares: si fallan, el plano con sus puntos sigue visible.
  // Cada respuesta lleva la fase con que se pidió, para no dibujar la capa de otra fase como si valiera.
  const heatmap = useRequest(() => getHeatmap(floor.id, phase).then((data) => ({ phase, data })), [floor.id, phase])
  const emitters = useRequest(() => listEmitters(floor.id, phase).then((data) => ({ phase, data })), [floor.id, phase])
  const recommendation = useRequest<Recommendation>(() => getRecommendation(floor.id), [floor.id])
  // Última respuesta de cada capa (no desaparece al recargar la misma fase). Una capa cuyo pedido falló,
  // o que es de la otra fase mientras llega la nueva, se oculta.
  const heatShown = useLatest(heatmap.data)
  const emittersShown = useLatest(emitters.data)
  const recommendationShown = useLatest(recommendation.data)
  const ofPhase = <T,>(layer: { phase: Phase; data: T } | null) => (layer?.phase === phase ? layer.data : null)
  const heatLayer: Heatmap | null = heatmap.error ? null : ofPhase(heatShown)
  const emittersLayer: Emitter[] | null = emitters.error ? null : ofPhase(emittersShown)
  const recommendationLayer = recommendation.error ? null : recommendationShown
  const [showHeat, setShowHeat] = useState(true)
  const [showMarkers, setShowMarkers] = useState(true)
  const analysisError = heatmap.error ?? emitters.error ?? recommendation.error
  const reloadAnalysis = () => {
    heatmap.reload()
    emitters.reload()
    recommendation.reload()
  }

  // useRequest vacía `data` en cada pedido; se conserva la última respuesta para que el plano no
  // desaparezca al cambiar de fase o al pulsar «Actualizar» (los puntos no cambian con la fase).
  const shown = useLatest(measurements.data)

  const error = points.error ?? measurements.error
  // Mientras llegan las mediciones, el plano sigue visible con las categorías anteriores, atenuado.
  const refreshing = measurements.loading && shown !== null

  // La categoría viene del servicio (ruta 16); la web no calcula umbrales.
  const byPoint = new Map<number, Category | null>(
    (shown ?? []).map((m) => [m.point_id, m.measurement?.category ?? null]),
  )
  const categoryOf = (pointId: number) => byPoint.get(pointId) ?? null
  const phaseLabel = PHASES.find((p) => p.value === phase)?.label
  const hasPoints = points.data !== null && points.data.length > 0
  const ready = !error && hasPoints && shown !== null
  const selectedPoint = points.data?.find((p) => p.id === selectedId)
  const planRef = useRef<HTMLDivElement>(null)
  const analysisRef = useRef<HTMLDivElement>(null)
  // Al cerrar, el foco vuelve al punto seleccionado (el botón «Cerrar» desaparece y, si no, se perdería).
  const closeDetail = useCallback(() => {
    planRef.current?.querySelector<SVGGElement>('.point.selected')?.focus()
    setSelectedId(undefined)
  }, [])
  // «Ver dónde instalar el repetidor»: lleva al análisis (donde está la ubicación estimada) y le da el foco.
  const goToAnalysis = () => {
    const el = analysisRef.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
    el.focus({ preventScroll: true })
  }

  const measuredCount = points.data ? points.data.filter((p) => categoryOf(p.id) !== null).length : 0
  const detailShown = selectedPoint !== undefined && !refreshing

  return (
    <section className="plan-area" aria-label={`Plano de ${floor.name}`}>
      {(points.loading || measurements.loading) && <StatusMessage kind="loading" message="Cargando el plano…" />}
      {error && (
        <StatusMessage
          kind="error"
          message={error}
          onRetry={() => {
            points.reload()
            measurements.reload()
          }}
        />
      )}
      {!points.loading && !error && points.data?.length === 0 && (
        <StatusMessage kind="empty" message="Este piso no tiene puntos de medición." />
      )}
      {ready && points.data && (
        <div className="floor-layout">
          <div className="phase-slot">
            <PhaseSwitch phase={phase} onChange={onPhase} />
          </div>

          <div className="main">
            <div className="sheet">
              <div ref={planRef} className={refreshing ? 'plan-wrap refreshing' : 'plan-wrap'} aria-busy={refreshing}>
                <FloorPlan
                  floor={floor}
                  points={points.data}
                  categoryOf={categoryOf}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  heat={showHeat && heatLayer ? { cells: heatLayer.cells, cellM: heatLayer.cell_m } : null}
                  emitters={showMarkers ? (emittersLayer ?? []) : []}
                  repeater={showMarkers ? (recommendationLayer?.position ?? null) : null}
                />
              </div>
              <p className="plan-hint">Desliza el plano hacia los lados para verlo completo.</p>
              <dl className="cajetin">
                <div>
                  <dt>Edificio y piso</dt>
                  <dd>{buildingName ? `${buildingName}, ${floor.name}` : floor.name}</dd>
                </div>
                <div>
                  <dt>Fase</dt>
                  <dd>{phaseLabel}</dd>
                </div>
                <div>
                  <dt>Puntos medidos</dt>
                  <dd className="mono">
                    {measuredCount} de {points.data.length}
                  </dd>
                </div>
                <div>
                  <dt>Medida del piso</dt>
                  <dd className="mono">
                    {meters(floor.width_m)} × {meters(floor.height_m)} m
                  </dd>
                </div>
              </dl>
              <div className="sheet-foot">
                <span className="rule">
                  <span>
                    <i />
                    medido
                  </span>
                  <span>
                    <i className="dashed" />
                    estimado o sin medir
                  </span>
                </span>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    measurements.reload()
                    reloadAnalysis()
                  }}
                >
                  Actualizar
                </button>
              </div>
            </div>

            {!refreshing && points.data.every((p) => categoryOf(p.id) === null) && (
              <StatusMessage
                kind="empty"
                message={`Todavía no hay mediciones en la fase «${phaseLabel}» en este piso.`}
              />
            )}
            {analysisError && <StatusMessage kind="error" message={analysisError} onRetry={reloadAnalysis} />}

            <div className={detailShown ? 'below two' : 'below'}>
              {/* Mientras llegan las mediciones de la fase nueva, `shown` aún trae las de la anterior:
                  el panel espera para no mostrar una fase con los datos de otra. */}
              {detailShown && (
                <PointDetail
                  point={selectedPoint}
                  measurement={shown?.find((m) => m.point_id === selectedPoint.id)?.measurement ?? null}
                  phaseLabel={phaseLabel ?? ''}
                  onClose={closeDetail}
                />
              )}
              <div ref={analysisRef} className="analysis-wrap" tabIndex={-1}>
                <AnalysisPanel
                  emitters={emittersLayer}
                  recommendation={recommendationLayer}
                  loading={emitters.loading || recommendation.loading}
                  showHeat={showHeat}
                  showMarkers={showMarkers}
                  onShowHeat={setShowHeat}
                  onShowMarkers={setShowMarkers}
                />
              </div>
            </div>
          </div>

          <div className="side-rest">
            <section aria-label="Leyenda de señal">
              <h3>Leyenda de señal</h3>
              <Legend />
            </section>
            <section aria-label="Resumen del piso">
              <h3>Resumen de {floor.name}</h3>
              {!refreshing && <Summary categories={points.data.map((p) => categoryOf(p.id))} />}
            </section>
            <section aria-label="Puntos del piso">
              {/* Plegada: repite los códigos del plano, así que solo ocupa lugar y paradas de Tab si se abre. */}
              <details className="point-list">
                <summary>Lista de puntos ({points.data.length})</summary>
                <PointChips points={points.data} categoryOf={categoryOf} selectedId={selectedId} onSelect={setSelectedId} />
              </details>
            </section>
            <button type="button" className="cta" onClick={goToAnalysis}>
              Ver dónde instalar el repetidor
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
