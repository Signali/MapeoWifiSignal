package cl.signalmap.app.data

import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject

/**
 * Medición tomada y todavía no confirmada por la API. Guarda el `nfc_uid` porque la tira puede
 * resolverse al enviar ([pointId] nulo, sin conexión al leerla). [lastError] es el mensaje de la
 * API cuando rechazó la medición y no tiene sentido reintentarla sola.
 */
data class PendingMeasurement(
    val clientUuid: String,
    val nfcUid: String,
    val pointId: Int?,
    val pointLabel: String?,
    val phase: String,
    val measuredAt: String,
    val readings: List<Reading>,
    val lastError: String? = null,
) {
    private fun readingsJson() = JSONArray(
        readings.map {
            JSONObject()
                .put("bssid", it.bssid)
                .put("ssid", it.ssid)
                .put("rssi_dbm", it.rssiDbm)
                .put("frequency_mhz", it.frequencyMhz)
        },
    )

    /** Cuerpo de `POST /measurements` (contrato, ruta 15). */
    fun requestBody(pointId: Int): JSONObject = JSONObject()
        .put("point_id", pointId)
        .put("phase", phase)
        .put("client_uuid", clientUuid)
        .put("measured_at", measuredAt)
        .put("readings", readingsJson())

    /** Forma para guardarla en el teléfono (T15). */
    fun toJson(): JSONObject = JSONObject()
        .put("client_uuid", clientUuid)
        .put("nfc_uid", nfcUid)
        .put("point_id", pointId ?: JSONObject.NULL)
        .put("point_label", pointLabel ?: JSONObject.NULL)
        .put("phase", phase)
        .put("measured_at", measuredAt)
        .put("last_error", lastError ?: JSONObject.NULL)
        .put("readings", readingsJson())

    companion object {
        fun fromJson(json: JSONObject): PendingMeasurement {
            val list = json.getJSONArray("readings")
            return PendingMeasurement(
                clientUuid = json.getString("client_uuid"),
                nfcUid = json.getString("nfc_uid"),
                pointId = if (json.isNull("point_id")) null else json.getInt("point_id"),
                pointLabel = if (json.isNull("point_label")) null else json.getString("point_label"),
                phase = json.getString("phase"),
                measuredAt = json.getString("measured_at"),
                readings = (0 until list.length()).map {
                    val r = list.getJSONObject(it)
                    Reading(r.getString("bssid"), r.getString("ssid"), r.getInt("rssi_dbm"), r.getInt("frequency_mhz"))
                },
                lastError = if (json.isNull("last_error")) null else json.getString("last_error"),
            )
        }

        /** Momento actual con zona horaria, a segundos, y siempre con los segundos (`toString()` los omite si valen 0) (p. ej. `2026-11-12T12:04:05-03:00`). */
        fun nowIso(): String = OffsetDateTime.now().truncatedTo(ChronoUnit.SECONDS).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)

        fun newUuid(): String = UUID.randomUUID().toString()
    }
}
