package cl.signalmap.app

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import cl.signalmap.app.data.ApiClient
import cl.signalmap.app.data.ApiResult
import cl.signalmap.app.data.PointInfo
import cl.signalmap.app.data.Session
import cl.signalmap.app.data.SessionStore
import cl.signalmap.app.data.TagCache
import cl.signalmap.app.data.normalizeBaseUrl
import cl.signalmap.app.device.isValidUid
import cl.signalmap.app.ui.Messages
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

enum class Screen { Login, Measure }

enum class Phase(val apiValue: String, val label: String) {
    Antes("antes", "Antes"),
    Despues("despues", "Después"),
}

sealed interface TagState {
    data object Idle : TagState
    data object Resolving : TagState
    data class Found(val pointId: Int, val label: String) : TagState
    data object NotRegistered : TagState
    /** Sin conexión: [label] viene de la caché si la tira ya se resolvió antes. */
    data class OfflineTag(val nfcUid: String, val label: String?) : TagState
    /** Otro error de la API; [message] ya está en lenguaje de usuario. */
    data class Failed(val message: String) : TagState
}

class AppViewModel(application: Application) : AndroidViewModel(application) {
    private val store = SessionStore(application)
    private val tagCache = TagCache(application)
    private var session: Session? = store.current()
    private val api = ApiClient(baseUrl = { store.baseUrl }, token = { session?.token })
    private var tagJob: Job? = null

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

    val savedBaseUrl: String get() = store.baseUrl

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
        store.baseUrl = server
        loggingIn = true
        viewModelScope.launch {
            when (val result = api.login(emailValue, password)) {
                is ApiResult.Ok -> if (result.value.role == "cliente") {
                    loginMessage = Messages.ROLE_CLIENT
                } else {
                    store.save(result.value)
                    session = store.current()
                    email = result.value.email
                    tag = TagState.Idle
                    screen = Screen.Measure
                }
                is ApiResult.Error -> loginMessage = when {
                    result.status == 401 -> Messages.LOGIN_UNAUTHORIZED
                    result.status >= 500 || result.message.isEmpty() -> Messages.SERVER_ERROR
                    else -> result.message
                }
                ApiResult.Offline -> loginMessage = Messages.OFFLINE_LOGIN
            }
            loggingIn = false
        }
    }

    fun logout() = endSession(message = null)

    fun selectPhase(value: Phase) {
        phase = value
    }

    /** Se llama con el UID (ya validado por el lector) de cada tira acercada. */
    fun onTag(uid: String) {
        if (screen != Screen.Measure || !isValidUid(uid)) return
        tagJob?.cancel()
        tag = TagState.Resolving
        tagJob = viewModelScope.launch {
            when (val result = api.pointByTag(uid)) {
                is ApiResult.Ok -> {
                    val point: PointInfo = result.value
                    tagCache.put(uid, point)
                    tag = TagState.Found(point.id, point.label)
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

    private fun endSession(message: String?) {
        tagJob?.cancel()
        store.clear()
        session = null
        tag = TagState.Idle
        loginMessage = message
        screen = Screen.Login
    }
}
