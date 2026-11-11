import { useEffect, useState } from 'react'
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
import { StatusMessage } from './StatusMessage.tsx'
import { Summary } from './Summary.tsx'

interface Props {
  session: Session
  onLogout: () => void
}

const PHASES: { value: Phase; label: string }[] = [
  { value: 'antes', label: 'Antes' },
  { value: 'despues', label: 'Después' },
]

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
        <span className="who">
          {session.email} · {session.role}
        </span>
        <button type="button" onClick={onLogout}>
          Cerrar sesión
        </button>
      </header>

      <main className="floorview">
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

          <fieldset className="field phase">
            <legend>Fase</legend>
            {PHASES.map((p) => (
              <label key={p.value} className="radio">
                <input
                  type="radio"
                  name="phase"
                  value={p.value}
                  checked={sel.phase === p.value}
                  onChange={() => setSel({ ...sel, phase: p.value })}
                />
                {p.label}
              </label>
            ))}
          </fieldset>
        </section>

        {/* key: cada piso parte con estado nuevo (sin puntos, error ni selección del anterior). */}
        {floor && <PlanArea key={floor.id} floor={floor} phase={sel.phase} />}
      </main>
    </>
  )
}

function PlanArea({ floor, phase }: { floor: Floor; phase: Phase }) {
  const [selectedId, setSelectedId] = useState<number>()
  const points = useRequest<Point[]>(() => listPoints(floor.id), [floor.id])
  const measurements = useRequest<FloorMeasurement[]>(() => listMeasurements(floor.id, phase), [floor.id, phase])
  // Análisis del piso (rutas 19 a 21). Son capas auxiliares: si fallan, el plano con sus puntos sigue visible.
  const heatmap = useRequest<Heatmap>(() => getHeatmap(floor.id, phase), [floor.id, phase])
  const emitters = useRequest<Emitter[]>(() => listEmitters(floor.id, phase), [floor.id, phase])
  const recommendation = useRequest<Recommendation>(() => getRecommendation(floor.id), [floor.id])
  // Última respuesta de cada capa (no desaparece al recargar), pero una capa cuyo pedido falló se oculta:
  // no debe quedar dibujada la de otra fase como si valiera.
  const heatShown = useLatest(heatmap.data)
  const emittersShown = useLatest(emitters.data)
  const recommendationShown = useLatest(recommendation.data)
  const heatLayer = heatmap.error ? null : heatShown
  const emittersLayer = emitters.error ? null : emittersShown
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
        <>
          <div className="plan-actions">
            {!refreshing && <Summary categories={points.data.map((p) => categoryOf(p.id))} />}
            <button
              type="button"
              onClick={() => {
                measurements.reload()
                reloadAnalysis()
              }}
            >
              Actualizar
            </button>
          </div>
          {!refreshing && points.data.every((p) => categoryOf(p.id) === null) && (
            <StatusMessage
              kind="empty"
              message={`Todavía no hay mediciones en la fase «${phaseLabel}» en este piso.`}
            />
          )}
          <div className={refreshing ? 'plan-wrap refreshing' : 'plan-wrap'} aria-busy={refreshing}>
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
          {analysisError && <StatusMessage kind="error" message={analysisError} onRetry={reloadAnalysis} />}
          <AnalysisPanel
            emitters={emittersLayer}
            recommendation={recommendationLayer}
            loading={emitters.loading || recommendation.loading}
            showHeat={showHeat}
            showMarkers={showMarkers}
            onShowHeat={setShowHeat}
            onShowMarkers={setShowMarkers}
          />
        </>
      )}
      <Legend />
    </section>
  )
}
