import type { Emitter, Recommendation } from '../api/types.ts'
import { StatusMessage } from './StatusMessage.tsx'

const NO_EMITTER = 'Faltan puntos medidos para estimar el emisor (mínimo 3).'

const number = (value: number, digits = 1) => value.toLocaleString('es-CL', { minimumFractionDigits: digits, maximumFractionDigits: digits })

// Banda según la frecuencia (MHz): 2,4 GHz, 5 GHz o 6 GHz.
export function bandOf(frequencyMhz: number): string {
  if (frequencyMhz < 2500) return '2,4 GHz'
  if (frequencyMhz < 5925) return '5 GHz'
  return '6 GHz'
}

interface Props {
  // null = todavía no llegó o el pedido falló (el error se muestra aparte, junto al plano).
  emitters: Emitter[] | null
  recommendation: Recommendation | null
  loading: boolean
  showHeat: boolean
  showMarkers: boolean
  onShowHeat: (value: boolean) => void
  onShowMarkers: (value: boolean) => void
}

// Capas del plano y lo que el servicio estimó: emisores (trilateración) y ubicación recomendada del repetidor.
// Todo es una estimación: se dice así en pantalla.
export function AnalysisPanel({ emitters, recommendation, loading, showHeat, showMarkers, onShowHeat, onShowMarkers }: Props) {
  const pending = loading ? <StatusMessage kind="loading" message="Cargando el análisis…" /> : null
  return (
    <section className="analysis" aria-label="Análisis del piso">
      <div className="layers">
        <label className="check">
          <input type="checkbox" checked={showHeat} onChange={(e) => onShowHeat(e.target.checked)} />
          Mapa de calor
        </label>
        <label className="check">
          <input type="checkbox" checked={showMarkers} onChange={(e) => onShowMarkers(e.target.checked)} />
          Emisor y repetidor (estimados)
        </label>
      </div>

      <div>
        <h3>
          <span className="swatch swatch-emitter" aria-hidden="true">
            E
          </span>
          Emisores estimados
        </h3>
        {emitters === null ? (
          pending
        ) : emitters.length === 0 ? (
          <StatusMessage kind="empty" message={NO_EMITTER} />
        ) : (
          <ul className="estimates">
            {emitters.map((e) => (
              <li key={e.bssid}>
                <code>{e.bssid}</code> · {bandOf(e.frequency_mhz)} · posición ({number(e.x)}; {number(e.y)}) m · error ±
                {number(e.rmse_db)} dB · {e.points_used} puntos
                {e.n_fixed && ' · con 3 puntos se fija n = 3,0'}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3>
          <span className="swatch swatch-repeater" aria-hidden="true">
            +
          </span>
          Ubicación recomendada del repetidor
        </h3>
        {recommendation === null ? (
          pending
        ) : recommendation.position ? (
          <p className="estimates">
            ({number(recommendation.position.x)}; {number(recommendation.position.y)}) m, <strong>estimada</strong>:
            mejoraría {recommendation.covered_points} de {recommendation.target_points} puntos que hoy no tienen señal
            buena (según la fase «Antes»).
          </p>
        ) : (
          <StatusMessage kind="empty" message={recommendation.reason ?? NO_EMITTER} />
        )}
      </div>
    </section>
  )
}
