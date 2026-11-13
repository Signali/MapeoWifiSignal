import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError } from '../api/client.ts'
import { login } from '../api/endpoints.ts'
import { saveSession } from '../api/session.ts'
import { ThemeToggle } from './ThemeToggle.tsx'

// Dibujo decorativo del login: un plano pequeño con puntos y una zona estimada (no son datos reales).
const ART_POINTS: { x: number; y: number; c: 'buena' | 'regular' | 'debil'; letter: string }[] = []
for (const [xi, x] of [10, 24, 38, 52].entries()) {
  for (const y of [8, 18, 28]) {
    const c = xi < 2 ? 'buena' : xi === 2 ? 'regular' : 'debil'
    ART_POINTS.push({ x, y, c, letter: c === 'buena' ? 'B' : c === 'regular' ? 'R' : 'D' })
  }
}

function LoginArt() {
  return (
    <svg viewBox="0 0 62 36" aria-hidden="true" className="plan">
      <rect className="outline-fill" x={1} y={1} width={60} height={34} />
      {ART_POINTS.map((p) => (
        <rect key={`z${p.x}-${p.y}`} x={p.x - 7} y={p.y - 5} width={14} height={10} fill={`var(--${p.c === 'debil' ? 'debil' : p.c})`} fillOpacity={0.2} />
      ))}
      <rect className="outline" x={1} y={1} width={60} height={34} />
      {ART_POINTS.map((p) => (
        <g key={`${p.x}-${p.y}`}>
          <circle cx={p.x} cy={p.y} r={2.2} fill={`var(--${p.c})`} />
          <text className="letter" x={p.x} y={p.y} fill="var(--on-cat)" style={{ fontSize: '2.2px' }}>
            {p.letter}
          </text>
        </g>
      ))}
      <g className="marker repeater">
        <rect x={29.5} y={14.5} width={4} height={4} rx={0.6} />
      </g>
    </svg>
  )
}

interface Props {
  notice: string | null
  onLoggedIn: () => void
}

export function LoginView({ notice, onLoggedIn }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (email.trim() === '') return setError('Escribe tu email.')
    if (password === '') return setError('Escribe tu contraseña.')
    setError(null)
    setSending(true)
    try {
      saveSession(await login(email.trim(), password))
      onLoggedIn()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setError('Email o contraseña incorrectos.')
      else setError(err instanceof ApiError ? err.message : 'Petición inválida')
      setSending(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-top">
        <ThemeToggle />
      </div>
      <div className="login-wrap">
        <div className="login-art" aria-hidden="true">
          <LoginArt />
          <p>Mide la señal WiFi punto por punto y muéstrala en el plano.</p>
        </div>
        <main className="login">
          <h1>SignalMap</h1>
          <form onSubmit={submit} noValidate>
            {notice && <p className="notice">{notice}</p>}
            <label>
              Email
              <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>
              Contraseña
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" disabled={sending}>
              {sending ? 'Entrando…' : 'Iniciar sesión'}
            </button>
          </form>
        </main>
      </div>
    </div>
  )
}
