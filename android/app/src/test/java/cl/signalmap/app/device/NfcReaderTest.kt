package cl.signalmap.app.device

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NfcReaderTest {
    @Test
    fun `toHexUid da mayusculas sin separadores`() {
        assertEquals("04A23B", toHexUid(byteArrayOf(0x04, 0xA2.toByte(), 0x3B)))
    }

    @Test
    fun `toHexUid conserva el cero adelante`() {
        assertEquals("0F", toHexUid(byteArrayOf(0x0F)))
    }

    @Test
    fun `isValidUid acepta hexadecimal en mayusculas de 1 a 32`() {
        assertTrue(isValidUid("04A23B1C"))
        assertTrue(isValidUid("A"))
        assertTrue(isValidUid("A".repeat(32)))
    }

    @Test
    fun `isValidUid rechaza vacio, separadores, minusculas y mas de 32`() {
        assertFalse(isValidUid(""))
        assertFalse(isValidUid("04:A2"))
        assertFalse(isValidUid("04a2"))
        assertFalse(isValidUid("A".repeat(33)))
    }
}
