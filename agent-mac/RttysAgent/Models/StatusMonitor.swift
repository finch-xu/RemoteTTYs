import Foundation

@MainActor
@Observable
final class StatusMonitor {
    var isConnected: Bool = false
    var sessions: [SessionInfo] = []
    var lastUpdated: Date?

    var sessionCount: Int { sessions.count }

    private var timer: Timer?
    private let statusFilePath: String = {
        let home = FileManager.default.homeDirectoryForCurrentUser
        return home.appendingPathComponent(".rttys/status.json").path
    }()
    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    func startPolling() {
        stopPolling()
        poll()
        timer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.poll()
            }
        }
    }

    func stopPolling() {
        timer?.invalidate()
        timer = nil
    }

    func reset() {
        if isConnected { isConnected = false }
        if !sessions.isEmpty { sessions = [] }
        if lastUpdated != nil { lastUpdated = nil }
    }

    private func poll() {
        guard let data = FileManager.default.contents(atPath: statusFilePath) else {
            reset()
            return
        }
        do {
            let status = try decoder.decode(AgentStatusFile.self, from: data)
            if !isConnected { isConnected = true }
            if sessions.count != status.sessions.count ||
                sessions.map(\.id) != status.sessions.map(\.id) {
                sessions = status.sessions
            }
            lastUpdated = status.updatedAt
        } catch {
            reset()
        }
    }
}

struct SessionInfo: Codable, Identifiable {
    let id: String
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case createdAt = "created_at"
    }
}

private struct AgentStatusFile: Codable {
    let sessions: [SessionInfo]
    let updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case sessions
        case updatedAt = "updated_at"
    }
}
