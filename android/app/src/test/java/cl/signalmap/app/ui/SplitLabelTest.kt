package cl.signalmap.app.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SplitLabelTest {
    @Test
    fun separaCodigoYLugar() {
        val (code, place) = splitLabel("P-07 · Piso 3 · Torre Norte")
        assertEquals("P-07", code)
        assertEquals("Piso 3, Torre Norte", place)
    }

    @Test
    fun conUnSoloLugar() {
        val (code, place) = splitLabel("P-07 · Piso 3")
        assertEquals("P-07", code)
        assertEquals("Piso 3", place)
    }

    @Test
    fun sinSeparadorLaTomaEnteraComoCodigo() {
        val (code, place) = splitLabel("P-07")
        assertEquals("P-07", code)
        assertNull(place)
    }

    @Test
    fun ignoraPartesVaciasYEspacios() {
        val (code, place) = splitLabel("  P-07  ·  · Piso 3 ")
        assertEquals("P-07", code)
        assertEquals("Piso 3", place)
    }
}
