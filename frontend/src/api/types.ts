// Tipos del contrato (docs/api-contract.md), en snake_case como la API.
// Measurement, Reading y FloorMeasurement entran en T13, cuando el contrato del PR #14 esté acordado.

export type Role = 'admin' | 'tecnico' | 'cliente'

export type Category = 'buena' | 'regular' | 'debil' | 'sin_senal'

export type Phase = 'antes' | 'despues'

export interface Building {
  id: number
  name: string
}

export interface Floor {
  id: number
  building_id: number
  name: string
  width_m: number
  height_m: number
}

export interface Point {
  id: number
  floor_id: number
  code: string
  x: number
  y: number
  nfc_uid: string
}

export interface LoginResponse {
  token: string
  expires_in: number
  user: { id: number; email: string; role: Role }
}
