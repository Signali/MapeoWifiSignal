package cl.signalmap.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ApiClientTest {
    @Test
    fun normalizeBaseUrl_recortaEspaciosYBarraFinal() {
        assertEquals("http://127.0.0.1:3000", normalizeBaseUrl(" http://127.0.0.1:3000/ "))
    }

    @Test
    fun normalizeBaseUrl_sinEsquemaDevuelveNull() {
        assertNull(normalizeBaseUrl("127.0.0.1:3000"))
    }
}
