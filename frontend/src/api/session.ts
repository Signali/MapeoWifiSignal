import type { LoginResponse, Role } from './types.ts'

const KEY = 'signalmap.session'

export interface Session {
  token: string
  expires_at: number
  email: string
  role: Role
}

// Respaldo en memoria: si sessionStorage falla (ventana privada, datos bloqueados) la sesión
// dura mientras la pestaña no se recargue.
let memory: Session | null = null

function isValid(s: Session | null): s is Session {
  return s !== null && typeof s.token === 'string' && typeof s.expires_at === 'number' && s.expires_at > Date.now()
}

export function getSession(): Session | null {
  let stored: Session | null = null
  try {
    const raw = sessionStorage.getItem(KEY)
    if (raw) stored = JSON.parse(raw) as Session
  } catch {
    // sin almacenamiento o JSON dañado: se usa la memoria
  }
  const s = isValid(stored) ? stored : isValid(memory) ? memory : null
  if (!s) clearSession()
  return s
}

export function saveSession(login: LoginResponse): void {
  memory = {
    token: login.token,
    expires_at: Date.now() + login.expires_in * 1000,
    email: login.user.email,
    role: login.user.role,
  }
  try {
    sessionStorage.setItem(KEY, JSON.stringify(memory))
  } catch {
    // queda solo en memoria
  }
}

export function clearSession(): void {
  memory = null
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // nada que borrar
  }
}
