import Foundation

/// Lightweight YAML parser/writer for flat key-value config files.
/// Compatible with Go agent's config.yaml format (no nested structures).
enum YAMLParser {

    static func parse(_ content: String) -> [String: String] {
        var result: [String: String] = [:]
        for line in content.components(separatedBy: .newlines) {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.isEmpty || trimmed.hasPrefix("#") { continue }
            guard let colonIndex = trimmed.firstIndex(of: ":") else { continue }
            let key = String(trimmed[trimmed.startIndex..<colonIndex]).trimmingCharacters(in: .whitespaces)
            let value = String(trimmed[trimmed.index(after: colonIndex)...]).trimmingCharacters(in: .whitespaces)
            // Strip surrounding quotes if present
            if value.count >= 2,
               (value.hasPrefix("\"") && value.hasSuffix("\"")) ||
               (value.hasPrefix("'") && value.hasSuffix("'")) {
                result[key] = String(value.dropFirst().dropLast())
            } else {
                result[key] = value
            }
        }
        return result
    }

    static func serialize(_ dict: [String: String], keyOrder: [String]) -> String {
        var lines: [String] = []
        for key in keyOrder {
            if let value = dict[key], !value.isEmpty {
                // Quote values containing special YAML characters
                if value.contains(":") || value.contains("#") || value.contains("\"") {
                    lines.append("\(key): \"\(value)\"")
                } else {
                    lines.append("\(key): \(value)")
                }
            }
        }
        return lines.joined(separator: "\n") + "\n"
    }
}
