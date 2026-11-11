// Tipos del contrato (docs/api-contract.md), en snake_case como la API.

export type Role = 'admin' | 'tecnico' | 'cliente'

export type Category = 'buena' | 'regular' | 'debil' | 'sin_senal'

export type Phase = 'antes' | 'despues'

export interface Building {
  id: number
  name: string
}

export interface Vertex {
  x: number
  y: number
}

export interface Floor {
  id: number
  building_id: number
  name: string
  width_m: number
  height_m: number
  // Contorno real del edificio (siempre viene; el rectángulo si no tiene uno propio) e imagen del plano.
  outline: Vertex[]
  plan_url: string | null
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

// Contrato §6.19: celdas del mapa de calor (solo las de adentro del contorno). La categoría la calcula el servicio.
export interface HeatCell {
  x: number
  y: number
  rssi_dbm: number | null
  category: Category | null
}

export interface Heatmap {
  floor_id: number
  phase: Phase
  cell_m: number
  cols: number
  rows: number
  points_used: number
  cells: HeatCell[]
}

// Contrato §6.20: posición estimada de un emisor (trilateración).
export interface Emitter {
  bssid: string
  ssid: string
  frequency_mhz: number
  x: number
  y: number
  p0_dbm: number
  n: number
  n_fixed: boolean
  rmse_db: number
  points_used: number
  estimated: true
}

// Contrato §6.21: ubicación recomendada del repetidor (siempre con la fase «antes»).
export interface Recommendation {
  floor_id: number
  position: Vertex | null
  emitter_bssid: string | null
  target_points: number | null
  covered_points: number | null
  reason: string | null
  estimated: true
}
