interface Props {
  kind: 'loading' | 'empty' | 'error'
  message: string
  onRetry?: () => void
}

// Estado de una lista o del plano: cargando, vacío o con error (con «Reintentar»).
export function StatusMessage({ kind, message, onRetry }: Props) {
  return (
    <div className={`status status-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <p>{message}</p>
      {kind === 'error' && onRetry && (
        <button type="button" onClick={onRetry}>
          Reintentar
        </button>
      )}
    </div>
  )
}
