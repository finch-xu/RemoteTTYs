import Foundation

@MainActor
@Observable
final class ConfigManager {
    var relay: String = ""
    var token: String = ""
    var name: String = Host.current().localizedName ?? "Mac"
    var shell: String = "/bin/zsh"
    var serverKey: String = ""
    var insecure: Bool = false
    var maxRetries: Int = 10

    private static let configKeyOrder = [
        "relay", "token", "name", "shell", "server_key", "insecure", "max_retries"
    ]

    var isValid: Bool {
        !relay.isEmpty && !token.isEmpty && !serverKey.isEmpty
    }

    /// Primary config directory: ~/Library/Application Support/RttysAgent/
    private var appSupportDir: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        return base.appendingPathComponent("RttysAgent")
    }

    /// Legacy config directory: ~/.rttys/
    private var legacyDir: URL {
        FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".rttys")
    }

    func load() {
        // Try app support dir first, then legacy ~/.rttys/
        let primaryPath = appSupportDir.appendingPathComponent("config.yaml")
        let legacyPath = legacyDir.appendingPathComponent("config.yaml")

        let configPath: URL
        if FileManager.default.fileExists(atPath: primaryPath.path) {
            configPath = primaryPath
        } else if FileManager.default.fileExists(atPath: legacyPath.path) {
            configPath = legacyPath
        } else {
            return
        }

        guard let content = try? String(contentsOf: configPath, encoding: .utf8) else { return }
        let dict = YAMLParser.parse(content)

        if let v = dict["relay"], !v.isEmpty { relay = v }
        if let v = dict["token"], !v.isEmpty { token = v }
        if let v = dict["name"], !v.isEmpty { name = v }
        if let v = dict["shell"], !v.isEmpty { shell = v }
        if let v = dict["server_key"], !v.isEmpty { serverKey = v }
        if let v = dict["insecure"] { insecure = v == "true" }
        if let v = dict["max_retries"], let n = Int(v) { maxRetries = n }
    }

    func save() throws {
        var dict: [String: String] = [:]
        dict["relay"] = relay
        dict["token"] = token
        dict["name"] = name
        dict["shell"] = shell
        dict["server_key"] = serverKey
        if insecure { dict["insecure"] = "true" }
        if maxRetries != 10 { dict["max_retries"] = String(maxRetries) }

        let yaml = YAMLParser.serialize(dict, keyOrder: Self.configKeyOrder)
        let data = Data(yaml.utf8)

        // Write to both locations so Go agent can find it
        for dir in [appSupportDir, legacyDir] {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let path = dir.appendingPathComponent("config.yaml")
            try data.write(to: path, options: .atomic)
            // Restrict permissions: owner read/write only
            try FileManager.default.setAttributes(
                [.posixPermissions: 0o600], ofItemAtPath: path.path
            )
        }
    }
}
