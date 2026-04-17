import SwiftUI
import Sparkle

@main
struct RttysAgentApp: App {
    @State private var agentProcess = AgentProcess()
    @State private var configManager = ConfigManager()
    @State private var statusMonitor = StatusMonitor()
    @State private var logStore = LogStore()
    private let updaterController = SPUStandardUpdaterController(
        startingUpdater: true,
        updaterDelegate: nil,
        userDriverDelegate: nil
    )

    var body: some Scene {
        MenuBarExtra {
            MenuBarView(
                agentProcess: agentProcess,
                statusMonitor: statusMonitor,
                configManager: configManager,
                updater: updaterController.updater
            )
        } label: {
            menuBarLabel
        }

        Window("Configuration", id: "config") {
            ConfigView(
                configManager: configManager,
                agentProcess: agentProcess,
                statusMonitor: statusMonitor
            )
        }
        .windowResizability(.contentSize)

        Window("Agent Logs", id: "logs") {
            LogView(logStore: logStore)
        }
        .defaultSize(width: 600, height: 400)

        Window("About RttysAgent", id: "about") {
            AboutView(updater: updaterController.updater)
        }
        .windowResizability(.contentSize)
    }

    private var menuBarLabel: some View {
        Image(systemName: agentProcess.isRunning ? "terminal.fill" : "terminal")
            .symbolRenderingMode(.hierarchical)
    }

    init() {
        agentProcess.configure(logStore: logStore)
        configManager.load()

        if configManager.isValid {
            agentProcess.start()
            statusMonitor.startPolling()
        }
    }
}
