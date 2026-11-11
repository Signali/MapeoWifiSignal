import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client.ts'

export interface RequestState<T> {
  data: T | null
  error: string | null
  loading: boolean
  reload: () => void
}

// Carga datos cuando cambian las dependencias e ignora las respuestas de pedidos viejos.
export function useRequest<T>(load: () => Promise<T>, deps: unknown[]): RequestState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const latest = useRef(0)
  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    const id = ++latest.current
    setLoading(true)
    setError(null)
    setData(null)
    loadRef
      .current()
      .then((result) => {
        if (id !== latest.current) return
        setData(result)
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (id !== latest.current) return
        setError(e instanceof ApiError ? e.message : 'Petición inválida')
        setLoading(false)
      })
    return () => {
      // invalida este pedido si cambian las dependencias o se desmonta
      latest.current++
    }
    // las dependencias las decide quien llama
  }, [...deps, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])

  return { data, error, loading, reload }
}
