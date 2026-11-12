package cl.signalmap.app.data

import android.content.Context
import android.util.AtomicFile
import android.util.Log
import java.io.File
import java.io.FileNotFoundException
import java.io.IOException
import org.json.JSONArray
import org.json.JSONObject

/**
 * Cola de mediciones por enviar, en orden de toma, guardada en `pending-measurements.json` del
 * espacio privado de la app. Cada cambio se escribe completo con [AtomicFile]: si la app muere a
 * medio escribir, queda el archivo anterior. El archivo guarda también el [owner] (email de quien
 * tomó las mediciones) para que otra persona no las herede.
 *
 * Un archivo ilegible se renombra a `pending-measurements.corrupt.json` y la cola parte vacía.
 * No se prueba con JUnit puro (usa `AtomicFile`); se prueba a mano (android/README.md).
 */
class PendingQueue(context: Context) {
    private val file = File(context.filesDir, FILE_NAME)
    private val atomic = AtomicFile(file)
    private val items = mutableListOf<PendingMeasurement>()

    /** Email de quien tomó lo que hay en la cola, o `null` si está vacía. */
    @get:Synchronized
    var owner: String? = null
        private set

    /** `true` si el último intento de escribir el archivo falló: lo pendiente solo está en memoria. */
    @get:Synchronized
    var saveFailed = false
        private set

    init {
        load()
    }

    @Synchronized fun all(): List<PendingMeasurement> = items.toList()

    @Synchronized fun add(m: PendingMeasurement, owner: String) {
        items.add(m)
        this.owner = owner
        save()
    }

    @Synchronized fun remove(clientUuid: String) {
        if (items.removeAll { it.clientUuid == clientUuid }) save()
    }

    @Synchronized fun markError(clientUuid: String, message: String) {
        val i = items.indexOfFirst { it.clientUuid == clientUuid }
        if (i < 0) return
        items[i] = items[i].copy(lastError = message)
        save()
    }

    @Synchronized fun clear() {
        items.clear()
        owner = null
        save()
    }

    /** Vacía la cola si la tomó otra persona. Devuelve `true` si la vació. */
    @Synchronized fun clearIfNotOwnedBy(email: String): Boolean {
        if (items.isEmpty() || owner == email) return false
        clear()
        return true
    }

    private fun save() {
        val json = JSONObject()
            .put("owner", owner ?: JSONObject.NULL)
            .put("items", JSONArray(items.map { it.toJson() }))
        saveFailed = true
        val out = try {
            atomic.startWrite()
        } catch (e: IOException) {
            Log.w(TAG, "No se pudo abrir la cola para escribir", e)
            return
        }
        try {
            out.write(json.toString().toByteArray(Charsets.UTF_8))
            atomic.finishWrite(out)
            saveFailed = false
        } catch (e: IOException) {
            atomic.failWrite(out)
            Log.w(TAG, "No se pudo guardar la cola", e)
        }
    }

    private fun load() {
        // readFully() también recupera el respaldo (.bak) si la app murió a mitad de una escritura.
        val text = try {
            String(atomic.readFully(), Charsets.UTF_8)
        } catch (e: FileNotFoundException) {
            return // no hay cola guardada
        } catch (e: IOException) {
            return quarantine(e)
        }
        try {
            val json = JSONObject(text)
            val list = json.getJSONArray("items")
            val loaded = (0 until list.length()).map { PendingMeasurement.fromJson(list.getJSONObject(it)) }
            owner = if (json.isNull("owner")) null else json.getString("owner")
            items.addAll(loaded)
        } catch (e: Exception) { // JSON ilegible o de otra forma (p. ej. un respaldo de otra versión)
            quarantine(e)
        }
    }

    /** Aparta el archivo ilegible sin leer su contenido en el log. */
    private fun quarantine(e: Exception) {
        items.clear()
        owner = null
        val moved = file.renameTo(File(file.parentFile, CORRUPT_NAME))
        Log.w(TAG, "Cola ilegible (${e.javaClass.simpleName}); apartada=$moved; parte vacía")
    }

    private companion object {
        const val TAG = "PendingQueue"
        const val FILE_NAME = "pending-measurements.json"
        const val CORRUPT_NAME = "pending-measurements.corrupt.json"
    }
}
