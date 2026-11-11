import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError } from '../api/client.ts'
import { login } from '../api/endpoints.ts'
import { saveSession } from '../api/session.ts'

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
  )
}
