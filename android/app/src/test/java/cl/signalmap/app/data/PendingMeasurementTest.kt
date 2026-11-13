package cl.signalmap.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PendingMeasurementTest {
    private fun measurement(lastError: String? = null, pointId: Int? = 7) = PendingMeasurement(
        clientUuid = "3f2b8c1e-9d4a-4e7b-a1c2-5d6e7f809a1b",
        nfcUid = "04C7DC7FBF2A81",
        pointId = pointId,
        pointLabel = pointId?.let { "P-07 · Piso 3 · Torre Norte" },
        phase = "antes",
        measuredAt = "2026-11-12T12:04:05-03:00",
        readings = listOf(
            Reading("a4:2b:b0:11:22:33", "Inmobiliaria Norte", -74, 5180),
            Reading("a4:2b:b0:11:22:34", "", -79, 2437),
        ),
        lastError = lastError,
    )

    @Test
    fun `requestBody tiene exactamente las claves del contrato`() {
        val body = measurement().requestBody(7)
        assertEquals(setOf("point_id", "phase", "client_uuid", "measured_at", "readings"), body.keys().asSequence().toSet())
        assertEquals(7, body.getInt("point_id"))
        assertEquals("antes", body.getString("phase"))
        assertEquals("2026-11-12T12:04:05-03:00", body.getString("measured_at"))
        val readings = body.getJSONArray("readings")
        assertEquals(2, readings.length())
        assertEquals(
            setOf("bssid", "ssid", "rssi_dbm", "frequency_mhz"),
            readings.getJSONObject(0).keys().asSequence().toSet(),
        )
        assertEquals(-74, readings.getJSONObject(0).getInt("rssi_dbm"))
    }

    @Test
    fun `toJson y fromJson van y vuelven sin error`() {
        val original = measurement()
        assertEquals(original, PendingMeasurement.fromJson(original.toJson()))
    }

    @Test
    fun `toJson y fromJson conservan el texto del error y la tira sin resolver`() {
        val withError = measurement(lastError = "Esta tira no está registrada en SignalMap.")
        assertEquals(withError, PendingMeasurement.fromJson(withError.toJson()))

        val unresolved = measurement(pointId = null)
        val back = PendingMeasurement.fromJson(unresolved.toJson())
        assertNull(back.pointId)
        assertNull(back.pointLabel)
        assertNull(back.lastError)
        assertEquals(unresolved, back)
    }

    @Test
    fun `la fecha lleva zona horaria y el uuid tiene forma de UUID`() {
        assertTrue(Regex("""^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$""").matches(PendingMeasurement.nowIso()))
        assertTrue(Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$").matches(PendingMeasurement.newUuid()))
    }
}
