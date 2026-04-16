import Foundation

struct LogLine: Identifiable {
    nonisolated(unsafe) private static var counter = 0
    let id: Int
    let timestamp: Date
    let text: String

    init(timestamp: Date, text: String) {
        Self.counter += 1
        self.id = Self.counter
        self.timestamp = timestamp
        self.text = text
    }
}

@MainActor
@Observable
final class LogStore {
    private(set) var lines: [LogLine] = []
    private let maxLines = 5000
    private let evictionBatch = 500

    func append(_ text: String) {
        guard !text.isEmpty else { return }
        lines.append(LogLine(timestamp: .now, text: text))
        if lines.count > maxLines + evictionBatch {
            lines.removeFirst(evictionBatch)
        }
    }

    func clear() {
        lines.removeAll()
    }
}
