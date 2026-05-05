import SwiftUI

enum Theme {
    static let repositoryURL = URL(string: "https://github.com/finch-xu/RemoteTTYs")!

    enum Menu {
        static let width: CGFloat = 280
        static let cornerRadius: CGFloat = 11
        static let itemHeight: CGFloat = 22
        static let itemHPad: CGFloat = 14
        static let sectionVPad: CGFloat = 5
        static let leadingIconColumn: CGFloat = 22
    }

    enum Config {
        static let width: CGFloat = 760
        static let height: CGFloat = 620
        static let heroLogoSize: CGFloat = 56
    }

    static func verb(for state: AgentProcess.State) -> String {
        switch state {
        case .stopped:    return "Take a nap"
        case .starting:   return "Stretching\u{2026}"
        case .running:    return "On the prowl"
        case .restarting: return "Sniffing the relay\u{2026}"
        }
    }

    static func label(for state: AgentProcess.State, isConnected: Bool) -> String {
        switch state {
        case .stopped:    return "Stopped"
        case .starting:   return "Connecting\u{2026}"
        case .running:    return isConnected ? "Connected" : "Running"
        case .restarting: return "Reconnecting\u{2026}"
        }
    }

    static func dotColor(for state: AgentProcess.State) -> Color {
        switch state {
        case .stopped:                return Color(nsColor: .secondaryLabelColor)
        case .starting, .restarting:  return Color(nsColor: .systemOrange)
        case .running:                return Color(nsColor: .systemGreen)
        }
    }
}
