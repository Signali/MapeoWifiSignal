package cl.signalmap.app.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import cl.signalmap.app.R

// Fuentes variables incluidas en la app (res/font). minSdk 29: admiten ajustar el peso.
@OptIn(ExperimentalTextApi::class)
private fun variable(resId: Int, weight: Int, vararg extra: FontVariation.Setting) = Font(
    resId = resId,
    weight = FontWeight(weight),
    variationSettings = FontVariation.Settings(FontVariation.weight(weight), *extra),
)

// Bricolage Grotesque trae ejes de ancho y de tamaño óptico. Sin fijarlos, Android toma un valor de
// tamaño óptico pensado para titulares enormes y las letras quedan apretadas: se fija el de la web.
private val BricolageAxes = arrayOf(FontVariation.width(100f), FontVariation.Setting("opsz", 24f))

/** Texto corrido, botones y etiquetas. */
val TextFamily = FontFamily(
    variable(R.font.lexend, 400),
    variable(R.font.lexend, 500),
    variable(R.font.lexend, 600),
    variable(R.font.lexend, 700),
)

/** Títulos. */
val TitleFamily = FontFamily(
    variable(R.font.bricolage_grotesque, 500, *BricolageAxes),
    variable(R.font.bricolage_grotesque, 600, *BricolageAxes),
    variable(R.font.bricolage_grotesque, 700, *BricolageAxes),
)

/** Códigos de punto, BSSID y niveles en dBm. */
val MonoFamily = FontFamily(
    variable(R.font.jetbrains_mono, 400),
    variable(R.font.jetbrains_mono, 500),
)

val Typography = Typography(
    displayLarge = TextStyle(fontFamily = TitleFamily, fontWeight = FontWeight.SemiBold, fontSize = 44.sp, lineHeight = 48.sp),
    headlineLarge = TextStyle(fontFamily = TitleFamily, fontWeight = FontWeight.SemiBold, fontSize = 32.sp, lineHeight = 38.sp),
    headlineMedium = TextStyle(fontFamily = TitleFamily, fontWeight = FontWeight.SemiBold, fontSize = 28.sp, lineHeight = 34.sp),
    headlineSmall = TextStyle(fontFamily = TitleFamily, fontWeight = FontWeight.SemiBold, fontSize = 24.sp, lineHeight = 30.sp),
    titleLarge = TextStyle(fontFamily = TitleFamily, fontWeight = FontWeight.SemiBold, fontSize = 22.sp, lineHeight = 28.sp),
    titleMedium = TextStyle(fontFamily = TitleFamily, fontWeight = FontWeight.SemiBold, fontSize = 18.sp, lineHeight = 24.sp),
    titleSmall = TextStyle(fontFamily = TextFamily, fontWeight = FontWeight.Medium, fontSize = 15.sp, lineHeight = 22.sp),
    bodyLarge = TextStyle(fontFamily = TextFamily, fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontFamily = TextFamily, fontWeight = FontWeight.Normal, fontSize = 14.sp, lineHeight = 21.sp),
    bodySmall = TextStyle(fontFamily = TextFamily, fontWeight = FontWeight.Normal, fontSize = 13.sp, lineHeight = 19.sp),
    labelLarge = TextStyle(fontFamily = TextFamily, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, lineHeight = 22.sp),
    labelMedium = TextStyle(fontFamily = TextFamily, fontWeight = FontWeight.Medium, fontSize = 13.sp, lineHeight = 18.sp),
    labelSmall = TextStyle(fontFamily = TextFamily, fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 16.sp),
)

/** Estilos de código (fuera de la escala de Material). */
object CodeStyle {
    /** Código del punto en la ficha: «P-07». */
    val Point = TextStyle(fontFamily = MonoFamily, fontWeight = FontWeight.Medium, fontSize = 44.sp, lineHeight = 48.sp)
    /** Nivel en dBm del resultado. */
    val Level = TextStyle(fontFamily = MonoFamily, fontWeight = FontWeight.Medium, fontSize = 18.sp, lineHeight = 24.sp)
    /** Cuenta del usuario en la cabecera. */
    val Account = TextStyle(fontFamily = MonoFamily, fontWeight = FontWeight.Normal, fontSize = 13.sp, lineHeight = 18.sp)
}
