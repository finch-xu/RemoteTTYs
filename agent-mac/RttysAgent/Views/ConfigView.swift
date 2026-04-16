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
        Form {
            Section("Connection") {
                TextField("Relay URL", text: $relay, prompt: Text("wss://relay.example.com/ws/agent"))
                revealableField("Token", text: $token, isRevealed: $showToken)
                TextField("Agent Name", text: $name, prompt: Text(Self.machineName))
                revealableField("Server Key", text: $serverKey, isRevealed: $showServerKey)
            }

            Section("Terminal") {
                Picker("Shell", selection: $shell) {
                    ForEach(shells, id: \.self) { shellPath in
                        Text(shellPath).tag(shellPath)
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
        .frame(minWidth: 420, idealWidth: 480, minHeight: 350, idealHeight: 420)
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
