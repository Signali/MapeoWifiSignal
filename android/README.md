# Android — app del técnico

App Android de SignalMap (Hito 3): el técnico acerca el teléfono a una tira NFC, la app identifica el punto y mide las redes WiFi. Kotlin + Jetpack Compose.

> **Estado:** el técnico inicia sesión, acerca el teléfono a una tira NFC, mide las redes WiFi (con sus permisos y el límite de 4 búsquedas cada 2 minutos) y envía la medición a la API con su fase. Sin conexión, la medición queda guardada en el teléfono y se envía sola al volver la red (ver «Sin conexión»).

## Requisitos

- **Android Studio** (trae el JDK 25 que usa el proyecto). Sin Android Studio, `./gradlew` descarga el JDK 25 solo (hace falta internet la primera vez).
- **Teléfono Android 10 o superior (API 29)** con NFC, para leer tiras, y con depuración USB activada.
- Una tira NFC, para probar la lectura.

## Compilar e instalar

El proyecto Gradle está en esta carpeta (`android/`), con el módulo `app`. Desde aquí:

```
./gradlew assembleDebug testDebugUnitTest
```

Debe terminar con `BUILD SUCCESSFUL`. El APK queda en `app/build/outputs/apk/debug/app-debug.apk`.

Para instalarlo en un teléfono conectado por USB: `./gradlew installDebug` o arrastrar el APK al teléfono. En Windows, si `./gradlew` no encuentra Java, define `JAVA_HOME` con la carpeta `jbr` de Android Studio.

## Versiones

Son las de la plantilla «Empty Activity» de Android Studio, congeladas en `gradle/libs.versions.toml`, `gradle/wrapper/gradle-wrapper.properties` y `app/build.gradle.kts`. No se actualizan sin dejar nota.

| Componente | Versión |
|---|---|
| Android Gradle Plugin (AGP) | 9.4.1 |
| Gradle | 9.6.0 |
| Kotlin | 2.2.10 |
| Compose BOM | 2026.02.01 |
| compileSdk | 37 |
| targetSdk | 37 |
| minSdk | 29 (Android 10) |
| JDK | 25 (`gradle/gradle-daemon-jvm.properties`) |

## Sin conexión

- **Dónde se guarda:** una medición que no se pudo enviar queda en `pending-measurements.json`, en el espacio privado de la app (`filesDir`). Cada cambio reescribe el archivo completo con `AtomicFile`. La medición guarda el `nfc_uid` y la hora del escaneo (`measured_at`); si la tira no se pudo resolver sin conexión, se identifica al enviar. Un `client_uuid` evita que un reenvío la duplique. Un archivo ilegible se aparta como `pending-measurements.corrupt.json` y la cola parte vacía.
- **Cuándo se envía:** solo con la app abierta: al abrirla con sesión válida, cuando Android avisa que hay red (`registerDefaultNetworkCallback`), al iniciar sesión de nuevo tras un `401` y con el botón «Enviar ahora». Cerrar la app desde recientes no pierde nada: se envía al reabrirla. **Límite:** no hay envío en segundo plano (sin WorkManager).
- **Rechazos:** si la API rechaza una medición (p. ej. tira no registrada, `422`), queda en la lista con el mensaje y solo se puede «Descartar»; no se reintenta.
- **Dueño de la cola:** el archivo guarda el email de quien tomó las mediciones. Si inicia sesión otra persona, la cola se vacía.
- **Cerrar sesión con pendientes:** pide confirmación y, si se acepta, borra las mediciones del teléfono. Un `401` (sesión vencida) conserva la cola.
- **Respaldo de Android:** `allowBackup` sigue activo para que viaje lo que tomó el técnico (la cola), pero `session.xml` (token, email, rol y servidor) y `tags.xml` (caché de tiras, que depende de la base) están excluidos en `backup_rules.xml` y `data_extraction_rules.xml`.
- **Prueba sin cable** (`adb reverse` se pierde al desconectar): modo avión con el WiFi encendido, para poder medir sin salida a la API.
- **Sin prueba automática:** el archivo usa `AtomicFile` (Android), así que no se prueba con JUnit puro; se prueba a mano.
- **Límites conocidos de la cola:** si el teléfono no puede escribir el archivo (p. ej. sin espacio), la app avisa que la medición no quedó guardada. La cola se escribe en el hilo principal (el archivo es de pocos KB). Si se cierra sesión durante un envío ya en vuelo, esa medición puede llegar igual a la API (las siguientes no se envían). La cola sobrevive a la sesión vencida a propósito: se vacía solo cuando inicia sesión otra persona o se confirma «Cerrar sesión y borrar».
