package cl.signalmap.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.inset
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cl.signalmap.app.MeasureState
import cl.signalmap.app.Phase
import cl.signalmap.app.TagState
import cl.signalmap.app.data.PendingMeasurement
import cl.signalmap.app.ui.theme.CodeStyle
import cl.signalmap.app.ui.theme.SignalTheme

/**
 * Regla visual de la app (la misma de la web): línea continua = medido; línea punteada = pendiente,
 * por identificar o estimado.
 */
fun Modifier.dashedBorder(color: Color, width: Dp = 1.5.dp, radius: Dp = 10.dp): Modifier = drawBehind {
    val stroke = Stroke(
        width = width.toPx(),
        pathEffect = PathEffect.dashPathEffect(floatArrayOf(8.dp.toPx(), 5.dp.toPx())),
    )
    inset(width.toPx() / 2) {
        drawRoundRect(color = color, size = Size(size.width, size.height), cornerRadius = CornerRadius(radius.toPx()), style = stroke)
    }
}

/**
 * Separa la etiqueta de un punto, que llega como «P-07 · Piso 3 · Torre Norte», en el código («P-07») y
 * el lugar («Piso 3, Torre Norte»). Una etiqueta sin separador se toma entera como código.
 */
fun splitLabel(label: String): Pair<String, String?> {
    val parts = label.split(" · ").map { it.trim() }.filter { it.isNotEmpty() }
    if (parts.size < 2) return label to null
    return parts.first() to parts.drop(1).joinToString(", ")
}

/** Control segmentado de fase: «Antes» y «Después». */
@Composable
fun PhaseSwitch(phase: Phase, onPhase: (Phase) -> Unit, modifier: Modifier = Modifier) {
    val shape = MaterialTheme.shapes.small
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .border(1.dp, MaterialTheme.colorScheme.outline, shape)
            .padding(3.dp)
            .selectableGroup(),
    ) {
        Phase.entries.forEach { option ->
            val selected = option == phase
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 44.dp)
                    .clip(MaterialTheme.shapes.small)
                    .background(if (selected) MaterialTheme.colorScheme.primary else Color.Transparent)
                    .selectable(selected = selected, role = Role.RadioButton, onClick = { onPhase(option) }),
            ) {
                Text(
                    option.label,
                    style = MaterialTheme.typography.labelLarge,
                    color = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                )
            }
        }
    }
}

/** Ficha del punto: espera la tira, la busca o muestra el punto leído. */
@Composable
fun PointCard(tag: TagState, modifier: Modifier = Modifier) {
    when (tag) {
        TagState.Idle -> WaitingCard(Messages.WAITING_TAG, nfcIcon = true, modifier = modifier)
        TagState.Resolving -> WaitingCard(Messages.RESOLVING_TAG, nfcIcon = true, modifier = modifier)
        is TagState.Found -> FoundCard(tag.label, modifier)
        TagState.NotRegistered -> WaitingCard(Messages.TAG_NOT_REGISTERED, isError = true, modifier = modifier)
        is TagState.OfflineTag ->
            if (tag.label != null) FoundCard(tag.label, modifier)
            else WaitingCard(Messages.offlineTag(tag.nfcUid), nfcIcon = true, modifier = modifier)
        is TagState.Failed -> WaitingCard(tag.message, isError = true, modifier = modifier)
    }
}

@Composable
private fun WaitingCard(text: String, nfcIcon: Boolean = false, isError: Boolean = false, modifier: Modifier = Modifier) {
    val color = if (isError) MaterialTheme.colorScheme.error else SignalTheme.colors.sinMedir
    Column(
        modifier = modifier
            .fillMaxWidth()
            .dashedBorder(color, radius = 2.dp)
            .padding(horizontal = 16.dp, vertical = 22.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (nfcIcon) NfcIcon(color)
        Text(text, style = MaterialTheme.typography.titleLarge, color = if (isError) color else MaterialTheme.colorScheme.primary)
    }
}

@Composable
private fun FoundCard(label: String, modifier: Modifier = Modifier) {
    val (code, place) = splitLabel(label)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .border(1.dp, MaterialTheme.colorScheme.outline, MaterialTheme.shapes.extraSmall)
            .background(MaterialTheme.colorScheme.surface)
            .padding(horizontal = 16.dp, vertical = 14.dp),
    ) {
        Text(code, style = CodeStyle.Point, color = MaterialTheme.colorScheme.primary)
        place?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}

/** Tres ondas, como el símbolo de NFC. Decorativo. */
@Composable
private fun NfcIcon(color: Color) {
    Canvas(modifier = Modifier.size(40.dp)) {
        val stroke = Stroke(width = 2.4.dp.toPx(), cap = StrokeCap.Round)
        val center = Offset(4.dp.toPx(), size.height / 2)
        listOf(8.dp, 16.dp, 24.dp).forEach { radius ->
            val r = radius.toPx()
            drawArc(
                color = color,
                startAngle = -42f,
                sweepAngle = 84f,
                useCenter = false,
                topLeft = Offset(center.x - r, center.y - r),
                size = Size(2 * r, 2 * r),
                style = stroke,
            )
        }
    }
}

/** Categoría que calcula la API, con el rótulo y la letra de la web. El color depende del tema. */
private data class CategoryLook(val label: String, val letter: String, val color: Color)

@Composable
private fun lookOf(category: String): CategoryLook {
    val colors = SignalTheme.colors
    return when (category) {
        "buena" -> CategoryLook("Buena", "B", colors.buena)
        "regular" -> CategoryLook("Regular", "R", colors.regular)
        "debil" -> CategoryLook("Débil", "D", colors.debil)
        else -> CategoryLook("Sin señal", "×", colors.sinSenal)
    }
}

/** Resultado de una medición: un bloque del color de la categoría, con la letra y el nivel en dBm. */
@Composable
fun ResultBlock(result: MeasureState.Done, modifier: Modifier = Modifier) {
    val look = lookOf(result.category)
    val onCategory = SignalTheme.colors.onCategory
    Column(
        modifier = modifier
            .fillMaxWidth()
            .border(1.dp, MaterialTheme.colorScheme.outline, MaterialTheme.shapes.extraSmall)
            .clip(MaterialTheme.shapes.extraSmall)
            .background(MaterialTheme.colorScheme.surface)
            .semantics(mergeDescendants = true) {},
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            modifier = Modifier.fillMaxWidth().background(look.color).padding(16.dp),
        ) {
            // La letra va dentro del círculo: la categoría no depende solo del color.
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier.size(52.dp).border(3.dp, onCategory, CircleShape),
            ) {
                Text(look.letter, color = onCategory, fontSize = 24.sp, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
            }
            Column {
                Text(look.label, color = onCategory, style = MaterialTheme.typography.headlineMedium)
                Text(
                    result.bestRssiDbm?.let { "${it.toString().replace('-', '−')} dBm" } ?: "Sin lecturas de la red",
                    color = onCategory,
                    style = CodeStyle.Level,
                )
            }
        }
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(Messages.saved(result.phaseLabel), style = MaterialTheme.typography.bodyLarge)
            Text(
                Messages.savedReadings(result.saved, result.discarded),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/** Mediciones guardadas en el teléfono sin enviar. Borde punteado: aún no están en el servidor. */
@Composable
fun PendingCard(pending: List<PendingMeasurement>, onFlush: () -> Unit, onDiscard: (String) -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .dashedBorder(MaterialTheme.colorScheme.secondary)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(Messages.pending(pending.size), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
                Text(Messages.PENDING_HINT, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            OutlinedButton(
                onClick = onFlush,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.secondary),
                modifier = Modifier.heightIn(min = 48.dp),
            ) { Text(Messages.SEND_NOW, color = MaterialTheme.colorScheme.secondary, style = MaterialTheme.typography.labelLarge) }
        }
        pending.forEach { m ->
            m.lastError?.let { error ->
                Row(
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        "${m.pointLabel ?: Messages.tagName(m.nfcUid)}: $error",
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.weight(1f),
                    )
                    TextButton(onClick = { onDiscard(m.clientUuid) }) { Text(Messages.DISCARD) }
                }
            }
        }
    }
}

/** Botón principal, ancho completo y abajo, al alcance del pulgar. Sin habilitar, queda con borde fino. */
@Composable
fun PrimaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    Button(
        onClick = onClick,
        enabled = enabled,
        shape = MaterialTheme.shapes.large,
        colors = ButtonDefaults.buttonColors(
            containerColor = MaterialTheme.colorScheme.primary,
            contentColor = MaterialTheme.colorScheme.onPrimary,
            disabledContainerColor = Color.Transparent,
            disabledContentColor = MaterialTheme.colorScheme.onSurfaceVariant,
        ),
        border = if (enabled) null else BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        modifier = modifier.fillMaxWidth().heightIn(min = 56.dp),
    ) { Text(text, fontSize = 17.sp, style = MaterialTheme.typography.labelLarge) }
}
