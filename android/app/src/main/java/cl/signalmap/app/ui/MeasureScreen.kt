package cl.signalmap.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import cl.signalmap.app.MeasureState
import cl.signalmap.app.Phase
import cl.signalmap.app.SettingsTarget
import cl.signalmap.app.TagState
import cl.signalmap.app.data.PendingMeasurement
import cl.signalmap.app.ui.theme.CodeStyle
import kotlinx.coroutines.delay

/**
 * Pantalla «Medir». Arriba la cuenta y la fase; en medio la ficha del punto, el resultado y lo pendiente;
 * abajo, fijo, el botón principal (al alcance del pulgar).
 */
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

    val hasTag = tag is TagState.Found || tag is TagState.OfflineTag
    val busy = measureState is MeasureState.Scanning || measureState is MeasureState.Sending

    Column(modifier = modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(start = 24.dp, end = 24.dp, top = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(email, style = CodeStyle.Account, color = MaterialTheme.colorScheme.secondary, modifier = Modifier.weight(1f, fill = false))
                TextButton(onClick = onLogout) { Text("Cerrar sesión", style = MaterialTheme.typography.labelLarge) }
            }

            PhaseSwitch(phase = phase, onPhase = onPhase)

            when {
                !nfcAvailable -> Text(Messages.NFC_MISSING)
                !nfcEnabled -> {
                    Text(Messages.NFC_OFF)
                    Button(onClick = onOpenNfcSettings) { Text(Messages.OPEN_SETTINGS) }
                }
                else -> PointCard(tag)
            }

            if (showPermissionIntro) Text(Messages.PERMISSION_INTRO)

            MeasureStatus(measureState, onOpenSettings)

            if (pending.isNotEmpty()) PendingCard(pending, onFlush, onDiscard)
        }

        Column(modifier = Modifier.padding(horizontal = 24.dp, vertical = 16.dp)) {
            when {
                showPermissionIntro -> PrimaryButton(Messages.GRANT_PERMISSION, onRequestPermission)
                measureState is MeasureState.Done -> PrimaryButton(Messages.MEASURE_AGAIN, onMeasureAgain)
                else -> PrimaryButton(Messages.MEASURE, onMeasure, enabled = hasTag && !busy)
            }
        }
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
        is MeasureState.Done -> ResultBlock(state)
    }
}
