import { request } from './client.ts'
import type { Building, Floor, LoginResponse, Point } from './types.ts'

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
