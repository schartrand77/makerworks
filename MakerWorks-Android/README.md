# MakerWorks Android

An experimental Jetpack Compose client with a "visionOS glass" aesthetic. The app uses CameraX and ML Kit to scan barcodes and POST filament data to the MakerWorks backend.

## Development Setup

1. Install [Android Studio](https://developer.android.com/studio) with Android SDK 34.
2. Open the `MakerWorks-Android` directory in Android Studio.
3. If prompted, let the IDE download the Android Gradle plugin and other dependencies. If the Gradle wrapper JAR is missing run `gradle wrapper` once.
4. Ensure a MakerWorks backend is running and update `FilamentService`'s `baseUrl` if not using `http://localhost:8000`.
5. Connect an Android device or start an emulator with camera support and run the **app** configuration.

## Testing

Run unit tests with:

```sh
./gradlew test
```

To execute instrumented tests on a connected device or emulator run:

```sh
./gradlew connectedAndroidTest
```

## Building APKs

Generate a debug build with:

```sh
./gradlew assembleDebug
```

For release builds, create either an APK or App Bundle:

```sh
./gradlew assembleRelease   # APK
./gradlew bundleRelease     # AAB
```

Artifacts are written under `app/build/outputs/`.

## Play Store Deployment

1. Make sure the project is configured with a release signing key or Play App Signing.
2. Run `./gradlew bundleRelease` to produce an uploadable App Bundle.
3. Sign in to the [Google Play Console](https://play.google.com/console/), create a new release and upload the generated `.aab` file.
4. Complete the release notes and roll out to testers or production.

## Barcode Format

Barcodes should encode `type|color|hex` strings. For example, scanning `PLA|Red|#FF0000` will create a red PLA filament. Adjust the parsing in `FilamentService` if your format differs.
