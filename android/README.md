# Android — app del técnico

App Android de SignalMap (Hito 3): el técnico acerca el teléfono a una tira NFC, la app identifica el punto y mide las redes WiFi. Kotlin + Jetpack Compose.

> **Estado:** el técnico inicia sesión, acerca el teléfono a una tira NFC, mide las redes WiFi (con sus permisos y el límite de 4 búsquedas cada 2 minutos) y envía la medición a la API con su fase. Si no hay conexión, la medición queda pendiente en memoria y se envía con «Enviar ahora»; guardarla en el teléfono para que sobreviva al cierre de la app es la tarea siguiente (T15).

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
