package cl.signalmap.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

private val LightColorScheme = lightColorScheme(
    primary = AuroraTitle,
    onPrimary = Color.White,
    secondary = AuroraAccent,
    onSecondary = Color.White,
    tertiary = AuroraAccent,
    background = Color.White,
    onBackground = AuroraInk,
    surface = Color.White,
    onSurface = AuroraInk,
    surfaceVariant = AuroraPanel,
    onSurfaceVariant = AuroraMuted,
    outline = AuroraLine,
    outlineVariant = AuroraLine,
    error = Color(0xFFB3261E),
    onError = Color.White,
)

private val DarkColorScheme = darkColorScheme(
    primary = AuroraNightTitle,
    onPrimary = AuroraNight,
    secondary = AuroraNightAccent,
    onSecondary = AuroraNight,
    tertiary = AuroraNightAccent,
    background = AuroraNight,
    onBackground = AuroraNightInk,
    surface = AuroraNightSheet,
    onSurface = AuroraNightInk,
    surfaceVariant = AuroraNightPanel,
    onSurfaceVariant = AuroraNightMuted,
    outline = AuroraNightLine,
    outlineVariant = AuroraNightLine,
    error = Color(0xFFFF8F85),
    onError = AuroraNight,
)

// Esquinas: 2 dp en las fichas del plano y del punto (hoja de levantamiento) y 10 dp en los controles.
private val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(2.dp),
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(10.dp),
    large = RoundedCornerShape(14.dp),
)

val LocalSignalColors = staticCompositionLocalOf { LightSignalColors }

/** Colores de categoría del tema actual. */
object SignalTheme {
    val colors: SignalColors
        @Composable get() = LocalSignalColors.current
}

@Composable
fun SignalMapTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    // Sin color dinámico: la identidad es la misma en todos los teléfonos (no toma el color del fondo de pantalla).
    CompositionLocalProvider(LocalSignalColors provides if (darkTheme) DarkSignalColors else LightSignalColors) {
        MaterialTheme(
            colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme,
            typography = Typography,
            shapes = AppShapes,
            content = content,
        )
    }
}
