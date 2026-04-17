import SwiftUI
import AppKit
import Sparkle

struct AboutView: View {
    var updater: SPUUpdater

    private static let repositoryURL = URL(string: "https://github.com/finch-xu/RemoteTTYs")!

    var body: some View {
        VStack(spacing: 16) {
            Image("AppLogo")
                .resizable()
                .interpolation(.high)
                .frame(width: 128, height: 128)

            VStack(spacing: 4) {
                Text("RttysAgent")
                    .font(.title2)
                    .fontWeight(.semibold)
                Text(versionText)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
            }

            Text("A menu-bar agent for RemoteTTYs.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            VStack(spacing: 8) {
                Button {
                    NSWorkspace.shared.open(Self.repositoryURL)
                } label: {
                    Label("View on GitHub", systemImage: "arrow.up.right.square")
                        .frame(maxWidth: .infinity)
                }

                Button("Check for Updates\u{2026}") {
                    updater.checkForUpdates()
                }
                .frame(maxWidth: .infinity)
                .disabled(!updater.canCheckForUpdates)
            }
            .controlSize(.regular)

            Text("© 2026 \u{00B7} MIT License")
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .padding(24)
        .frame(width: 320)
    }

    private var versionText: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"
        return "Version \(version) (build \(build))"
    }
}
