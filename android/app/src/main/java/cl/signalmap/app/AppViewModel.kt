package cl.signalmap.app

import android.Manifest
import android.app.Application
import android.content.Context
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.Network
import android.location.LocationManager
import android.os.SystemClock
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import cl.signalmap.app.data.ApiClient
import cl.signalmap.app.data.ApiResult
import cl.signalmap.app.data.PendingMeasurement
import cl.signalmap.app.data.PendingQueue
import cl.signalmap.app.data.PointInfo
import cl.signalmap.app.data.Session
import cl.signalmap.app.data.SessionStore
import cl.signalmap.app.data.TagCache
import cl.signalmap.app.data.normalizeBaseUrl
import cl.signalmap.app.data.toReadings
import cl.signalmap.app.device.ScanBudget
import cl.signalmap.app.device.ScanOutcome
import cl.signalmap.app.device.WifiScanner
import cl.signalmap.app.device.isValidUid
import cl.signalmap.app.ui.Messages
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

enum class Screen { Login, Measure }

enum class Phase(val apiValue: String, val label: String) {
    Antes("antes", "Antes"),
    Despues("despues", "Después"),
}

sealed interface TagState {
    data object Idle : TagState
    data object Resolving : TagState
    data class Found(val pointId: Int, val label: String, val nfcUid: String) : TagState
    data object NotRegistered : TagState
    /** Sin conexión: [label] viene de la caché si la tira ya se resolvió antes. */
    data class OfflineTag(val nfcUid: String, val label: String?) : TagState
    /** Otro error de la API; [message] ya está en lenguaje de usuario. */
    data class Failed(val message: String) : TagState
}

/** Ajuste del teléfono al que lleva el botón «Abrir ajustes» de un bloqueo. */
enum class SettingsTarget { App, Location, Wifi }

sealed interface MeasureState {
    data object Idle : MeasureState
    /** No se puede medir; [settings] es el ajuste que lo arregla, si hay uno. */
    data class Blocked(val message: String, val settings: SettingsTarget?) : MeasureState
    /** Contador propio lleno: faltan [seconds] para poder buscar redes de nuevo. */
    data class Cooldown(val seconds: Int) : MeasureState
    data object Scanning : MeasureState
    data object Sending : MeasureState
    /** La API guardó la medición; [category] la calculó ella. */
    data class Done(
        val point: String?,
        val phaseLabel: String,
        val category: String,
        val bestRssiDbm: Int?,
        val saved: Int,
        val discarded: Int,
    ) : MeasureState
    /** Aviso sin resultado (guardada sin conexión, error del servidor). */
    data class Notice(val message: String) : MeasureState
}

class AppViewModel(application: Application) : AndroidViewModel(application) {
    private val store = SessionStore(application)
    private val tagCache = TagCache(application)
    private var session: Session? = store.current()
    private val api = ApiClient(baseUrl = { store.baseUrl }, token = { session?.token })
    private val scanner = WifiScanner(application)
    private val scanBudget = ScanBudget { SystemClock.elapsedRealtime() }
    private val queue = PendingQueue(application)
    private val flushLock = Mutex()
    private var tagJob: Job? = null
    private var currentUuid: String? = null
    private val connectivity = application.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    /** Vuelve la red: se envía lo pendiente (con la app abierta; sin segundo plano). */
    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) = flush()
    }

    var screen by mutableStateOf(if (session != null) Screen.Measure else Screen.Login)
        private set
    var email by mutableStateOf(session?.email.orEmpty())
        private set
    var loginMessage by mutableStateOf<String?>(null)
        private set
    var loggingIn by mutableStateOf(false)
        private set
    var phase by mutableStateOf(Phase.Antes)
        private set
    var tag by mutableStateOf<TagState>(TagState.Idle)
        private set
    var measureState by mutableStateOf<MeasureState>(MeasureState.Idle)
        private set
    var pending by mutableStateOf(queue.all())
        private set
    /** Se muestra el diálogo «Cerrar sesión con pendientes». */
    var confirmingLogout by mutableStateOf(false)
        private set

    val savedBaseUrl: String get() = store.baseUrl

    init {
        // Lo que dejó otra persona (p. ej. un respaldo restaurado) no se hereda.
        session?.let { if (queue.clearIfNotOwnedBy(it.email)) refreshPending() }
        connectivity.registerDefaultNetworkCallback(networkCallback)
        flush() // la app se abrió con sesión válida
    }

    override fun onCleared() {
        connectivity.unregisterNetworkCallback(networkCallback)
    }

    fun login(emailText: String, password: String, serverText: String) {
        val emailValue = emailText.trim()
        val server = normalizeBaseUrl(serverText)
        loginMessage = when {
            emailValue.isEmpty() -> Messages.EMAIL_REQUIRED
            password.isEmpty() -> Messages.PASSWORD_REQUIRED
            server == null -> Messages.SERVER_INVALID
            else -> null
        }
        if (loginMessage != null || server == null) return
        // El cliente HTTP lee la dirección guardada, así que se prueba guardándola; si el login no
        // resulta, se vuelve a la anterior (una dirección equivocada no debe quedar como la del servidor).
        val previousServer = store.baseUrl
        store.baseUrl = server
        loggingIn = true
        viewModelScope.launch {
            var loggedIn = false
            when (val result = api.login(emailValue, password)) {
                is ApiResult.Ok -> if (result.value.role == "cliente") {
                    loginMessage = Messages.ROLE_CLIENT
                } else {
                    loggedIn = true
                    store.save(result.value)
                    session = store.current()
                    email = result.value.email
                    tag = TagState.Idle
                    if (queue.clearIfNotOwnedBy(result.value.email)) refreshPending()
                    // Los ids de punto son de cada servidor: lo pendiente de otro se resuelve de nuevo por su tira.
                    if (server != previousServer) queue.forgetPointIds()
                    screen = Screen.Measure
                    flush()
                }
                is ApiResult.Error -> loginMessage = when {
                    result.status == 401 -> Messages.LOGIN_UNAUTHORIZED
                    result.status >= 500 || result.message.isEmpty() -> Messages.SERVER_ERROR
                    else -> result.message
                }
                ApiResult.Offline -> loginMessage = Messages.OFFLINE_LOGIN
            }
            if (!loggedIn) store.baseUrl = previousServer
            loggingIn = false
        }
    }

    /** «Cerrar sesión»: con mediciones pendientes pregunta antes, porque se borran del teléfono. */
    fun logout() {
        if (queue.all().isEmpty()) endSession(message = null) else confirmingLogout = true
    }

    fun cancelLogout() {
        confirmingLogout = false
    }

    fun confirmLogout() {
        queue.clear()
        endSession(message = null)
    }

    fun selectPhase(value: Phase) {
        phase = value
    }

    /** Se llama con el UID (ya validado por el lector) de cada tira acercada. */
    fun onTag(uid: String) {
        if (screen != Screen.Measure || !isValidUid(uid)) return
        if (measureState is MeasureState.Scanning || measureState is MeasureState.Sending) return
        measureState = MeasureState.Idle
        tagJob?.cancel()
        tag = TagState.Resolving
        tagJob = viewModelScope.launch {
            when (val result = api.pointByTag(uid)) {
                is ApiResult.Ok -> {
                    val point: PointInfo = result.value
                    tagCache.put(uid, point)
                    tag = TagState.Found(point.id, point.label, uid)
                }
                is ApiResult.Error -> when {
                    result.status == 401 -> endSession(Messages.SESSION_EXPIRED)
                    result.status == 404 -> tag = TagState.NotRegistered
                    result.status >= 500 || result.message.isEmpty() -> tag = TagState.Failed(Messages.SERVER_ERROR)
                    else -> tag = TagState.Failed(result.message)
                }
                ApiResult.Offline -> tag = TagState.OfflineTag(uid, tagCache.get(uid)?.label)
            }
        }
    }

    /** Pasos de «Medir WiFi»: permiso, ubicación, WiFi, contador, búsqueda y envío. */
    fun measure() {
        val (nfcUid, pointId, label) = when (val source = tag) {
            is TagState.Found -> Triple(source.nfcUid, source.pointId, source.label)
            is TagState.OfflineTag -> Triple(source.nfcUid, null, source.label)
            else -> return
        }
        if (measureState is MeasureState.Scanning || measureState is MeasureState.Sending) return
        val app = getApplication<Application>()
        val fine = ContextCompat.checkSelfPermission(app, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(app, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        val locationManager = app.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        measureState = when {
            !fine && coarse -> MeasureState.Blocked(Messages.COARSE_ONLY, SettingsTarget.App)
            !fine -> MeasureState.Blocked(Messages.PERMISSION_DENIED, SettingsTarget.App)
            !LocationManagerCompat.isLocationEnabled(locationManager) ->
                MeasureState.Blocked(Messages.LOCATION_OFF, SettingsTarget.Location)
            !scanner.isWifiEnabled -> MeasureState.Blocked(Messages.WIFI_OFF, SettingsTarget.Wifi)
            !scanBudget.canScan() -> MeasureState.Cooldown(scanBudget.secondsUntilNext())
            else -> MeasureState.Scanning
        }
        if (measureState !is MeasureState.Scanning) return
        val measuredPhase = phase
        viewModelScope.launch {
            val outcome = scanner.scan()
            // startScan() aceptado: Android lo cuenta aunque no responda.
            if (outcome !is ScanOutcome.Throttled) scanBudget.record()
            // Si cerraron sesión durante la búsqueda, la medición no se encola ni se envía.
            if (screen != Screen.Measure) return@launch
            when (outcome) {
                is ScanOutcome.Ok -> {
                    val readings = toReadings(outcome.networks)
                    if (readings.isEmpty()) {
                        measureState = MeasureState.Blocked(Messages.NO_NETWORKS, null)
                    } else {
                        val m = PendingMeasurement(
                            clientUuid = PendingMeasurement.newUuid(),
                            nfcUid = nfcUid,
                            pointId = pointId,
                            pointLabel = label,
                            phase = measuredPhase.apiValue,
                            measuredAt = PendingMeasurement.nowIso(),
                            readings = readings,
                        )
                        queue.add(m, email)
                        refreshPending()
                        currentUuid = m.clientUuid
                        measureState = MeasureState.Sending
                        flush()
                    }
                }
                ScanOutcome.TimedOut -> measureState = MeasureState.Blocked(Messages.SCAN_TIMEOUT, null)
                ScanOutcome.Throttled -> measureState = MeasureState.Blocked(Messages.SCAN_REJECTED, null)
            }
        }
    }

    /** Se llama cada segundo mientras hay cuenta regresiva. */
    fun tickCooldown() {
        if (measureState !is MeasureState.Cooldown) return
        val seconds = scanBudget.secondsUntilNext()
        measureState = if (seconds > 0) MeasureState.Cooldown(seconds) else MeasureState.Idle
    }

    /** «Medir de nuevo»: vuelve a esperar una tira. */
    fun measureAgain() {
        currentUuid = null
        measureState = MeasureState.Idle
        tag = TagState.Idle
    }

    fun discard(clientUuid: String) {
        queue.remove(clientUuid)
        refreshPending()
    }

    /** Envía lo pendiente en orden. Se detiene ante la primera falta de conexión o error del servidor. */
    fun flush() {
        // La comprobación va dentro del launch (hilo principal): onAvailable llega desde otro hilo.
        viewModelScope.launch {
            if (session != null && queue.all().isNotEmpty()) flushNow(notify = false)
        }
    }

    /** Botón «Enviar ahora»: igual que [flush], pero avisa si no pudo enviar. */
    fun sendNow() {
        viewModelScope.launch { flushNow(notify = true) }
    }

    private suspend fun flushNow(notify: Boolean) = flushLock.withLock {
        for (m in queue.all()) {
            if (m.lastError != null) continue // la API la rechazó: solo queda «Descartar»
            val pointId = m.pointId ?: when (val r = api.pointByTag(m.nfcUid)) {
                is ApiResult.Ok -> {
                    tagCache.put(m.nfcUid, r.value)
                    r.value.id
                }
                is ApiResult.Error -> when {
                    r.status == 401 -> return@withLock endSession(Messages.SESSION_EXPIRED)
                    r.status == 404 -> {
                        queue.markError(m.clientUuid, Messages.TAG_NOT_REGISTERED)
                        continue
                    }
                    r.status >= 500 -> return@withLock stopFlush(Messages.SEND_SERVER_ERROR, notify)
                    else -> {
                        queue.markError(m.clientUuid, r.message.ifEmpty { Messages.SEND_REJECTED })
                        continue
                    }
                }
                ApiResult.Offline -> return@withLock stopFlush(Messages.SAVED_OFFLINE, notify)
            }
            // «Descartar» pudo llegar mientras se resolvía la tira: lo descartado no se envía.
            if (queue.all().none { it.clientUuid == m.clientUuid }) continue
            when (val r = api.sendMeasurement(m.requestBody(pointId))) {
                is ApiResult.Ok -> {
                    queue.remove(m.clientUuid)
                    if (m.clientUuid == currentUuid) {
                        measureState = MeasureState.Done(
                            point = m.pointLabel,
                            phaseLabel = Phase.entries.first { it.apiValue == m.phase }.label,
                            category = r.value.category,
                            bestRssiDbm = r.value.bestRssiDbm,
                            saved = r.value.savedReadings,
                            discarded = m.readings.size - r.value.savedReadings,
                        )
                    }
                }
                is ApiResult.Error -> when {
                    r.status == 401 -> return@withLock endSession(Messages.SESSION_EXPIRED) // conserva la cola
                    r.status >= 500 -> return@withLock stopFlush(Messages.SEND_SERVER_ERROR, notify)
                    else -> queue.markError(m.clientUuid, r.message.ifEmpty { Messages.SEND_REJECTED })
                }
                ApiResult.Offline -> return@withLock stopFlush(Messages.SAVED_OFFLINE, notify)
            }
        }
        refreshPending()
        // Si la medición en pantalla fue rechazada, el aviso es el mensaje de la API.
        val rejected = queue.all().firstOrNull { it.clientUuid == currentUuid }?.lastError
        if (rejected != null && measureState is MeasureState.Sending) measureState = MeasureState.Notice(rejected)
    }

    /** El aviso sale si hay una medición recién tomada esperando, o si el técnico pidió el envío. */
    private fun stopFlush(message: String, notify: Boolean) {
        refreshPending()
        val state = measureState
        val quiet = state is MeasureState.Idle || state is MeasureState.Notice
        // Si el archivo no se pudo escribir, «guardada en el teléfono» no sería cierto.
        val text = if (queue.saveFailed) Messages.NOT_SAVED else message
        if (state is MeasureState.Sending || (notify && quiet)) measureState = MeasureState.Notice(text)
    }

    private fun refreshPending() {
        pending = queue.all()
    }

    private fun endSession(message: String?) {
        tagJob?.cancel()
        store.clear()
        session = null
        tag = TagState.Idle
        currentUuid = null
        measureState = MeasureState.Idle
        refreshPending()
        loginMessage = message
        confirmingLogout = false
        screen = Screen.Login
    }
}
