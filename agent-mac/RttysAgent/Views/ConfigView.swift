import SwiftUI

struct ConfigView: View {
    var configManager: ConfigManager
    var agentProcess: AgentProcess
    var statusMonitor: StatusMonitor

    @Environment(\.dismiss) private var dismiss

    @State private var relay: String = ""
    @State private var token: String = ""
    @State private var name: String = ""
    @State private var shell: String = ""
    @State private var serverKey: String = ""
    @State private var insecure: Bool = false
    @State private var maxRetries: Int = 10
    @State private var showToken: Bool = false
    @State private var showServerKey: Bool = false
    @State private var saveError: String?
    @State private var shells: [String] = []

    private static let machineName = Host.current().localizedName ?? "Mac"

    private static let candidateShells = [
        "/bin/zsh", "/bin/bash", "/bin/sh",
        "/usr/local/bin/fish", "/opt/homebrew/bin/fish",
        "/usr/local/bin/nu", "/opt/homebrew/bin/nu"
    ]

    var body: some View {
        VStack(spacing: 0) {
            ConfigHero()
            Divider()

            Form {
                Section("Connection") {
                    TextField("Relay URL", text: $relay, prompt: Text("wss://relay.example.com/ws/agent"))
                        .monoInputFont()
                    revealableField("Token", text: $token, isRevealed: $showToken)
                    TextField("Agent Name", text: $name, prompt: Text(Self.machineName))
                        .monoInputFont()
                    revealableField("Server Key", text: $serverKey, isRevealed: $showServerKey)
                }

                Section("Terminal") {
                    Picker("Shell", selection: $shell) {
                        ForEach(shells, id: \.self) { shellPath in
                            Text(shellPath)
                                .monoInputFont()
                                .tag(shellPath)
                        }
                    }
                }

                Section("Advanced") {
                    Toggle("Skip TLS Verification (Insecure)", isOn: $insecure)
                    Stepper("Max Retries: \(maxRetries)", value: $maxRetries, in: 0...100)
                        .help("0 = unlimited retries")
                }

                if let error = saveError {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                            .font(.caption)
                    }
                }
            }
            .formStyle(.grouped)
            .scrollContentBackground(.hidden)
        }
        .frame(
            minWidth: Theme.Config.width,
            idealWidth: Theme.Config.width,
            minHeight: 560,
            idealHeight: Theme.Config.height
        )
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save & Restart") {
                    saveAndRestart()
                }
                .disabled(relay.isEmpty || token.isEmpty || serverKey.isEmpty)
            }
        }
        .onAppear {
            loadFromConfig()
            shells = Self.detectShells(current: shell)
        }
    }

    // MARK: - Reusable Views

    private func revealableField(
        _ label: String,
        text: Binding<String>,
        isRevealed: Binding<Bool>
    ) -> some View {
        HStack {
            Group {
                if isRevealed.wrappedValue {
                    TextField(label, text: text)
                } else {
                    SecureField(label, text: text)
                }
            }
            .monoInputFont()

            Button { isRevealed.wrappedValue.toggle() } label: {
                Image(systemName: isRevealed.wrappedValue ? "eye.slash" : "eye")
            }
            .buttonStyle(.borderless)
        }
    }

    // MARK: - Logic

    private static func detectShells(current: String) -> [String] {
        var result = candidateShells.filter { FileManager.default.isExecutableFile(atPath: $0) }
        if !current.isEmpty && !result.contains(current) {
            result.insert(current, at: 0)
        }
        return result
    }

    private func loadFromConfig() {
        relay = configManager.relay
        token = configManager.token
        name = configManager.name
        shell = configManager.shell
        serverKey = configManager.serverKey
        insecure = configManager.insecure
        maxRetries = configManager.maxRetries
    }

    private func saveAndRestart() {
        configManager.relay = relay
        configManager.token = token
        configManager.name = name
        configManager.shell = shell
        configManager.serverKey = serverKey
        configManager.insecure = insecure
        configManager.maxRetries = maxRetries

        do {
            try configManager.save()
            saveError = nil
        } catch {
            saveError = "Failed to save: \(error.localizedDescription)"
            return
        }

        agentProcess.stop()
        statusMonitor.reset()
        agentProcess.start()
        statusMonitor.startPolling()

        dismiss()
    }
}

// MARK: - View modifiers

private extension View {
    func monoInputFont() -> some View {
        font(.system(.body, design: .monospaced))
    }
}

// MARK: - Hero header

private struct ConfigHero: View {
    var body: some View {
        HStack(spacing: 16) {
            Image("AppLogo")
                .resizable()
                .interpolation(.high)
                .frame(width: Theme.Config.heroLogoSize, height: Theme.Config.heroLogoSize)
                .clipShape(RoundedRectangle(cornerRadius: 14))

            VStack(alignment: .leading, spacing: 3) {
                Text("RttysAgent")
                    .font(.system(size: 17, weight: .semibold))

                Text("Bring your terminal anywhere. Purrs included.")
                    .font(.system(size: 12).italic())
                    .foregroundStyle(.secondary)

                Link(destination: Theme.repositoryURL) {
                    HStack(spacing: 6) {
                        Image(systemName: "chevron.left.forwardslash.chevron.right")
                        Text("github.com/finch-xu/RemoteTTYs")
                            .font(.system(size: 12, design: .monospaced))
                        Image(systemName: "arrow.up.right")
                            .font(.system(size: 10))
                    }
                    .foregroundStyle(Color.accentColor)
                }
                .buttonStyle(.plain)
                .padding(.top, 2)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 22)
        .padding(.vertical, 18)
    }
}
