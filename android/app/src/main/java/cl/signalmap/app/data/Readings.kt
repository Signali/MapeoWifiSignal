package cl.signalmap.app.data

private val BSSID_FORMAT = Regex("^[0-9a-f]{2}(:[0-9a-f]{2}){5}$")
private const val MAX_SSID_LENGTH = 32
private const val MIN_RSSI = -120
private const val MAX_RSSI = 0
private const val MIN_FREQUENCY = 2400
private const val MAX_FREQUENCY = 7125
private const val MAX_READINGS = 100

/** Red tal como la entrega Android (`ScanResult`), sin filtrar. */
data class RawNetwork(val bssid: String, val ssid: String, val level: Int, val frequency: Int)

/** Lectura que cumple el contrato de la API. */
data class Reading(val bssid: String, val ssid: String, val rssiDbm: Int, val frequencyMhz: Int)

/**
 * Pasa el BSSID a minúsculas y descarta lo que no cumple el contrato. Con un BSSID repetido
 * conserva el más fuerte. Devuelve de la más fuerte a la más débil, con 100 como máximo.
 */
fun toReadings(raw: List<RawNetwork>): List<Reading> =
    raw.map { it.copy(bssid = it.bssid.lowercase()) }
        .filter {
            BSSID_FORMAT.matches(it.bssid) &&
                it.ssid.length <= MAX_SSID_LENGTH &&
                it.level in MIN_RSSI..MAX_RSSI &&
                it.frequency in MIN_FREQUENCY..MAX_FREQUENCY
        }
        .groupBy { it.bssid }
        .map { (_, group) -> group.maxBy { it.level } }
        .sortedByDescending { it.level }
        .take(MAX_READINGS)
        .map { Reading(it.bssid, it.ssid, it.level, it.frequency) }
