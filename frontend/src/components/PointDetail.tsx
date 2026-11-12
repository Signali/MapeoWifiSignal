import { useEffect } from 'react'
import type { Measurement, Point } from '../api/types.ts'
import { CATEGORY_STYLE } from '../categories.ts'
import { bandOf } from './AnalysisPanel.tsx'

interface Props {
  point: Point
  // null = el punto no tiene medición válida en la fase elegida.
  measurement: Measurement | null
  phaseLabel: string
  onClose: () => void
}

const dbm = (value: number) => `${value.toLocaleString('es-CL').replace('-', '−')} dBm`

// Detalle de un punto: su categoría (la calcula el servicio), el mejor nivel, cuándo se escaneó y las
// redes de la organización que se captaron. Escape o «Cerrar» lo cierran.
export function PointDetail({ point, measurement, phaseLabel, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape dentro de un campo (p. ej. para cerrar un <select> abierto) no cierra el panel.
      const inField = e.target instanceof Element && e.target.closest('select, input, textarea') !== null
      if (e.key === 'Escape' && !e.defaultPrevented && !inField) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const style = measurement ? CATEGORY_STYLE[measurement.category] : null

  return (
    <aside className="detail" aria-label={`Detalle de ${point.code}`}>
      <div className="detail-head">
        <h2>{point.code}</h2>
        <button type="button" onClick={onClose}>
          Cerrar
        </button>
      </div>

      {!measurement || !style ? (
        <p className="detail-empty">Sin medir en esta fase.</p>
      ) : (
        <>
          <p className="detail-category">
            <span className="swatch" style={{ '--c': style.color } as React.CSSProperties} aria-hidden="true">
              {style.letter}
            </span>
            <strong>{style.label}</strong>
            {measurement.best_rssi_dbm !== null && <span> · {dbm(measurement.best_rssi_dbm)}</span>}
          </p>
          <p className="detail-meta">
            Fase «{phaseLabel}» · escaneo del {new Date(measurement.measured_at).toLocaleString('es-CL')}
          </p>
          {measurement.readings.length === 0 ? (
            <p className="detail-empty">No se captó ninguna red de la organización en este escaneo.</p>
          ) : (
            <table className="readings">
              <caption>Redes captadas</caption>
              <thead>
                <tr>
                  <th scope="col">Red (SSID)</th>
                  <th scope="col">BSSID</th>
                  <th scope="col">Nivel</th>
                  <th scope="col">Banda</th>
                </tr>
              </thead>
              <tbody>
                {measurement.readings.map((r) => (
                  <tr key={r.bssid}>
                    <td data-label="Red (SSID)">{r.ssid}</td>
                    <td data-label="BSSID" className="mono">{r.bssid}</td>
                    <td data-label="Nivel">{dbm(r.rssi_dbm)}</td>
                    <td data-label="Banda">{bandOf(r.frequency_mhz)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </aside>
  )
}
