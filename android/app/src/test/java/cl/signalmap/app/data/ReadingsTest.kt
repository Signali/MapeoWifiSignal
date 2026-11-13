package cl.signalmap.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ReadingsTest {
    private fun net(bssid: String = "aa:bb:cc:dd:ee:01", ssid: String = "Red", level: Int = -60, frequency: Int = 2437) =
        RawNetwork(bssid, ssid, level, frequency)

    @Test
    fun `BSSID en mayusculas pasa a minusculas`() {
        val result = toReadings(listOf(net(bssid = "AA:BB:CC:DD:EE:01")))
        assertEquals("aa:bb:cc:dd:ee:01", result.single().bssid)
    }

    @Test
    fun `descarta BSSID mal formado y SSID de mas de 32 caracteres`() {
        assertTrue(toReadings(listOf(net(bssid = "aabbccddee01"))).isEmpty())
        assertTrue(toReadings(listOf(net(bssid = ""))).isEmpty())
        assertTrue(toReadings(listOf(net(ssid = "a".repeat(33)))).isEmpty())
        assertEquals(1, toReadings(listOf(net(ssid = "a".repeat(32)))).size)
    }

    @Test
    fun `descarta RSSI fuera de -120 a 0`() {
        assertTrue(toReadings(listOf(net(level = -121))).isEmpty())
        assertTrue(toReadings(listOf(net(level = 1))).isEmpty())
        assertEquals(2, toReadings(listOf(net("aa:bb:cc:dd:ee:01", level = -120), net("aa:bb:cc:dd:ee:02", level = 0))).size)
    }

    @Test
    fun `descarta frecuencia fuera de 2400 a 7125`() {
        assertTrue(toReadings(listOf(net(frequency = 2399))).isEmpty())
        assertTrue(toReadings(listOf(net(frequency = 60_000))).isEmpty())
        assertEquals(2, toReadings(listOf(net("aa:bb:cc:dd:ee:01", frequency = 2400), net("aa:bb:cc:dd:ee:02", frequency = 7125))).size)
    }

    @Test
    fun `BSSID repetido conserva el mas fuerte, aunque difiera en mayusculas`() {
        val result = toReadings(
            listOf(
                net(bssid = "AA:BB:CC:DD:EE:01", level = -80),
                net(bssid = "aa:bb:cc:dd:ee:01", level = -50),
                net(bssid = "aa:bb:cc:dd:ee:01", level = -70),
            ),
        )
        assertEquals(1, result.size)
        assertEquals(-50, result.single().rssiDbm)
    }

    @Test
    fun `150 redes dejan 100, las mas fuertes, de mayor a menor`() {
        val raw = (1..150).map { net(bssid = "aa:bb:cc:dd:ee:%02x".format(it), level = -it) }
        val result = toReadings(raw)
        assertEquals(100, result.size)
        assertEquals((1..100).map { -it }, result.map { it.rssiDbm })
    }
}
