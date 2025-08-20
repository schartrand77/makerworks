import SwiftUI

struct ContentView: View {
    @State private var showingScanner = false
    @State private var createdFilament: Filament?

    var body: some View {
        ZStack {
            Rectangle()
                .fill(.ultraThinMaterial)
                .ignoresSafeArea()

            VStack(spacing: 24) {
                if let filament = createdFilament {
                    Text("Added: \(filament.type)")
                        .font(.headline)
                        .padding()
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
                }

                Button(action: { showingScanner = true }) {
                    Label("Scan Filament Barcode", systemImage: "barcode.viewfinder")
                        .padding()
                        .frame(maxWidth: .infinity)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
                }
                .buttonStyle(.plain)
            }
            .padding()
        }
        .sheet(isPresented: $showingScanner) {
            BarcodeScannerView { code in
                showingScanner = false
                Task {
                    do {
                        let filament = try await FilamentService.createFilament(from: code)
                        createdFilament = filament
                    } catch {
                        print("Failed to create filament: \(error)")
                    }
                }
            }
        }
    }
}

#Preview {
    ContentView()
}
