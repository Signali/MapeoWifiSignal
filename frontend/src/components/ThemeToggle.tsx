import { useState } from 'react'
import { currentTheme, setTheme } from '../theme.ts'
import type { Theme } from '../theme.ts'

// Interruptor de tema claro y oscuro. El botón dice a qué tema se cambia.
export function ThemeToggle() {
  const [theme, setCurrent] = useState<Theme>(currentTheme)
  const next: Theme = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      className="ghost"
      onClick={() => {
        setTheme(next)
        setCurrent(next)
      }}
    >
      {next === 'dark' ? 'Tema oscuro' : 'Tema claro'}
    </button>
  )
}
