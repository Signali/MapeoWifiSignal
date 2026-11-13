import type { Phase } from './api/types.ts'

export interface Selection {
  buildingId?: number
  floorId?: number
  phase: Phase
}

function toId(value: string | null): number | undefined {
  if (value === null || !/^[1-9]\d{0,9}$/.test(value)) return undefined
  const n = Number(value)
  return n <= 2147483647 ? n : undefined
}

// La selección vive en la URL (/?building_id=1&floor_id=1&phase=antes): F5 conserva el piso y la fase.
export function readSelection(): Selection {
  const params = new URLSearchParams(window.location.search)
  const phase = params.get('phase') === 'despues' ? 'despues' : 'antes'
  return {
    buildingId: toId(params.get('building_id')),
    floorId: toId(params.get('floor_id')),
    phase,
  }
}

export function writeSelection(sel: Selection): void {
  const params = new URLSearchParams()
  if (sel.buildingId !== undefined) params.set('building_id', String(sel.buildingId))
  if (sel.floorId !== undefined) params.set('floor_id', String(sel.floorId))
  params.set('phase', sel.phase)
  history.replaceState(null, '', `?${params.toString()}`)
}
