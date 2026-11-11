package cl.signalmap.app.data

import android.content.Context

data class Session(val token: String, val email: String, val role: String)

/** Sesión y dirección del servidor, en preferencias privadas de la app. */
class SessionStore(context: Context, private val now: () -> Long = System::currentTimeMillis) {
    private val prefs = context.getSharedPreferences("session", Context.MODE_PRIVATE)

    var baseUrl: String
        get() = prefs.getString("baseUrl", DEFAULT_BASE_URL) ?: DEFAULT_BASE_URL
        set(value) = prefs.edit().putString("baseUrl", value).apply()

    /** La sesión guardada, o `null` si no hay o ya venció. */
    fun current(): Session? {
        val token = prefs.getString("token", null) ?: return null
        if (now() >= prefs.getLong("expiresAt", 0L)) return null
        return Session(token, prefs.getString("email", "").orEmpty(), prefs.getString("role", "").orEmpty())
    }

    fun save(login: LoginData) {
        prefs.edit()
            .putString("token", login.token)
            .putLong("expiresAt", now() + login.expiresInSeconds * 1000)
            .putString("email", login.email)
            .putString("role", login.role)
            .apply()
    }

    /** Borra la sesión y conserva la dirección del servidor. */
    fun clear() {
        prefs.edit().remove("token").remove("expiresAt").remove("email").remove("role").apply()
    }

    companion object {
        const val DEFAULT_BASE_URL = "http://127.0.0.1:3000"
    }
}
