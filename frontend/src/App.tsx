import { useEffect, useState } from 'react'
import { MSG_EXPIRED, setUnauthorizedHandler } from './api/client.ts'
import { clearSession, getSession } from './api/session.ts'
import { FloorView } from './components/FloorView.tsx'
import { LoginView } from './components/LoginView.tsx'

export function App() {
  const [session, setSession] = useState(getSession)
  const [notice, setNotice] = useState<string | null>(null)

  // Si la API rechaza el token, el cliente ya borró la sesión: se vuelve al login con el aviso.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setSession(null)
      setNotice(MSG_EXPIRED)
    })
  }, [])

  if (!session) {
    return (
      <LoginView
        notice={notice}
        onLoggedIn={() => {
          setNotice(null)
          setSession(getSession())
        }}
      />
    )
  }

  return (
    <FloorView
      session={session}
      onLogout={() => {
        clearSession()
        setNotice(null)
        setSession(null)
      }}
    />
  )
}
