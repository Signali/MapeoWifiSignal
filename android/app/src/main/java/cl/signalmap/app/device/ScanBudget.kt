package cl.signalmap.app.device

private const val WINDOW_MS = 120_000L
private const val MAX_SCANS = 4

/**
 * Contador propio del límite de Android: 4 búsquedas de WiFi en 120 s. [now] entrega
 * milisegundos (se inyecta para poder probarlo). Con el borde exacto de los 120 s todavía
 * se considera dentro de la ventana, para no quedar del lado optimista.
 */
class ScanBudget(private val now: () -> Long) {
    private val scans = ArrayDeque<Long>()

    private fun prune() {
        val t = now()
        while (scans.isNotEmpty() && t - scans.first() > WINDOW_MS) scans.removeFirst()
    }

    fun canScan(): Boolean {
        prune()
        return scans.size < MAX_SCANS
    }

    /** Segundos (redondeados hacia arriba) hasta poder escanear de nuevo; 0 si ya se puede. */
    fun secondsUntilNext(): Int {
        if (canScan()) return 0
        val remainingMs = scans.first() + WINDOW_MS + 1 - now()
        return ((remainingMs + 999) / 1000).toInt()
    }

    fun record() {
        prune()
        scans.addLast(now())
    }
}
