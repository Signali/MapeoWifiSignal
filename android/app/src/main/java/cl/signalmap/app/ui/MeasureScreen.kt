package cl.signalmap.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import cl.signalmap.app.Phase
import cl.signalmap.app.TagState

@Composable
fun MeasureScreen(
    email: String,
    phase: Phase,
    tag: TagState,
    nfcAvailable: Boolean,
    nfcEnabled: Boolean,
    onPhase: (Phase) -> Unit,
    onLogout: () -> Unit,
    onOpenNfcSettings: () -> Unit,
    modifier: Modifier = Modifier,
    extra: @Composable () -> Unit = {},
) {
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
        // T12 conecta este botón con el escaneo y el envío.
        Button(onClick = {}, enabled = hasTag) { Text("Medir WiFi") }

        extra()
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
