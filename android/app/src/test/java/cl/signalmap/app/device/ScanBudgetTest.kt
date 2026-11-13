package cl.signalmap.app.device

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ScanBudgetTest {
    private var clock = 0L
    private val budget = ScanBudget { clock }

    @Test
    fun `permite 4 escaneos y el quinto no`() {
        repeat(4) {
            assertTrue(budget.canScan())
            budget.record()
            clock += 1_000
        }
        assertFalse(budget.canScan())
    }

    @Test
    fun `a los 120001 ms del primero se permite de nuevo`() {
        repeat(4) { budget.record() }
        clock = 120_000
        assertFalse(budget.canScan())
        clock = 120_001
        assertTrue(budget.canScan())
    }

    @Test
    fun `secondsUntilNext cuenta hacia el primero que sale de la ventana`() {
        budget.record() // t = 0
        clock = 10_000
        repeat(3) { budget.record() }
        clock = 20_000
        assertEquals(101, budget.secondsUntilNext()) // el primero sale a los 120 001 ms: faltan 100 001 ms
        clock = 119_500
        assertEquals(1, budget.secondsUntilNext())
        clock = 120_001
        assertEquals(0, budget.secondsUntilNext())
    }
}
