package cl.signalmap.app.data

/**
 * Cola de mediciones por enviar, en orden de toma. En esta tarea vive en memoria; T15 la pasa a
 * un archivo sin cambiar esta API.
 */
class PendingQueue {
    private val items = mutableListOf<PendingMeasurement>()

    @Synchronized fun all(): List<PendingMeasurement> = items.toList()

    @Synchronized fun add(m: PendingMeasurement) {
        items.add(m)
    }

    @Synchronized fun remove(clientUuid: String) {
        items.removeAll { it.clientUuid == clientUuid }
    }

    @Synchronized fun markError(clientUuid: String, message: String) {
        val i = items.indexOfFirst { it.clientUuid == clientUuid }
        if (i >= 0) items[i] = items[i].copy(lastError = message)
    }

    @Synchronized fun clear() {
        items.clear()
    }
}
