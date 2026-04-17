# Changelog

All notable changes to RemoteTTYs are documented in this file.

The format is based on [Keep a Changelog 1.1](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Release history prior to `v0.5.0` is available via [Git tags](https://github.com/finch-xu/RemoteTTYs/tags).

**[中文版 / Chinese](CHANGELOG.zh-CN.md)**

## [Unreleased]

### Changed
- **macOS app: Stop menu item is now always visible and always enabled.** Previously the Stop item was hidden whenever the app believed no agent was running — which also hid it during `.starting` and `.restarting` transitions, leaving users unable to interrupt a restart loop. Start is now disabled during every active state (`.starting`, `.running`, `.restarting`) instead of only `.running`.
- **macOS app: menu bar glyph and About window logo** now use the bundled rttys-agent artwork (`MenuBarIcon`, `AppLogo` asset sets) instead of system symbols and the generic application icon.

### Fixed
- **macOS app: orphan agent daemon left behind after an abnormal app exit.** When the Swift app crashes or is force-killed, the embedded Go `rttys-agent` child is reparented to launchd and keeps running. On next launch the user had no way to clean it up short of killing it by hand. Clicking Stop now shells out to the bundled `rttys-agent stop` CLI, which reaps any orphan via `~/.rttys/agent.pid`. The CLI call is gated to run only when the app has no tracked child process, so normal Stop clicks pay zero extra cost.
- **macOS app: menu UI freeze up to 2 seconds on Quit/Stop.** The orphan-cleanup subprocess was previously awaited with a synchronous `Process.waitUntilExit()` on the `@MainActor`, stalling menu animations and the app's response to `NSApp.terminate(nil)`. It now uses `terminationHandler` + `withCheckedContinuation` so the main actor stays responsive while the CLI runs.

### Documentation
- README: list `RttysAgent.zip` as the recommended macOS agent, document the first-run macOS TCC prompts (`~/Documents`, `~/Desktop`, `~/Downloads`, iCloud Drive) and point to **Full Disk Access** as a one-shot alternative, and add `agent-mac/` to the project structure.

## [0.5.0-beta-5] - 2026-04-16

Aggregates `beta-1` through `beta-5` — five rapid hotfix iterations that took
the macOS app release pipeline from "experimental" to "production-ready".

### Added
- **macOS menu bar app** (`agent-mac/`, distributed as `RttysAgent.zip`):
  - Menu bar status indicator (connected / disconnected / stopped).
  - Subprocess lifecycle management for the embedded Go agent with exponential backoff restart.
  - In-app configuration editor (relay URL, token, server key, shell picker).
  - Real-time log viewer with auto-scroll.
  - "Start at login" toggle.
  - Sparkle 2.x auto-update with EdDSA signature verification.
  - Universal binary (Apple Silicon + Intel), Developer ID signed, Apple-notarized.
- **Web terminal mouse event forwarding.** `mousedown` / `mouseup` / `motion` events are translated to SGR escape sequences and delivered to the PTY, enabling TUI apps such as Claude Code to react to clicks.
- **CI pipeline for macOS app releases** (`build-macos-app` job): Go universal binary via `lipo` → `xcodebuild archive` → `xcodebuild -exportArchive` → inject-and-resign the embedded `rttys-agent` helper → `notarytool` submission → Sparkle EdDSA signing → `appcast.xml` generation → uploaded to the GitHub Release.

### Changed
- **Image paste mechanism.** Pasted images are now saved to a temp file and the resulting path is typed into the terminal, replacing the previous clipboard-write approach. Works on headless agents that have no system clipboard.
- **CI code signing.** Switched to fully manual signing end to end, working around Xcode 26's hard error when `CODE_SIGN_STYLE = Automatic` is combined with a command-line `CODE_SIGN_IDENTITY` in the same archive invocation.
- **Sparkle signing hardening.** Private key is now passed via `-f <tmpfile>` (avoids ambiguous stdin behavior); fallback Sparkle version aligned with the project-pinned `2.9.1`; fail-fast when `edSignature` extraction returns empty.
- **macOS runner bumped to `macos-26`** so Xcode 26 can parse the project's `objectVersion = 77` (Xcode 16+ synchronized file groups); Xcode pinned to `26.2` for reproducibility.
- Keychain setup now sets `default-keychain` and prints available codesigning identities for diagnostic output.
- Info.plist version number is asserted against the git tag before notarization.

### Fixed
- **Terminal freeze after image or file upload** (web + agent). The E2E `recvCounter` was not advanced for `file.transfer.ack`, `progress`, and `complete` messages, causing AES-GCM nonces to desync and every subsequent `pty.data` to fail decryption. Fix introduces a `recvQueue` that serializes asynchronous decryptions, symmetric to the existing `sendQueue`.
- Duplicate uploads on repeated `Ctrl+V` during an in-flight file transfer.
- Removed the `clipboardAvailable` dependency so image paste works on headless agents.
- Embedded Go helper (`rttys-agent`) inside the `.app` was not being codesigned — a requirement under Hardened Runtime and a blocker for notarization. Now independently signed with `--options runtime` + secure timestamp, and the whole bundle is re-sealed with entitlements after injection.
- Release workflow TypeScript errors (unused destructure in `TerminalView`, missing non-null assertion inside a guarded `canvas` block) and incorrect `lipo` output path.

[Unreleased]: https://github.com/finch-xu/RemoteTTYs/compare/v0.5.0-beta-5...HEAD
[0.5.0-beta-5]: https://github.com/finch-xu/RemoteTTYs/releases/tag/v0.5.0-beta-5
