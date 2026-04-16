import Foundation

@MainActor
@Observable
final class AgentProcess {
    enum State: Equatable {
        case stopped
        case starting
        case running(pid: Int32)
        case restarting(attempt: Int)
    }

    private(set) var state: State = .stopped

    var isRunning: Bool {
        if case .running = state { return true }
        return false
    }

    private var process: Process?
    private var stdoutPipe: Pipe?
    private var stderrPipe: Pipe?
    private var shouldRestart = false
    private var restartDelay: TimeInterval = 1.0
    private var restartAttempt = 0
    private var restartTask: Task<Void, Never>?

    private weak var logStore: LogStore?

    func configure(logStore: LogStore) {
        self.logStore = logStore
    }

    func start() {
        guard !isRunning else { return }

        shouldRestart = true
        restartDelay = 1.0
        restartAttempt = 0
        launchProcess()
    }

    func stop() {
        shouldRestart = false
        restartTask?.cancel()
        restartTask = nil
        terminateProcess()
        state = .stopped
    }

    // MARK: - Private

    private func makePipeHandler() -> @Sendable (FileHandle) -> Void {
        { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }
            let lines = text.components(separatedBy: .newlines)
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
            guard !lines.isEmpty else { return }
            Task { @MainActor [weak self] in
                for line in lines {
                    self?.logStore?.append(line)
                }
            }
        }
    }

    private func launchProcess() {
        guard let agentPath = Bundle.main.path(forResource: "rttys-agent", ofType: nil) else {
            logStore?.append("[RttysAgent] ERROR: rttys-agent binary not found in app bundle")
            state = .stopped
            return
        }

        state = .starting

        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: agentPath)
        proc.arguments = []

        var env = ProcessInfo.processInfo.environment
        env["HOME"] = FileManager.default.homeDirectoryForCurrentUser.path
        proc.environment = env

        let stdout = Pipe()
        let stderr = Pipe()
        proc.standardOutput = stdout
        proc.standardError = stderr

        self.stdoutPipe = stdout
        self.stderrPipe = stderr

        let handler = makePipeHandler()
        stdout.fileHandleForReading.readabilityHandler = handler
        stderr.fileHandleForReading.readabilityHandler = handler

        proc.terminationHandler = { [weak self] terminatedProcess in
            let exitCode = terminatedProcess.terminationStatus
            Task { @MainActor [weak self] in
                self?.handleTermination(exitCode: exitCode)
            }
        }

        do {
            try proc.run()
            self.process = proc
            state = .running(pid: proc.processIdentifier)
            logStore?.append("[RttysAgent] Agent started (pid=\(proc.processIdentifier))")
        } catch {
            logStore?.append("[RttysAgent] Failed to start agent: \(error.localizedDescription)")
            state = .stopped
            scheduleRestart()
        }
    }

    private func handleTermination(exitCode: Int32) {
        stdoutPipe?.fileHandleForReading.readabilityHandler = nil
        stderrPipe?.fileHandleForReading.readabilityHandler = nil
        process = nil

        logStore?.append("[RttysAgent] Agent exited (code=\(exitCode))")

        if shouldRestart {
            scheduleRestart()
        } else {
            state = .stopped
        }
    }

    private func scheduleRestart() {
        guard shouldRestart else { return }

        restartAttempt += 1
        let delay = restartDelay
        state = .restarting(attempt: restartAttempt)
        logStore?.append("[RttysAgent] Restarting in \(String(format: "%.0f", delay))s (attempt #\(restartAttempt))...")

        restartTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(delay))
            guard !Task.isCancelled, let self else { return }
            self.restartDelay = min(self.restartDelay * 2, 30)
            self.launchProcess()
        }
    }

    private func terminateProcess() {
        guard let proc = process, proc.isRunning else { return }
        proc.terminate()
        Task.detached {
            try? await Task.sleep(for: .seconds(3))
            if proc.isRunning {
                proc.interrupt()
            }
        }
    }
}
