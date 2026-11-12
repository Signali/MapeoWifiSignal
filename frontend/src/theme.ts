// Tema claro u oscuro. Sin elección guardada, manda el del sistema (media query en styles.css).
// localStorage solo guarda la preferencia; si no está disponible, el tema sigue al sistema.
export type Theme = 'light' | 'dark'

const KEY = 'signalmap-theme'

function stored(): Theme | null {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

// Tema que se está viendo ahora.
export function currentTheme(): Theme {
  const fromPage = document.documentElement.dataset.theme
  if (fromPage === 'light' || fromPage === 'dark') return fromPage
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // sin almacenamiento: el cambio vale solo para esta visita
  }
}

// Se llama antes de dibujar, para no mostrar un destello del otro tema.
export function initTheme(): void {
  const saved = stored()
  if (saved) document.documentElement.dataset.theme = saved
}
