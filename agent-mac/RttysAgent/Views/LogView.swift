import SwiftUI

struct LogView: View {
    var logStore: LogStore

    @State private var autoScroll = true

    var body: some View {
        VStack(spacing: 0) {
            // Toolbar
            HStack {
                Spacer()
                Toggle(isOn: $autoScroll) {
                    Label("Auto-scroll", systemImage: "arrow.down.to.line")
                        .labelStyle(.titleAndIcon)
                }
                .toggleStyle(.button)
                .controlSize(.small)

                Button {
                    logStore.clear()
                } label: {
                    Label("Clear", systemImage: "trash")
                        .labelStyle(.titleAndIcon)
                }
                .controlSize(.small)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)

            Divider()

            // Log content
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 1) {
                        ForEach(logStore.lines) { line in
                            logLineView(line)
                                .id(line.id)
                        }
                    }
                    .padding(8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .background(Color(nsColor: .textBackgroundColor))
                .onChange(of: logStore.lines.count) { _, _ in
                    if autoScroll, let last = logStore.lines.last {
                        proxy.scrollTo(last.id, anchor: .bottom)
                    }
                }
            }
        }
        .frame(minWidth: 500, idealWidth: 600, minHeight: 300, idealHeight: 400)
    }

    private func logLineView(_ line: LogLine) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(line.timestamp, format: .dateTime.hour().minute().second())
                .foregroundStyle(.secondary)
                .monospacedDigit()
            Text(line.text)
        }
        .font(.system(.caption, design: .monospaced))
        .textSelection(.enabled)
    }
}
