import { request } from './client.ts'
import type { Building, Emitter, Floor, FloorMeasurement, Heatmap, LoginResponse, Phase, Point, Recommendation } from './types.ts'

const BASE = '/api/v1'

// Contrato §6.2
export function login(email: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>(`${BASE}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

// Contrato §6.3
export function listBuildings(): Promise<Building[]> {
  return request<Building[]>(`${BASE}/buildings`)
}

// Contrato §6.8
export function listFloors(buildingId: number): Promise<Floor[]> {
  return request<Floor[]>(`${BASE}/floors?building_id=${buildingId}`)
}

// Contrato §6.9
export function listPoints(floorId: number): Promise<Point[]> {
  return request<Point[]>(`${BASE}/points?floor_id=${floorId}`)
}

// Contrato §6.16
export function listMeasurements(floorId: number, phase: Phase): Promise<FloorMeasurement[]> {
  return request<FloorMeasurement[]>(`${BASE}/measurements?floor_id=${floorId}&phase=${phase}`)
}

// Contrato §6.19
export function getHeatmap(floorId: number, phase: Phase): Promise<Heatmap> {
  return request<Heatmap>(`${BASE}/heatmap?floor_id=${floorId}&phase=${phase}`)
}

// Contrato §6.20
export function listEmitters(floorId: number, phase: Phase): Promise<Emitter[]> {
  return request<Emitter[]>(`${BASE}/emitters?floor_id=${floorId}&phase=${phase}`)
}

// Contrato §6.21 (sin phase: siempre «antes»)
export function getRecommendation(floorId: number): Promise<Recommendation> {
  return request<Recommendation>(`${BASE}/recommendation?floor_id=${floorId}`)
}
