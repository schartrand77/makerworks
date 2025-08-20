import Foundation

struct Filament: Codable {
    let id: UUID
    let type: String
    let color: String?
    let hex: String?
}

enum API {
    static let baseURL = URL(string: "http://localhost:8000/api/v1")!
    static var filamentURL: URL { baseURL.appendingPathComponent("filaments/") }
}

struct FilamentService {
    static func createFilament(from barcode: String) async throws -> Filament {
        let components = barcode.split(separator: "|").map { String($0) }
        let type = components.first ?? barcode
        let color = components.count > 1 ? components[1] : nil
        let hex = components.count > 2 ? components[2] : nil
        return try await createFilament(type: type, color: color, hex: hex)
    }

    static func createFilament(type: String, color: String? = nil, hex: String? = nil) async throws -> Filament {
        var request = URLRequest(url: API.filamentURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // TODO: add auth header if required by backend
        let body = ["type": type, "color": color, "hex": hex].compactMapValues { $0 }
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
            throw URLError(.badServerResponse)
        }
        return try JSONDecoder().decode(Filament.self, from: data)
    }
}
