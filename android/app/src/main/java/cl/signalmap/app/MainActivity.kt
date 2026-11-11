package cl.signalmap.app

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import cl.signalmap.app.data.Reading
import cl.signalmap.app.data.toReadings
import cl.signalmap.app.device.NfcReader
import cl.signalmap.app.device.ScanBudget
import cl.signalmap.app.device.ScanOutcome
import cl.signalmap.app.device.WifiScanner
import androidx.lifecycle.viewmodel.compose.viewModel
import cl.signalmap.app.ui.LoginScreen
import cl.signalmap.app.ui.MeasureScreen
import cl.signalmap.app.ui.theme.SignalMapTheme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// La prueba del escaneo WiFi (T03) sigue como bloque temporal dentro de «Medir»; T12 la reemplaza.
class MainActivity : ComponentActivity() {
    private lateinit var nfcReader: NfcReader
    private lateinit var wifiScanner: WifiScanner
    private val scanBudget = ScanBudget { SystemClock.elapsedRealtime() }
    private var nfcAvailable by mutableStateOf(true)
    private var nfcEnabled by mutableStateOf(true)
    private var resumed by mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        nfcReader = NfcReader(this)
        wifiScanner = WifiScanner(this)
        setContent {
            SignalMapTheme {
                val viewModel: AppViewModel = viewModel()
                // El lector NFC corre solo con la pantalla «Medir» visible.
                val readerActive = resumed && viewModel.screen == Screen.Measure
                DisposableEffect(readerActive) {
                    if (readerActive) {
                        nfcAvailable = nfcReader.isAvailable
                        nfcEnabled = nfcReader.isEnabled
                        nfcReader.start(viewModel::onTag)
                    }
                    onDispose { if (readerActive) nfcReader.stop() }
                }
                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                    when (viewModel.screen) {
                        Screen.Login -> LoginScreen(
                            initialServer = viewModel.savedBaseUrl,
                            message = viewModel.loginMessage,
                            loggingIn = viewModel.loggingIn,
                            onLogin = viewModel::login,
                            modifier = Modifier.padding(innerPadding),
                        )
                        Screen.Measure -> MeasureScreen(
                            email = viewModel.email,
                            phase = viewModel.phase,
                            tag = viewModel.tag,
                            nfcAvailable = nfcAvailable,
                            nfcEnabled = nfcEnabled,
                            onPhase = viewModel::selectPhase,
                            onLogout = viewModel::logout,
                            onOpenNfcSettings = { startActivity(Intent(Settings.ACTION_NFC_SETTINGS)) },
                            modifier = Modifier.padding(innerPadding),
                            extra = { WifiTestSection() },
                        )
                    }
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        resumed = true
    }

    override fun onPause() {
        resumed = false
        super.onPause()
    }

    private fun hasPermission(permission: String) =
        ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

    @Composable
    private fun WifiTestSection() {
        val scope = rememberCoroutineScope()
        var permissionAsked by remember { mutableStateOf(false) }
        var hasFine by remember { mutableStateOf(hasPermission(Manifest.permission.ACCESS_FINE_LOCATION)) }
        var hasCoarse by remember { mutableStateOf(hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)) }
        var message by remember { mutableStateOf<String?>(null) }
        var settingsAction by remember { mutableStateOf<Intent?>(null) }
        var blockedSeconds by remember { mutableStateOf(0) }
        var scanning by remember { mutableStateOf(false) }
        var readings by remember { mutableStateOf<List<Reading>?>(null) }

        val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            permissionAsked = true
            hasFine = hasPermission(Manifest.permission.ACCESS_FINE_LOCATION)
            hasCoarse = hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)
        }

        // Cuenta regresiva mientras el contador propio está lleno.
        LaunchedEffect(blockedSeconds > 0) {
            while (blockedSeconds > 0) {
                delay(1_000)
                blockedSeconds = scanBudget.secondsUntilNext()
            }
        }

        val appSettings = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null))

        fun block(text: String, action: Intent? = null) {
            message = text
            settingsAction = action
            readings = null
        }

        fun measure() {
            // Orden de las revisiones: permiso, ubicación encendida, WiFi encendido, contador.
            hasFine = hasPermission(Manifest.permission.ACCESS_FINE_LOCATION)
            hasCoarse = hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)
            val locationManager = getSystemService(Context.LOCATION_SERVICE) as android.location.LocationManager
            when {
                !hasFine && hasCoarse ->
                    block("Elige «Ubicación precisa»: con la aproximada, Android no entrega las redes WiFi.", appSettings)
                !hasFine -> block(
                    "Sin el permiso de ubicación no se pueden buscar redes WiFi. " +
                        "Actívalo en Ajustes > Apps > SignalMap > Permisos.",
                    appSettings,
                )
                !LocationManagerCompat.isLocationEnabled(locationManager) -> block(
                    "Activa la ubicación del teléfono: Android la exige para buscar redes WiFi.",
                    Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS),
                )
                !wifiScanner.isWifiEnabled -> block(
                    "Activa el WiFi del teléfono para medir.",
                    Intent(Settings.ACTION_WIFI_SETTINGS),
                )
                !scanBudget.canScan() -> {
                    blockedSeconds = scanBudget.secondsUntilNext()
                    block("")
                }
                else -> {
                    message = "Buscando redes WiFi…"
                    settingsAction = null
                    readings = null
                    scanning = true
                    scope.launch {
                        val outcome = wifiScanner.scan()
                        scanning = false
                        when (outcome) {
                            // startScan() aceptado: Android lo cuenta aunque no responda.
                            is ScanOutcome.Ok -> {
                                scanBudget.record()
                                val result = toReadings(outcome.networks)
                                if (result.isEmpty()) {
                                    block("No se encontró ninguna red WiFi. Intenta de nuevo en otro lugar del punto.")
                                } else {
                                    message = null
                                    readings = result
                                }
                            }
                            ScanOutcome.TimedOut -> {
                                scanBudget.record()
                                block("La búsqueda de redes no terminó. Intenta de nuevo.")
                            }
                            ScanOutcome.Throttled -> block(
                                "Android rechazó la búsqueda de redes (límite de 4 cada 2 minutos). " +
                                    "Espera un momento y vuelve a intentar.",
                            )
                        }
                    }
                }
            }
        }

        if (!hasFine && !hasCoarse && !permissionAsked) {
            Text(
                "Para buscar redes WiFi, Android exige el permiso de ubicación. " +
                    "SignalMap no guarda tu ubicación: solo las redes que capta.",
            )
            Button(onClick = {
                launcher.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
            }) { Text("Dar permiso") }
        } else {
            Button(onClick = { measure() }, enabled = !scanning) { Text("Medir WiFi") }
        }

        if (blockedSeconds > 0) {
            Text("Android permite 4 búsquedas de WiFi cada 2 minutos. Podrás medir de nuevo en $blockedSeconds s.")
        } else {
            message?.takeIf { it.isNotEmpty() }?.let { Text(it) }
        }
        settingsAction?.let { intent -> Button(onClick = { startActivity(intent) }) { Text("Abrir ajustes") } }
        readings?.let { list ->
            Text("Redes captadas: ${list.size}", style = MaterialTheme.typography.titleMedium)
            list.take(5).forEach { Text("${it.ssid.ifEmpty { "(sin nombre)" }} · ${it.rssiDbm} dBm · ${it.frequencyMhz} MHz") }
        }
    }
}
