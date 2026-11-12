package cl.signalmap.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import cl.signalmap.app.MeasureState
import cl.signalmap.app.Phase
import cl.signalmap.app.SettingsTarget
import cl.signalmap.app.TagState
import cl.signalmap.app.data.PendingMeasurement
import kotlinx.coroutines.delay

/** Categoría que calcula la API, con el rótulo, la letra y el color de la web (plan, D13). */
private data class CategoryStyle(val label: String, val letter: String, val color: Color)

private fun styleOf(category: String) = when (category) {
    "buena" -> CategoryStyle("Buena", "B", Color(0xFF2E7D4F))
    "regular" -> CategoryStyle("Regular", "R", Color(0xFF8A5A00))
    "debil" -> CategoryStyle("Débil", "D", Color(0xFFB3261E))
    else -> CategoryStyle("Sin señal", "×", Color(0xFF131521))
}

@Composable
fun MeasureScreen(
    email: String,
    phase: Phase,
    tag: TagState,
    measureState: MeasureState,
    pending: List<PendingMeasurement>,
    nfcAvailable: Boolean,
    nfcEnabled: Boolean,
    showPermissionIntro: Boolean,
    onPhase: (Phase) -> Unit,
    onLogout: () -> Unit,
    confirmingLogout: Boolean,
    onCancelLogout: () -> Unit,
    onConfirmLogout: () -> Unit,
    onOpenNfcSettings: () -> Unit,
    onRequestPermission: () -> Unit,
    onMeasure: () -> Unit,
    onOpenSettings: (SettingsTarget) -> Unit,
    onTick: () -> Unit,
    onMeasureAgain: () -> Unit,
    onFlush: () -> Unit,
    onDiscard: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    // Cuenta regresiva mientras el contador propio está lleno.
    LaunchedEffect(measureState is MeasureState.Cooldown) {
        while (measureState is MeasureState.Cooldown) {
            delay(1_000)
            onTick()
        }
    }

    if (confirmingLogout) {
        AlertDialog(
            onDismissRequest = onCancelLogout,
            text = { Text(Messages.logoutWithPending(pending.size)) },
            dismissButton = { TextButton(onClick = onCancelLogout) { Text(Messages.LOGOUT_CANCEL) } },
            confirmButton = { TextButton(onClick = onConfirmLogout) { Text(Messages.LOGOUT_CONFIRM) } },
        )
    }

    Column(
        modifier = modifier.padding(24.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
            Text(email, style = MaterialTheme.typography.titleMedium)
            TextButton(onClick = onLogout) { Text("Cerrar sesión") }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Phase.entries.forEach {
                FilterChip(selected = it == phase, onClick = { onPhase(it) }, label = { Text(it.label) })
            }
        }

        when {
            !nfcAvailable -> Text(Messages.NFC_MISSING)
            !nfcEnabled -> {
                Text(Messages.NFC_OFF)
                Button(onClick = onOpenNfcSettings) { Text(Messages.OPEN_SETTINGS) }
            }
            else -> TagStatus(tag)
        }

        val hasTag = tag is TagState.Found || tag is TagState.OfflineTag
        val busy = measureState is MeasureState.Scanning || measureState is MeasureState.Sending
        if (showPermissionIntro) {
            Text(Messages.PERMISSION_INTRO)
            Button(onClick = onRequestPermission) { Text(Messages.GRANT_PERMISSION) }
        } else if (measureState is MeasureState.Done) {
            Button(onClick = onMeasureAgain) { Text(Messages.MEASURE_AGAIN) }
        } else {
            Button(onClick = onMeasure, enabled = hasTag && !busy) { Text(Messages.MEASURE) }
        }

        MeasureStatus(measureState, onOpenSettings)

        if (pending.isNotEmpty()) PendingBar(pending, onFlush, onDiscard)
    }
}

@Composable
private fun TagStatus(tag: TagState) {
    when (tag) {
        TagState.Idle -> Text(Messages.WAITING_TAG)
        TagState.Resolving -> Text(Messages.RESOLVING_TAG)
        is TagState.Found -> Text(tag.label, style = MaterialTheme.typography.headlineSmall)
        TagState.NotRegistered -> Text(Messages.TAG_NOT_REGISTERED, color = MaterialTheme.colorScheme.error)
        is TagState.OfflineTag ->
            Text(tag.label ?: Messages.offlineTag(tag.nfcUid), style = MaterialTheme.typography.titleMedium)
        is TagState.Failed -> Text(tag.message, color = MaterialTheme.colorScheme.error)
    }
}

@Composable
private fun MeasureStatus(state: MeasureState, onOpenSettings: (SettingsTarget) -> Unit) {
    when (state) {
        MeasureState.Idle -> Unit
        MeasureState.Scanning -> Text(Messages.SCANNING)
        MeasureState.Sending -> Text(Messages.SENDING)
        is MeasureState.Cooldown -> Text(Messages.scanBlocked(state.seconds), color = MaterialTheme.colorScheme.error)
        is MeasureState.Notice -> Text(state.message)
        is MeasureState.Blocked -> {
            Text(state.message, color = MaterialTheme.colorScheme.error)
            state.settings?.let { target ->
                Button(onClick = { onOpenSettings(target) }) { Text(Messages.OPEN_SETTINGS) }
            }
        }
        is MeasureState.Done -> ResultCard(state)
    }
}

@Composable
private fun ResultCard(result: MeasureState.Done) {
    val style = styleOf(result.category)
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(Messages.saved(result.point, result.phaseLabel), style = MaterialTheme.typography.titleMedium)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                // La letra va dentro del color: la categoría no depende solo del color.
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier.size(40.dp).background(style.color, RoundedCornerShape(8.dp)),
                ) { Text(style.letter, color = Color.White, style = MaterialTheme.typography.titleLarge) }
                Column {
                    Text(style.label, style = MaterialTheme.typography.headlineSmall)
                    Text(result.bestRssiDbm?.let { "${it.toString().replace('-', '−')} dBm" } ?: "Sin lecturas de la red")
                }
            }
            Text(Messages.savedReadings(result.saved, result.discarded))
        }
    }
}

@Composable
private fun PendingBar(pending: List<PendingMeasurement>, onFlush: () -> Unit, onDiscard: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(Messages.pending(pending.size), style = MaterialTheme.typography.titleMedium)
            OutlinedButton(onClick = onFlush) { Text(Messages.SEND_NOW) }
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
                        modifier = Modifier.weight(1f),
                    )
                    TextButton(onClick = { onDiscard(m.clientUuid) }) { Text(Messages.DISCARD) }
                }
            }
        }
    }
}
