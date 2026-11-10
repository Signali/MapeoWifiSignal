package cl.signalmap.app.device

import android.app.Activity
import android.nfc.NfcAdapter

private val UID_FORMAT = Regex("^[0-9A-F]{1,32}$")

/** UID de la tira en hexadecimal, mayúsculas y sin separadores (por ejemplo, `04A23B`). */
fun toHexUid(id: ByteArray): String = id.joinToString("") { "%02X".format(it) }

/** Formato que acepta la API para `nfc_uid`: de 1 a 32 caracteres hexadecimales en mayúsculas. */
fun isValidUid(uid: String): Boolean = UID_FORMAT.matches(uid)

/**
 * Lee tiras NFC con el modo lector (`enableReaderMode`), solo mientras la pantalla está visible:
 * llamar a [start] en `onResume` y a [stop] en `onPause`.
 */
class NfcReader(private val activity: Activity) {
    private val adapter: NfcAdapter? = NfcAdapter.getDefaultAdapter(activity)

    /** El teléfono tiene NFC. */
    val isAvailable: Boolean get() = adapter != null

    /** El teléfono tiene NFC y está encendido. */
    val isEnabled: Boolean get() = adapter?.isEnabled == true

    /** [onTag] se llama en el hilo principal con el UID de cada tira leída. */
    fun start(onTag: (String) -> Unit) {
        val nfc = adapter ?: return
        if (!nfc.isEnabled) return
        val flags = NfcAdapter.FLAG_READER_NFC_A or
            NfcAdapter.FLAG_READER_NFC_B or
            NfcAdapter.FLAG_READER_NFC_F or
            NfcAdapter.FLAG_READER_NFC_V or
            NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK
        nfc.enableReaderMode(activity, { tag ->
            // El callback llega en otro hilo.
            val uid = toHexUid(tag.id)
            if (isValidUid(uid)) activity.runOnUiThread { onTag(uid) }
        }, flags, null)
    }

    fun stop() {
        adapter?.disableReaderMode(activity)
    }
}
