package cl.signalmap.app.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color

// Paleta «aurora» (la misma de la web y del documento técnico), en tema claro y oscuro.
// Los valores están verificados con contraste de 4,5:1 para texto y 3:1 para los círculos de categoría.

// Claro
val AuroraInk = Color(0xFF131521)
val AuroraTitle = Color(0xFF342E4E)
val AuroraAccent = Color(0xFF435570)
val AuroraMuted = Color(0xFF5B6478)
val AuroraLine = Color(0xFFD5DAD3)
val AuroraPanel = Color(0xFFF5F7F4)

// Oscuro
val AuroraNight = Color(0xFF131521)
val AuroraNightSheet = Color(0xFF1B1E30)
val AuroraNightPanel = Color(0xFF181B2B)
val AuroraNightInk = Color(0xFFE8EBF2)
val AuroraNightTitle = Color(0xFFD9D4F0)
val AuroraNightAccent = Color(0xFFA9BDD9)
val AuroraNightMuted = Color(0xFF9AA3BC)
val AuroraNightLine = Color(0xFF3A4160)

/** Colores de las categorías de señal (la API calcula la categoría; aquí solo cómo se ve). */
@Immutable
data class SignalColors(
    val buena: Color,
    val regular: Color,
    val debil: Color,
    val sinSenal: Color,
    val sinMedir: Color,
    /** Color de la letra sobre el relleno de una categoría. */
    val onCategory: Color,
)

val LightSignalColors = SignalColors(
    buena = Color(0xFF2E7D4F),
    regular = Color(0xFF8A5A00),
    debil = Color(0xFFB3261E),
    sinSenal = Color(0xFF131521),
    sinMedir = Color(0xFF435570),
    onCategory = Color(0xFFFFFFFF),
)

val DarkSignalColors = SignalColors(
    buena = Color(0xFF5CC98B),
    regular = Color(0xFFE5A93B),
    debil = Color(0xFFFF8F85),
    sinSenal = Color(0xFFE8EBF2),
    sinMedir = Color(0xFFA9BDD9),
    onCategory = Color(0xFF131521),
)
