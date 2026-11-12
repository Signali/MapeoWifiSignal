package cl.signalmap.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import cl.signalmap.app.device.NfcReader
import cl.signalmap.app.ui.LoginScreen
import cl.signalmap.app.ui.MeasureScreen
import cl.signalmap.app.ui.theme.SignalMapTheme

class MainActivity : ComponentActivity() {
    private lateinit var nfcReader: NfcReader
    private var nfcAvailable by mutableStateOf(true)
    private var nfcEnabled by mutableStateOf(true)
    private var resumed by mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        nfcReader = NfcReader(this)
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

                // Permiso de ubicación: se explica antes de pedirlo y se vuelve a revisar al volver a la app.
                var permissionAsked by remember { mutableStateOf(false) }
                var hasLocation by remember { mutableStateOf(hasLocationPermission()) }
                LaunchedEffect(resumed) { hasLocation = hasLocationPermission() }
                val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
                    permissionAsked = true
                    hasLocation = hasLocationPermission()
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
                            measureState = viewModel.measureState,
                            pending = viewModel.pending,
                            nfcAvailable = nfcAvailable,
                            nfcEnabled = nfcEnabled,
                            showPermissionIntro = !hasLocation && !permissionAsked,
                            onPhase = viewModel::selectPhase,
                            onLogout = viewModel::logout,
                            onOpenNfcSettings = { startActivity(Intent(Settings.ACTION_NFC_SETTINGS)) },
                            onRequestPermission = {
                                permissionLauncher.launch(
                                    arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
                                )
                            },
                            onMeasure = viewModel::measure,
                            onOpenSettings = { startActivity(settingsIntent(it)) },
                            onTick = viewModel::tickCooldown,
                            onMeasureAgain = viewModel::measureAgain,
                            onFlush = viewModel::sendNow,
                            onDiscard = viewModel::discard,
                            modifier = Modifier.padding(innerPadding),
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

    private fun hasLocationPermission() =
        hasPermission(Manifest.permission.ACCESS_FINE_LOCATION) || hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)

    private fun settingsIntent(target: SettingsTarget) = when (target) {
        SettingsTarget.App ->
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null))
        SettingsTarget.Location -> Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)
        SettingsTarget.Wifi -> Intent(Settings.ACTION_WIFI_SETTINGS)
    }
}
