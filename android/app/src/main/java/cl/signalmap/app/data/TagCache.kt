package cl.signalmap.app.data

import android.content.Context

data class CachedTag(val pointId: Int, val label: String)

/** Tiras ya resueltas (`nfc_uid` → punto), para identificarlas sin conexión. */
class TagCache(context: Context) {
    private val prefs = context.getSharedPreferences("tags", Context.MODE_PRIVATE)

    fun put(nfcUid: String, point: PointInfo) {
        prefs.edit().putString(nfcUid, "${point.id}\t${point.label}").apply()
    }

    fun get(nfcUid: String): CachedTag? {
        val parts = prefs.getString(nfcUid, null)?.split('\t', limit = 2) ?: return null
        val id = parts.getOrNull(0)?.toIntOrNull() ?: return null
        return CachedTag(id, parts.getOrNull(1).orEmpty())
    }

    /** Al cerrar sesión: los rótulos son de puntos que el usuario siguiente podría no poder ver. */
    fun clear() {
        prefs.edit().clear().apply()
    }
}
