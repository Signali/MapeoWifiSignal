import { useEffect, useState } from 'react'

// Conserva el último valor que llegó: useRequest vacía `data` en cada pedido, y así una capa del plano
// no desaparece mientras se recarga (cambio de fase o «Actualizar»).
export function useLatest<T>(value: T | null): T | null {
  const [latest, setLatest] = useState<T | null>(null)
  useEffect(() => {
    if (value !== null) setLatest(value)
  }, [value])
  return latest
}
