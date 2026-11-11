import { useEffect, useState } from 'react'
import { listBuildings, listFloors } from '../api/endpoints.ts'
import type { Session } from '../api/session.ts'
import type { Floor, Phase } from '../api/types.ts'
import { useRequest } from '../hooks/useRequest.ts'
import { readSelection, writeSelection } from '../selection.ts'
import type { Selection } from '../selection.ts'
import { StatusMessage } from './StatusMessage.tsx'

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

        {floor && (
          <div className="plan-placeholder">
            Plano (T05) · {floor.name} · {floor.width_m} × {floor.height_m} m
          </div>
        )}
      </main>
    </>
  )
}
