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

    const val SEND_SERVER_ERROR = "El servidor tuvo un problema. La medición sigue guardada en el teléfono y se reintentará."
    const val SEND_REJECTED = "El servidor no aceptó la medición."
    const val SAVED_OFFLINE =
        "Sin conexión: la medición quedó guardada en el teléfono y se enviará sola cuando vuelva la conexión."

    const val NFC_MISSING = "Este teléfono no tiene NFC: no puede leer las tiras."
    const val NFC_OFF = "Activa NFC en los ajustes del teléfono para leer las tiras."
    const val OPEN_SETTINGS = "Abrir ajustes"
    const val WAITING_TAG = "Acerca el teléfono a una tira NFC."
    const val RESOLVING_TAG = "Buscando el punto…"
    const val TAG_NOT_REGISTERED = "Esta tira no está registrada en SignalMap."

    const val PERMISSION_INTRO =
        "Para buscar redes WiFi, Android exige el permiso de ubicación. " +
            "SignalMap no guarda tu ubicación: solo las redes que capta."
    const val GRANT_PERMISSION = "Dar permiso"
    const val PERMISSION_DENIED =
        "Sin el permiso de ubicación no se pueden buscar redes WiFi. " +
            "Actívalo en Ajustes > Apps > SignalMap > Permisos."
    const val COARSE_ONLY = "Elige «Ubicación precisa»: con la aproximada, Android no entrega las redes WiFi."
    const val LOCATION_OFF = "Activa la ubicación del teléfono: Android la exige para buscar redes WiFi."
    const val WIFI_OFF = "Activa el WiFi del teléfono para medir."
    const val SCAN_REJECTED =
        "Android rechazó la búsqueda de redes (límite de 4 cada 2 minutos). Espera un momento y vuelve a intentar."
    const val SCAN_TIMEOUT = "La búsqueda de redes no terminó. Intenta de nuevo."
    const val NO_NETWORKS = "No se encontró ninguna red WiFi. Intenta de nuevo en otro lugar del punto."
    const val SCANNING = "Buscando redes WiFi…"
    const val SENDING = "Enviando la medición…"
    const val MEASURE = "Medir WiFi"
    const val MEASURE_AGAIN = "Medir de nuevo"
    const val SEND_NOW = "Enviar ahora"
    const val DISCARD = "Descartar"

    fun scanBlocked(seconds: Int) =
        "Android permite 4 búsquedas de WiFi cada 2 minutos. Podrás medir de nuevo en $seconds s."

    fun saved(point: String?, phaseLabel: String) = "Medición guardada · ${point ?: "tira sin identificar"} · $phaseLabel"

    fun savedReadings(saved: Int, discarded: Int) =
        "Se guardaron $saved lecturas de la red de la organización; se descartaron $discarded de otras redes."

    fun pending(n: Int) = "Pendientes: $n"

    fun tagName(nfcUid: String) = "Tira ${nfcUid.take(8)}…"

    fun offlineTag(nfcUid: String) = "${tagName(nfcUid)} · sin conexión: se identificará al enviar la medición."
}
