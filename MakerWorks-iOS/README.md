# MakerWorks iOS

An experimental SwiftUI iPhone client for the MakerWorks platform. The app showcases a "Liquid Glass" aesthetic using Apple's modern materials and provides a barcode scanner to quickly add new filaments to the MakerWorks backend.

## Features
- SwiftUI interface with translucent glass background
- Barcode scanning using the device camera
- REST API client that POSTs scanned filament data to the existing MakerWorks backend

## Running
Open the `Package.swift` in Xcode 15 or later and run the **MakerWorks** scheme on an iOS 17+ simulator or device. Update `API.baseURL` and authentication to match your deployment.

## Scanning
Barcodes are interpreted as `type|color|hex` strings. For example, scanning a code that encodes `PLA|Red|#FF0000` will create a PLA filament with red color. Adjust the parsing logic in `FilamentService` as needed to match your barcode format.
