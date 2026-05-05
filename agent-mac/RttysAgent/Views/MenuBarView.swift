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
        VStack(spacing: 0) {
            MenuStatusBlock(
                state: agentProcess.state,
                isConnected: statusMonitor.isConnected,
                sessionCount: statusMonitor.sessionCount,
                runningSince: agentProcess.runningSince
            )

            MenuSep()

            MenuRow(
                leading: .icon("play.fill"),
                label: "Start Agent",
                isDisabled: agentProcess.isActive,
                action: startAgent
            )
            MenuRow(
                leading: .icon("stop.fill"),
                label: "Stop Agent",
                isDisabled: !agentProcess.isActive,
                action: stopAgent
            )

            MenuSep()

            MenuRow(
                leading: .icon("gearshape"),
                label: "Configuration\u{2026}",
                shortcut: .init(","),
                action: { openAndDismiss(id: "config") }
            )
            MenuRow(
                leading: .icon("doc.text"),
                label: "View Logs\u{2026}",
                shortcut: .init("l"),
                action: { openAndDismiss(id: "logs") }
            )
            MenuRow(
                leading: .icon("arrow.triangle.2.circlepath"),
                label: "Check for Updates\u{2026}",
                isDisabled: !updater.canCheckForUpdates,
                action: {
                    updater.checkForUpdates()
                    NSApp.activate(ignoringOtherApps: true)
                }
            )
            MenuRow(
                leading: .icon("info.circle"),
                label: "About RttysAgent",
                action: { openAndDismiss(id: "about") }
            )

            MenuSep()

            MenuRow(
                leading: .check(launchAtLogin),
                label: "Start on Login",
                action: toggleLaunchAtLogin
            )

            MenuSep()

            MenuRow(
                label: "Quit RttysAgent",
                shortcut: .init("q"),
                action: quit
            )
        }
        .frame(width: Theme.Menu.width)
        .padding(.vertical, Theme.Menu.sectionVPad)
        .onAppear {
            launchAtLogin = SMAppService.mainApp.status == .enabled
        }
    }

    // MARK: - Actions

    private func startAgent() {
        if configManager.isValid {
            agentProcess.start()
            statusMonitor.startPolling()
        } else {
            openAndDismiss(id: "config")
        }
    }

    private func stopAgent() {
        agentProcess.stop()
        statusMonitor.reset()
    }

    private func openAndDismiss(id: String) {
        openWindow(id: id)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func toggleLaunchAtLogin() {
        let newValue = !launchAtLogin
        do {
            if newValue {
                try SMAppService.mainApp.register()
            } else {
                try SMAppService.mainApp.unregister()
            }
            launchAtLogin = newValue
        } catch {
            // Keep current value if toggling failed
        }
    }

    private func quit() {
        agentProcess.stop()
        NSApp.terminate(nil)
    }
}

// MARK: - Status block

private struct MenuStatusBlock: View {
    let state: AgentProcess.State
    let isConnected: Bool
    let sessionCount: Int
    let runningSince: Date?

    var body: some View {
        let dot = Theme.dotColor(for: state)

        HStack(alignment: .center, spacing: 10) {
            Circle()
                .fill(dot)
                .frame(width: 10, height: 10)
                .shadow(color: isRunning ? dot.opacity(0.8) : .clear, radius: 3)

            VStack(alignment: .leading, spacing: 1) {
                Text(Theme.label(for: state, isConnected: isConnected))
                    .font(.system(size: 13.5, weight: .semibold))
                    .foregroundStyle(Color(nsColor: .labelColor))

                subtitle
                    .font(.system(size: 11.5))
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, Theme.Menu.itemHPad)
        .padding(.top, 8)
        .padding(.bottom, 10)
    }

    @ViewBuilder
    private var subtitle: some View {
        if case .running = state, let since = runningSince {
            TimelineView(.periodic(from: since, by: 1)) { context in
                Text(formatSubtitle(uptime: uptimeString(since: since, now: context.date)))
                    .monospacedDigit()
            }
        } else {
            Text(Theme.verb(for: state))
        }
    }

    private var isRunning: Bool {
        if case .running = state { return true }
        return false
    }

    private func uptimeString(since: Date, now: Date) -> String {
        let total = max(0, Int(now.timeIntervalSince(since)))
        let h = total / 3600
        let m = (total % 3600) / 60
        let s = total % 60
        return String(format: "Up %02d:%02d:%02d", h, m, s)
    }

    private func formatSubtitle(uptime: String) -> String {
        guard isConnected, sessionCount > 0 else { return uptime }
        return "\(uptime) \u{00B7} \(sessionCount) session\(sessionCount == 1 ? "" : "s")"
    }
}

// MARK: - Separator

private struct MenuSep: View {
    var body: some View {
        Rectangle()
            .fill(Color(nsColor: .separatorColor))
            .frame(height: 0.5)
            .padding(.horizontal, 12)
            .padding(.vertical, 5)
    }
}

// MARK: - Row

private enum LeadingContent {
    case icon(String)
    case check(Bool)
    case none
}

private struct MenuRowShortcut {
    let key: KeyEquivalent
    let modifiers: EventModifiers

    init(_ key: KeyEquivalent, _ modifiers: EventModifiers = .command) {
        self.key = key
        self.modifiers = modifiers
    }

    var display: String {
        var glyphs = ""
        if modifiers.contains(.control) { glyphs += "⌃" }
        if modifiers.contains(.option)  { glyphs += "⌥" }
        if modifiers.contains(.shift)   { glyphs += "⇧" }
        if modifiers.contains(.command) { glyphs += "⌘" }
        return glyphs + " " + String(key.character).uppercased()
    }
}

private struct MenuRow: View {
    var leading: LeadingContent = .none
    var label: String
    var shortcut: MenuRowShortcut? = nil
    var isDisabled: Bool = false
    var action: () -> Void

    @State private var hovered = false

    var body: some View {
        let button = Button(action: action) { rowContent }
            .buttonStyle(.plain)
            .disabled(isDisabled)

        if let shortcut {
            button.keyboardShortcut(shortcut.key, modifiers: shortcut.modifiers)
        } else {
            button
        }
    }

    private var rowContent: some View {
        HStack(spacing: 4) {
            leadingView
                .frame(width: Theme.Menu.leadingIconColumn, alignment: .leading)
                .opacity(isDisabled ? 0.4 : 0.85)

            Text(label).lineLimit(1)

            Spacer(minLength: 8)

            if let shortcut {
                Text(shortcut.display)
                    .monospacedDigit()
                    .opacity(hovered && !isDisabled ? 0.85 : 0.6)
            }
        }
        .font(.system(size: 13.5))
        .frame(height: Theme.Menu.itemHeight)
        .padding(.horizontal, Theme.Menu.itemHPad)
        .background(
            RoundedRectangle(cornerRadius: 5)
                .fill(hovered && !isDisabled ? Color.accentColor : .clear)
        )
        .padding(.horizontal, 5)
        .foregroundStyle(rowForeground)
        .contentShape(Rectangle())
        .onHover { hovered = $0 && !isDisabled }
    }

    @ViewBuilder
    private var leadingView: some View {
        switch leading {
        case .icon(let name):
            Image(systemName: name)
                .font(.system(size: 12))
        case .check(let on):
            if on {
                Image(systemName: "checkmark")
                    .font(.system(size: 11, weight: .semibold))
            } else {
                Color.clear
            }
        case .none:
            Color.clear
        }
    }

    private var rowForeground: Color {
        if isDisabled { return Color(nsColor: .tertiaryLabelColor) }
        return hovered ? .white : Color(nsColor: .labelColor)
    }
}
