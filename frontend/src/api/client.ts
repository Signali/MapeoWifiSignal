import { clearSession, getSession } from './session.ts'

export const MSG_NETWORK = 'No se pudo conectar con el servidor. Revisa que el servicio esté encendido.'
export const MSG_SERVER = 'El servidor tuvo un problema. Intenta de nuevo en un momento.'
export const MSG_EXPIRED = 'Tu sesión venció. Inicia sesión de nuevo.'

const LOGIN_PATH = '/api/v1/auth/login'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

let onUnauthorized: () => void = () => {}

// App registra aquí qué hacer cuando la API rechaza el token (vuelve al login).
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler
}

async function messageOf(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: unknown }
    if (typeof body.message === 'string') return body.message
  } catch {
    // cuerpo vacío o que no es JSON
  }
  return 'Petición inválida'
}

// Único archivo de la web que llama a fetch.
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const session = getSession()
  if (session) headers.set('Authorization', `Bearer ${session.token}`)
  if (init.body !== undefined) headers.set('Content-Type', 'application/json')

  let res: Response
  try {
    res = await fetch(path, { ...init, headers })
  } catch {
    throw new ApiError(0, MSG_NETWORK)
  }

  if (res.ok) return (await res.json()) as T

  // Un 401 del login es «clave mala» (lo explica LoginView); en otra ruta, el token ya no sirve.
  if (res.status === 401 && path !== LOGIN_PATH) {
    clearSession()
    onUnauthorized()
    throw new ApiError(401, MSG_EXPIRED)
  }
  if (res.status >= 500) throw new ApiError(res.status, MSG_SERVER)
  throw new ApiError(res.status, await messageOf(res))
}
