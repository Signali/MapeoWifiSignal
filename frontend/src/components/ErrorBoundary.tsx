import { Component, type ReactNode } from 'react'
import { StatusMessage } from './StatusMessage.tsx'

interface Props {
  children: ReactNode
}

// Si un componente falla al dibujarse, React desmonta todo y la página queda en blanco.
// Esto muestra el estado de error en su lugar. «Reintentar» recarga la página: la selección
// (edificio, piso y fase) vive en la URL, así que se vuelve al mismo lugar.
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('Error al dibujar la página:', error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="login-page">
        <StatusMessage
          kind="error"
          message="Algo falló al mostrar esta pantalla. Recarga la página para intentarlo de nuevo."
          onRetry={() => window.location.reload()}
        />
      </div>
    )
  }
}
