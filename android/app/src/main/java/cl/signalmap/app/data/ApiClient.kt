package cl.signalmap.app.data

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONException
import org.json.JSONObject

sealed interface ApiResult<out T> {
    data class Ok<T>(val value: T, val status: Int) : ApiResult<T>
    data class Error(val status: Int, val message: String) : ApiResult<Nothing>
    data object Offline : ApiResult<Nothing>
}

data class LoginData(val token: String, val expiresInSeconds: Long, val email: String, val role: String)

data class PointInfo(val id: Int, val code: String, val floorName: String, val buildingName: String) {
    /** Texto para mostrar: «P-07 · Piso 3 · Torre Norte». */
    val label: String get() = "$code · $floorName · $buildingName"
}

/** Respuesta de `POST /measurements`: lo que la API calculó y guardó. */
data class MeasurementResult(val category: String, val bestRssiDbm: Int?, val savedReadings: Int)

/** Dirección del servidor sin espacios ni «/» final, o `null` si no empieza con http:// o https://. */
fun normalizeBaseUrl(text: String): String? {
    val url = text.trim().trimEnd('/')
    return if (url.startsWith("http://") || url.startsWith("https://")) url else null
}

/** Cliente de la API con `HttpURLConnection`. Es el único lugar de la app que abre conexiones. */
class ApiClient(private val baseUrl: () -> String, private val token: () -> String?) {

    suspend fun login(email: String, password: String): ApiResult<LoginData> {
        val body = JSONObject().put("email", email).put("password", password)
        return call("POST", "/api/v1/auth/login", body, withToken = false) { json ->
            val user = json.getJSONObject("user")
            LoginData(
                token = json.getString("token"),
                expiresInSeconds = json.getLong("expires_in"),
                email = user.getString("email"),
                role = user.getString("role"),
            )
        }
    }

    suspend fun pointByTag(nfcUid: String): ApiResult<PointInfo> =
        call("GET", "/api/v1/points/by-tag/$nfcUid", null, withToken = true) { json ->
            PointInfo(
                id = json.getInt("id"),
                code = json.getString("code"),
                floorName = json.getJSONObject("floor").getString("name"),
                buildingName = json.getJSONObject("building").getString("name"),
            )
        }

    /** `201` (creada) y `200` (ya estaba guardada, reenvío) son éxito. */
    suspend fun sendMeasurement(body: JSONObject): ApiResult<MeasurementResult> =
        call("POST", "/api/v1/measurements", body, withToken = true) { json ->
            MeasurementResult(
                category = json.getString("category"),
                bestRssiDbm = if (json.isNull("best_rssi_dbm")) null else json.getInt("best_rssi_dbm"),
                savedReadings = json.getJSONArray("readings").length(),
            )
        }

    private suspend fun <T> call(
        method: String,
        path: String,
        body: JSONObject?,
        withToken: Boolean,
        parse: (JSONObject) -> T,
    ): ApiResult<T> = withContext(Dispatchers.IO) {
        var connection: HttpURLConnection? = null
        try {
            connection = (URL(baseUrl() + path).openConnection() as HttpURLConnection).apply {
                requestMethod = method
                connectTimeout = 5_000
                readTimeout = 10_000
                setRequestProperty("Accept", "application/json")
                if (withToken) token()?.let { setRequestProperty("Authorization", "Bearer $it") }
                if (body != null) {
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
                }
            }
            val status = connection.responseCode
            val stream = if (status >= 400) connection.errorStream else connection.inputStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            if (status >= 400) {
                val message = try { JSONObject(text).optString("message") } catch (_: JSONException) { "" }
                ApiResult.Error(status, message)
            } else {
                ApiResult.Ok(parse(JSONObject(text)), status)
            }
        } catch (_: IOException) {
            ApiResult.Offline
        } catch (_: JSONException) {
            // Respuesta que no es la del contrato (por ejemplo, otro servicio en esa dirección).
            ApiResult.Error(500, "")
        } finally {
            connection?.disconnect()
        }
    }
}
