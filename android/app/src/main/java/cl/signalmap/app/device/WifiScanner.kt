package cl.signalmap.app.device

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.wifi.ScanResult
import android.net.wifi.WifiManager
import android.os.Build
import androidx.core.content.ContextCompat
import cl.signalmap.app.data.RawNetwork
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

private const val SCAN_TIMEOUT_MS = 15_000L
private const val UNKNOWN_SSID = "<unknown ssid>"

sealed interface ScanOutcome {
    data class Ok(val networks: List<RawNetwork>) : ScanOutcome

    /** Android rechazó la búsqueda o entregó resultados viejos (límite de 4 cada 2 minutos). */
    data object Throttled : ScanOutcome

    /** Android no avisó en 15 s. */
    data object TimedOut : ScanOutcome
}

/** Busca redes WiFi con `WifiManager.startScan()`. Requiere el permiso de ubicación ya concedido. */
class WifiScanner(context: Context) {
    private val appContext = context.applicationContext
    private val wifiManager = appContext.getSystemService(Context.WIFI_SERVICE) as WifiManager

    val isWifiEnabled: Boolean get() = wifiManager.isWifiEnabled

    @Suppress("DEPRECATION") // startScan() está obsoleto desde API 28, pero sigue siendo la vía para pedir una búsqueda.
    suspend fun scan(): ScanOutcome {
        var receiver: BroadcastReceiver? = null
        try {
            val result = withTimeoutOrNull(SCAN_TIMEOUT_MS) {
                suspendCancellableCoroutine<ScanOutcome> { cont ->
                    val r = object : BroadcastReceiver() {
                        override fun onReceive(c: Context, intent: Intent) {
                            if (!cont.isActive) return
                            val updated = intent.getBooleanExtra(WifiManager.EXTRA_RESULTS_UPDATED, false)
                            val outcome = if (!updated) {
                                ScanOutcome.Throttled
                            } else {
                                try {
                                    ScanOutcome.Ok(readResults())
                                } catch (_: SecurityException) {
                                    // Revocaron el permiso o apagaron la ubicación a mitad de la búsqueda.
                                    ScanOutcome.Throttled
                                }
                            }
                            cont.resume(outcome)
                        }
                    }
                    receiver = r
                    ContextCompat.registerReceiver(
                        appContext,
                        r,
                        IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION),
                        ContextCompat.RECEIVER_NOT_EXPORTED,
                    )
                    if (!wifiManager.startScan()) cont.resume(ScanOutcome.Throttled)
                }
            }
            return result ?: ScanOutcome.TimedOut
        } finally {
            receiver?.let { appContext.unregisterReceiver(it) }
        }
    }

    @Suppress("MissingPermission") // El permiso se revisa antes de llamar a scan().
    private fun readResults(): List<RawNetwork> =
        wifiManager.scanResults.map {
            RawNetwork(bssid = it.BSSID.orEmpty(), ssid = ssidOf(it), level = it.level, frequency = it.frequency)
        }

    @Suppress("DEPRECATION") // ScanResult.SSID: único camino antes de API 33.
    private fun ssidOf(result: ScanResult): String {
        val ssid = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            result.wifiSsid?.toString()?.removeSurrounding("\"").orEmpty()
        } else {
            result.SSID.orEmpty()
        }
        return if (ssid == UNKNOWN_SSID) "" else ssid
    }
}
