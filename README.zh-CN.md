# RemoteTTYs

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Go](https://img.shields.io/badge/Go-1.26-00ADD8?logo=go&logoColor=white)](agent/go.mod)
[![Node.js](https://img.shields.io/badge/Node.js-22+-339933?logo=node.js&logoColor=white)](packages/relay/package.json)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](packages/web/package.json)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](Dockerfile)
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Linux-lightgrey)]()

在浏览器中远程访问自己家里Mac的终端。直接运行 Claude Code、Codex、vim 等任何 CLI 工具和命令。

> ⚠️ **警告**：本项目仅供个人使用和实验用途，请勿部署到生产环境。使用过程中请自行保障数据和连接的安全。在公网环境下，务必通过 HTTPS 反向代理（如 [Caddy](https://caddyserver.com/)）来加密所有通信流量。

**[English / 英文文档](README.md)** | [![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/finch-xu/RemoteTTYs)

<img src="images/meme.jpg" width="400" />

## 工作原理

```
本地机器                       远程服务器                    浏览器
┌──────────────┐             ┌──────────────┐            ┌──────────┐
│  rttys-agent │──主动外连──▶│  rttys-relay │◀───HTTPS───│ Web UI   │
│  (Go 二进制, │   WSS       │  (Node.js)   │   + WSS    │ ghostty  │
│   无需开放   │◀────────────│              │───────────▶│  -web    │
│   端口)      │             └──────────────┘            └──────────┘
└──────────────┘
```

- **Agent** 运行在本地机器上，主动向外连接中继服务器 — 无需开放端口，无需 NAT 穿透
- **Relay** 在 agent 和浏览器之间路由消息，从不读取终端内容
- **Web UI** 使用 [ghostty-web](https://github.com/coder/ghostty-web)（Ghostty 的 VT100 解析器编译为 WebAssembly）渲染终端

## 功能特性

- 多台机器统一管理，实时在线/离线状态
- 每台机器支持多个终端会话，标签页切换
- 浏览器重连时自动回放 scrollback（每会话 1MB 缓冲区）
- 多用户认证（JWT httpOnly cookie + CSRF 防护）
- Agent token 管理，授权机器接入
- Ed25519 challenge-response 服务端身份验证
- 机器指纹绑定，防止 token 跨机器使用
- 审计日志（登录、连接、会话生命周期）
- 单文件 Go 二进制 Agent — 目标机器零依赖
- 守护进程模式，自动重连（指数退避）

## 部署服务端

服务端（relay + web UI）以单个 Docker 容器运行。

```bash
git clone https://github.com/finchxu/RemoteTTYs.git
cd RemoteTTYs
docker compose up -d
```

服务启动在 8080 端口。首次访问会进入设置页面，创建管理员账号。

> 生产环境建议在前面放反向代理（Caddy、nginx）处理 HTTPS。Agent 通过 `wss://` 连接。

### 局域网部署（无 SSL）

如果在局域网内部署，无需 HTTPS，创建 `.env` 文件：

```bash
cp .env.example .env
```

编辑 `.env`：

```
NODE_ENV=development
JWT_SECRET=your-random-secret-here
```

Docker 镜像默认设置 `NODE_ENV=production`，会启用 cookie 的 `Secure` 标志 — 浏览器会拒绝通过 HTTP 发送 cookie。设置 `NODE_ENV=development` 可禁用此标志，使认证在 `http://` 下正常工作。

> **注意：** 局域网部署必须显式设置 `JWT_SECRET` — 在开发模式下如果未设置，每次重启都会生成随机密钥，导致所有用户登出。

Agent 应使用 `ws://` 而非 `wss://` 连接：

```yaml
relay: ws://192.168.1.100:8080/ws/agent
```

## 安装 Agent

Agent 是一个单文件 Go 二进制，运行在你的本地机器上。

### 1. 下载

前往 [Releases](https://github.com/finchxu/RemoteTTYs/releases) 页面，下载对应平台的二进制文件：

| 平台 | 文件名 |
|------|--------|
| macOS (Apple Silicon) | `rttys-agent-macOS-arm64` |
| macOS (Intel) | `rttys-agent-macOS-x64` |
| Linux (x86_64) | `rttys-agent-Linux-x64` |
| Linux (ARM64) | `rttys-agent-Linux-arm64` |

```bash
chmod +x rttys-agent-*
mv rttys-agent-* rttys-agent
```

### 2. 配置

```bash
./rttys-agent init
```

在二进制文件同目录生成 `config.yaml`：

```yaml
relay: wss://your-server.com/ws/agent
token: your-agent-token
server_key: <base64编码的服务端公钥>
name: my-machine
shell: /bin/zsh
```

- **token**：在 Web UI 的设置页面创建 agent token，粘贴到这里。
- **server_key**：从设置页面复制服务端的 Ed25519 公钥，粘贴到这里。Agent 使用此公钥验证服务端身份，验证通过后才发送数据。

### 3. 运行

```bash
./rttys-agent              # 前台运行
./rttys-agent -d           # 守护进程模式（日志写入 ~/.rttys/agent.log）
./rttys-agent status       # 查看运行状态
./rttys-agent stop         # 停止守护进程
```

Agent 自动重连，指数退避（1s 到 30s 上限）。

## 安全模型

Agent 到服务端的连接受三层保护：

1. **HTTP 层 Token 认证** — Agent 在 WebSocket 升级时通过 `X-Token` HTTP header 发送 token。无效 token 在 WebSocket 连接建立前即被拒绝。
2. **Ed25519 challenge-response** — WebSocket 建立后，服务端用 Ed25519 私钥签名 agent 的 token 作为 challenge 发送。Agent 用预配置的服务端公钥验证签名，验证通过后才发送数据。
3. **机器指纹绑定** — Agent 上报机器唯一标识的 SHA-256 哈希。服务端在首次连接时记录，后续连接若不匹配则拒绝，防止 token 被复制到其他机器使用。

## 管理 API

所有端点需要认证（session cookie）。修改操作还需要 `X-CSRF-Token` header。

```bash
# 初始设置（仅首次）
GET    /api/setup/status
POST   /api/setup/init                    # {"username":"x","password":"y"}

# 认证
POST   /api/auth/login                    # {"username":"x","password":"y"}
GET    /api/auth/me
POST   /api/auth/logout

# 用户管理
GET    /api/users
POST   /api/users                         # {"username":"x","password":"y"}
DELETE /api/users/:username
PUT    /api/users/:username/password      # {"password":"new"}

# 用户偏好
PUT    /api/preferences                   # {"uiTheme":"dark","terminalTheme":"ghostty"}

# Agent Token 管理
GET    /api/tokens
POST   /api/tokens                        # {"label":"Home Mac","notes":"..."}
PUT    /api/tokens/:id/enabled            # {"enabled":false}
DELETE /api/tokens/:token

# Agent 管理
GET    /api/agents
DELETE /api/agents/:id
DELETE /api/agents/:id/fingerprint        # 重置机器指纹

# 服务端密钥
GET    /api/server-key                    # 获取 Ed25519 公钥

# 审计日志
GET    /api/audit?limit=100
```

## 本地开发

### 前置要求

- Node.js 22+
- Go 1.22+

### 安装依赖

```bash
npm install
cd agent && go mod download
```

### 本地运行（3 个终端）

```bash
# 终端 1：Relay
cd packages/relay && npm run dev

# 终端 2：Web UI（Vite 开发服务器，代理到 relay）
cd packages/web && npm run dev

# 终端 3：Agent
cd agent && go run . -relay ws://localhost:8080/ws/agent
```

浏览器打开 `http://localhost:5173`，在设置页面创建管理员账号。

### 构建

```bash
make all        # 构建 agent + relay + web
make agent      # Go 二进制 → bin/rttys-agent
make relay      # TypeScript → packages/relay/dist/
make web        # Vite 构建 → packages/relay/public/
```

交叉编译 Agent：

```bash
cd agent
GOOS=linux  GOARCH=amd64 go build -o rttys-agent-linux-amd64 .
GOOS=darwin GOARCH=arm64 go build -o rttys-agent-darwin-arm64 .
```

### 类型检查

```bash
cd packages/relay && npx tsc --noEmit
cd packages/web && npx tsc --noEmit
cd agent && go vet ./...
```

## 项目结构

```
remotettys/
├── agent/              # Go — 本地 Agent 二进制
├── packages/
│   ├── relay/          # TypeScript — WebSocket 中继 + REST API
│   └── web/            # React + Vite — 浏览器终端 UI
├── Dockerfile          # 服务端多阶段构建
├── docker-compose.yml  # 生产部署
├── Makefile            # 统一构建
└── package.json        # npm workspaces
```

## 开源协议

[MIT](LICENSE)
