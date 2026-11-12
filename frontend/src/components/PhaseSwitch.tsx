import type { Phase } from '../api/types.ts'

export const PHASES: { value: Phase; label: string }[] = [
  { value: 'antes', label: 'Antes' },
  { value: 'despues', label: 'Después' },
]

interface Props {
  phase: Phase
  onChange: (phase: Phase) => void
}

// Fase (antes o después de instalar el repetidor) como control segmentado. Son radios: el teclado
// funciona igual que antes (flechas para cambiar).
export function PhaseSwitch({ phase, onChange }: Props) {
  return (
    <fieldset className="phase-switch">
      <legend className="sr-only">Fase</legend>
      {PHASES.map((p) => (
        <label key={p.value}>
          <input type="radio" name="phase" value={p.value} checked={phase === p.value} onChange={() => onChange(p.value)} />
          <span>{p.label}</span>
        </label>
      ))}
    </fieldset>
  )
}
