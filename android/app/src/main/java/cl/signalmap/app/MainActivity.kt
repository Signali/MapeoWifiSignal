package cl.signalmap.app

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import cl.signalmap.app.device.NfcReader
import cl.signalmap.app.ui.theme.SignalMapTheme

// Pantalla temporal de T02: muestra el UID de la tira. Se reemplaza en T12.
class MainActivity : ComponentActivity() {
    private lateinit var nfcReader: NfcReader
    private var nfcAvailable by mutableStateOf(true)
    private var nfcEnabled by mutableStateOf(true)
    private var lastUid by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        nfcReader = NfcReader(this)
        setContent {
            SignalMapTheme {
                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                    Column(
                        modifier = Modifier.padding(innerPadding).padding(24.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        when {
                            !nfcAvailable -> Text("Este teléfono no tiene NFC: no puede leer las tiras.")
                            !nfcEnabled -> {
                                Text("Activa NFC en los ajustes del teléfono para leer las tiras.")
                                Button(onClick = { startActivity(Intent(Settings.ACTION_NFC_SETTINGS)) }) {
                                    Text("Abrir ajustes")
                                }
                            }
                            else -> Text("Acerca el teléfono a una tira NFC.")
                        }
                        lastUid?.let { Text(it, style = MaterialTheme.typography.headlineMedium) }
                    }
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        nfcAvailable = nfcReader.isAvailable
        nfcEnabled = nfcReader.isEnabled
        nfcReader.start { lastUid = it }
    }

    override fun onPause() {
        nfcReader.stop()
        super.onPause()
    }
}
