import SwiftUI
import ServiceManagement
import Sparkle

struct MenuBarView: View {
    @Environment(\.openWindow) private var openWindow

    var agentProcess: AgentProcess
    var statusMonitor: StatusMonitor
    var configManager: ConfigManager
    var updater: SPUUpdater

    @State private var launchAtLogin = SMAppService.mainApp.status == .enabled

    var body: some View {
        // Status section
        statusSection
        Divider()

        // Agent control
        controlSection
        Divider()

        // Windows
        Button {
            openWindow(id: "config")
            NSApp.activate(ignoringOtherApps: true)
        } label: {
            Label("Configuration\u{2026}", systemImage: "gearshape")
        }
        .keyboardShortcut(",", modifiers: .command)

        Button {
            openWindow(id: "logs")
            NSApp.activate(ignoringOtherApps: true)
        } label: {
            Label("View Logs\u{2026}", systemImage: "doc.text")
        }
        .keyboardShortcut("l", modifiers: .command)

        Button("Check for Updates\u{2026}") {
            updater.checkForUpdates()
        }
        .disabled(!updater.canCheckForUpdates)

        Button {
            openWindow(id: "about")
            NSApp.activate(ignoringOtherApps: true)
        } label: {
            Label("About RttysAgent", systemImage: "info.circle")
        }

        Divider()

        // Login item toggle
        Toggle(isOn: $launchAtLogin) {
            Text("Start on Login")
        }
        .onChange(of: launchAtLogin) { _, newValue in
            do {
                if newValue {
                    try SMAppService.mainApp.register()
                } else {
                    try SMAppService.mainApp.unregister()
                }
            } catch {
                launchAtLogin = !newValue
            }
        }

        Divider()

        Button("Quit RttysAgent") {
            agentProcess.stop()
            NSApp.terminate(nil)
        }
        .keyboardShortcut("q", modifiers: .command)
    }

    // MARK: - Subviews

    @ViewBuilder
    private var statusSection: some View {
        if agentProcess.isRunning && statusMonitor.isConnected {
            Label(
                "Connected",
                systemImage: "circle.fill"
            )
            .foregroundStyle(.green)
            if statusMonitor.sessionCount > 0 {
                Text("\(statusMonitor.sessionCount) active session\(statusMonitor.sessionCount == 1 ? "" : "s")")
                    .font(.caption)
            }
        } else if agentProcess.isRunning {
            Label(
                "Connecting\u{2026}",
                systemImage: "circle.fill"
            )
            .foregroundStyle(.orange)
        } else if case .restarting(let attempt) = agentProcess.state {
            Label(
                "Restarting (#\(attempt))\u{2026}",
                systemImage: "circle.fill"
            )
            .foregroundStyle(.orange)
        } else {
            Label(
                "Stopped",
                systemImage: "circle.fill"
            )
            .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private var controlSection: some View {
        if agentProcess.isRunning {
            Button {
                agentProcess.stop()
                statusMonitor.reset()
            } label: {
                Label("Stop Agent", systemImage: "stop.fill")
            }
        } else {
            Button {
                if configManager.isValid {
                    agentProcess.start()
                    statusMonitor.startPolling()
                } else {
                    openWindow(id: "config")
                    NSApp.activate(ignoringOtherApps: true)
                }
            } label: {
                Label("Start Agent", systemImage: "play.fill")
            }
        }
    }
}
