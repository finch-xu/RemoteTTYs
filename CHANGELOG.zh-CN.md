# 更新日志

RemoteTTYs 的所有重要变更都会记录在本文件中。

本文件格式基于 [Keep a Changelog 1.1](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

`v0.5.0` 之前的发布历史可在 [Git tags](https://github.com/finch-xu/RemoteTTYs/tags) 中查看。

**[English version](CHANGELOG.md)**

## [Unreleased]

### 变更
- **macOS 应用：Stop 菜单项现在始终显示且始终可点。** 此前 Stop 仅在应用认为 agent 正在运行时才显示——也就是说在 `.starting` 和 `.restarting` 过渡态下 Stop 消失，用户无法中断无限重启循环。Start 现在在所有活跃态（`.starting`、`.running`、`.restarting`）下都置灰，而不再仅限 `.running`。
- **macOS 应用：菜单栏图标与 About 窗口 logo** 改用项目自带的 rttys-agent 美术资源（`MenuBarIcon`、`AppLogo` 资源集），不再使用系统符号和通用应用图标。

### 修复
- **macOS 应用：异常退出后残留的孤儿 agent 守护进程。** 当 Swift 应用崩溃或被强制结束时，内嵌的 Go `rttys-agent` 子进程会被 launchd 收养并继续运行。下次打开应用时用户除了手动 kill 别无他法。现在点击 Stop 会调用内嵌的 `rttys-agent stop` CLI 通过 `~/.rttys/agent.pid` 回收孤儿进程。该调用仅在应用没有追踪任何子进程时触发，因此日常点击 Stop 零额外开销。
- **macOS 应用：Quit/Stop 时菜单冻结最长 2 秒。** 此前孤儿清理子进程使用 `Process.waitUntilExit()` 在 `@MainActor` 上同步等待，阻塞菜单动画以及 `NSApp.terminate(nil)` 的响应。现已改用 `terminationHandler` + `withCheckedContinuation`，CLI 执行期间主 actor 保持响应。

### 文档
- README：将 `RttysAgent.zip` 列为 macOS 推荐方案；补充首次使用时 macOS TCC 权限弹窗（`~/Documents`、`~/Desktop`、`~/Downloads`、iCloud Drive）的说明，并指出 **完全磁盘访问权限** 可作为一次性授权的替代方案；将 `agent-mac/` 加入项目结构说明。

## [0.5.0-beta-5] - 2026-04-16

汇总 `beta-1` 至 `beta-5` — 五次快速迭代，使 macOS 应用的发布通道从"实验性"进入"可用于正式发版"状态。

### 新增
- **macOS 菜单栏应用**（`agent-mac/`，发布物 `RttysAgent.zip`）：
  - 菜单栏状态图标（已连接 / 已断开 / 已停止）。
  - 内嵌 Go Agent 的子进程生命周期管理，支持指数退避重启。
  - 内置配置编辑器（relay 地址、token、服务端密钥、Shell 选择）。
  - 实时日志查看器，自动滚动。
  - "开机自启"开关。
  - 基于 Sparkle 2.x 的自动更新，使用 EdDSA 签名校验。
  - 通用二进制（Apple Silicon + Intel），Developer ID 签名并经 Apple 公证。
- **Web 终端鼠标事件转发。** `mousedown` / `mouseup` / `motion` 事件被转换为 SGR 转义序列并发送至 PTY，使 Claude Code 等 TUI 应用可响应鼠标点击。
- **macOS 应用发布 CI 流水线**（`build-macos-app` 任务）：Go 通用二进制经 `lipo` 合并 → `xcodebuild archive` → `xcodebuild -exportArchive` → 注入并重签嵌入的 `rttys-agent` helper → 通过 `notarytool` 进行 Apple 公证 → Sparkle EdDSA 签名 → 生成 `appcast.xml` → 上传至 GitHub Release。

### 变更
- **图片粘贴机制。** 粘贴的图片现被保存到临时文件，并将路径键入终端，不再写入系统剪贴板。在没有剪贴板的 headless agent 上也能正常工作。
- **CI 代码签名。** 全流程改为手动签名，规避 Xcode 26 在同一次 archive 中同时使用 `CODE_SIGN_STYLE = Automatic` 与命令行 `CODE_SIGN_IDENTITY` 时的硬错误。
- **Sparkle 签名加固。** 私钥改由 `-f <tmpfile>` 显式传入（避免 stdin 行为歧义）；fallback Sparkle 版本对齐至项目锁定的 `2.9.1`；`edSignature` 提取为空时立即失败。
- **macOS runner 升级至 `macos-26`**，以支持工程中 `objectVersion = 77`（Xcode 16+ 的 synchronized file group）；Xcode 钉定到 `26.2` 保证可复现性。
- Keychain 设置现会显式设置 `default-keychain` 并打印可用的 codesigning 身份，便于排查。
- 公证前断言 Info.plist 版本号与 git tag 一致。

### 修复
- **文件/图片上传后终端冻结**（web + agent）。端到端加密的 `recvCounter` 在 `file.transfer.ack`、`progress`、`complete` 消息上未递增，导致 AES-GCM nonce 失步，后续所有 `pty.data` 解密永久失败。修复方式：引入 `recvQueue` 序列化异步解密，与已有的 `sendQueue` 对称。
- 文件传输过程中重复按 `Ctrl+V` 会触发重复上传。
- 移除 `clipboardAvailable` 依赖，使图片粘贴在 headless agent 上也能工作。
- `.app` 内嵌的 Go helper（`rttys-agent`）未被 codesign — 这是 Hardened Runtime 的硬性要求，也是公证无法通过的障碍。现已使用 `--options runtime` + secure timestamp 单独签名，并在注入后以 entitlements 对整个 bundle 重签。
- 发布工作流的 TypeScript 错误（`TerminalView` 中未使用的解构变量、受保护 `canvas` 代码块中缺失的非空断言）以及 `lipo` 输出路径错误。

[Unreleased]: https://github.com/finch-xu/RemoteTTYs/compare/v0.5.0-beta-5...HEAD
[0.5.0-beta-5]: https://github.com/finch-xu/RemoteTTYs/releases/tag/v0.5.0-beta-5
