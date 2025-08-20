// swift-tools-version: 5.9
import PackageDescription
import AppleProductTypes

let package = Package(
    name: "MakerWorks-iOS",
    platforms: [
        .iOS("17.0")
    ],
    products: [
        .iOSApplication(
            name: "MakerWorks",
            targets: ["MakerWorksApp"],
            bundleIdentifier: "com.makerworks.app",
            teamIdentifier: "0000000000",
            displayVersion: "1.0",
            bundleVersion: "1",
            appIcon: .placeholder,
            accentColor: .presetColor(.cyan),
            supportedDeviceFamilies: [
                .phone
            ],
            supportedInterfaceOrientations: [
                .portrait,
                .landscapeLeft,
                .landscapeRight
            ]
        )
    ],
    targets: [
        .executableTarget(
            name: "MakerWorksApp",
            path: "Sources"
        )
    ]
)
