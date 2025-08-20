# MakerWorks Android

An experimental Jetpack Compose client with a "visionOS glass" aesthetic. The app uses CameraX and ML Kit to scan barcodes and POST filament data to the MakerWorks backend.

## Development Setup

1. Install [Android Studio](https://developer.android.com/studio) with Android SDK 34.
2. Open the `MakerWorks-Android` directory in Android Studio.
3. If prompted, let the IDE download the Android Gradle plugin and other dependencies. If the Gradle wrapper JAR is missing run `gradle wrapper` once.
4. Ensure a MakerWorks backend is running and update `FilamentService`'s `baseUrl` if not using `http://localhost:8000`.
5. Connect an Android device or start an emulator with camera support and run the **app** configuration.

## Barcode Format

Barcodes should encode `type|color|hex` strings. For example, scanning `PLA|Red|#FF0000` will create a red PLA filament. Adjust the parsing in `FilamentService` if your format differs.
