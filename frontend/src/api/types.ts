// Tipos del contrato (docs/api-contract.md), en snake_case como la API.

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

export interface Reading {
  bssid: string
  ssid: string
  rssi_dbm: number
  frequency_mhz: number
}

// Contrato §6.15. La categoría la calcula el servicio: la web solo la muestra.
export interface Measurement {
  id: number
  point_id: number
  phase: Phase
  measured_at: string
  category: Category
  best_rssi_dbm: number | null
  voided: { reason: string; at: string } | null
  readings: Reading[]
}

// Contrato §6.16: un elemento por punto del piso, con su última medición válida de la fase.
export interface FloorMeasurement {
  point_id: number
  measurement: Measurement | null
}

export interface LoginResponse {
  token: string
  expires_in: number
  user: { id: number; email: string; role: Role }
}
