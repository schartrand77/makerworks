# MakerWorks iOS

An experimental SwiftUI iPhone client for the MakerWorks platform. The app showcases a "Liquid Glass" aesthetic using Apple's modern materials and provides a barcode scanner to quickly add new filaments to the MakerWorks backend.

## Features
- SwiftUI interface with translucent glass background
- Barcode scanning using the device camera
- REST API client that POSTs scanned filament data to the existing MakerWorks backend

## Running
Open the `Package.swift` in Xcode 15 or later and run the **MakerWorks** scheme on an iOS 17+ simulator or device. Update `API.baseURL` and authentication to match your deployment.

## Testing

Run unit tests from the command line with `xcodebuild`:

```sh
xcodebuild -scheme MakerWorks -destination 'platform=iOS Simulator,name=iPhone 15' test
```

You can also execute tests in Xcode via **Product → Test**.

## TestFlight Distribution

1. Archive the app:

   ```sh
   xcodebuild -scheme MakerWorks -configuration Release -archivePath build/MakerWorks.xcarchive archive
   ```
2. Export an IPA and upload it to App Store Connect using Xcode's Organizer or `xcrun altool`.
3. In App Store Connect, create a TestFlight build and add testers.

## Signing

Set the project to use your Apple Developer Team under **Signing & Capabilities**. For automated builds, ensure a matching provisioning profile and signing certificate are available or use Xcode's automatic signing.

## Scanning
Barcodes are interpreted as `type|color|hex` strings. For example, scanning a code that encodes `PLA|Red|#FF0000` will create a PLA filament with red color. Adjust the parsing logic in `FilamentService` as needed to match your barcode format.
