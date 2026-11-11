package cl.signalmap.app.ui

/** Textos de la app (plan de ejecución, §3). La interfaz no escribe textos sueltos. */
object Messages {
    const val EMAIL_REQUIRED = "Escribe tu email."
    const val PASSWORD_REQUIRED = "Escribe tu contraseña."
    const val SERVER_INVALID = "La dirección del servidor debe empezar con http:// o https://."
    const val LOGIN_UNAUTHORIZED = "Email o contraseña incorrectos."
    const val ROLE_CLIENT = "Esta app es para técnicos y administradores. Con una cuenta de cliente, usa la web."
    const val OFFLINE_LOGIN =
        "No se pudo conectar con el servidor. Revisa la dirección y que el teléfono esté conectado " +
            "(cable con adb reverse o la misma red WiFi)."
    const val SESSION_EXPIRED = "Tu sesión venció. Inicia sesión de nuevo."
    // No está en §3: es el mensaje de la web para un 5xx (a confirmar con el usuario).
    const val SERVER_ERROR = "El servidor tuvo un problema. Intenta de nuevo en un momento."

    const val NFC_MISSING = "Este teléfono no tiene NFC: no puede leer las tiras."
    const val NFC_OFF = "Activa NFC en los ajustes del teléfono para leer las tiras."
    const val OPEN_SETTINGS = "Abrir ajustes"
    const val WAITING_TAG = "Acerca el teléfono a una tira NFC."
    const val RESOLVING_TAG = "Buscando el punto…"
    const val TAG_NOT_REGISTERED = "Esta tira no está registrada en SignalMap."

    fun offlineTag(nfcUid: String) =
        "Tira ${nfcUid.take(8)}… · sin conexión: se identificará al enviar la medición."
}
