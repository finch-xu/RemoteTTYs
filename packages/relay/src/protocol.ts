// Base message envelope
export interface BaseMessage {
  type: string;
}

// --- Agent → Relay ---

export interface AgentHello extends BaseMessage {
  type: 'agent.hello';
  name: string;
  os: string;
  fingerprint: string;
  identityKey: string; // Ed25519 public key (base64)
  capabilities?: string[]; // e.g. ["clipboard"]
}

export interface AgentHeartbeat extends BaseMessage {
  type: 'agent.heartbeat';
}

export interface AgentPong extends BaseMessage {
  type: 'agent.pong';
  id: string;
  timestamp: number;
}

export interface PtyCreated extends BaseMessage {
  type: 'pty.created';
  sessionId: string;
  pid: number;
  publicKey: string;  // ECDH P-256 public key (base64)
  signature: string;  // Ed25519 signature (base64)
  clientReqId?: string; // browser-supplied correlation ID, echoed by agent
}

export interface PtyData extends BaseMessage {
  type: 'pty.data';
  sessionId: string;
  payload: string; // base64
}

export interface PtyExited extends BaseMessage {
  type: 'pty.exited';
  sessionId: string;
  exitCode: number;
}

export interface PtyReplay extends BaseMessage {
  type: 'pty.replay';
  sessionId: string;
  payload: string;
}

export interface PtyError extends BaseMessage {
  type: 'pty.error';
  sessionId: string;
  error: string;
  clientReqId?: string; // present when error occurred during pty.create handling on agent
}

// File transfer: Agent → Relay (→ Browser)

export interface FileTransferAck extends BaseMessage {
  type: 'file.transfer.ack';
  sessionId: string;
  transferId: string;
  payload: string;
}

export interface FileTransferProgress extends BaseMessage {
  type: 'file.transfer.progress';
  sessionId: string;
  transferId: string;
  payload: string;
}

export interface FileTransferComplete extends BaseMessage {
  type: 'file.transfer.complete';
  sessionId: string;
  transferId: string;
  payload: string;
}

export type AgentMessage = AgentHello | AgentHeartbeat | AgentPong | PtyCreated | PtyData | PtyExited | PtyReplay | PtyError | FileTransferAck | FileTransferProgress | FileTransferComplete;

// --- Relay → Agent (auth) ---

export interface ServerChallenge extends BaseMessage {
  type: 'server.challenge';
  signature: string; // base64-encoded Ed25519 signature of the agent's token
}

// --- Relay → Agent ---

export interface PtyCreate extends BaseMessage {
  type: 'pty.create';
  sessionId: string;
  shell: string;
  cwd: string;
  publicKey: string; // ECDH P-256 public key (base64)
  clientReqId?: string; // browser-supplied correlation ID, forwarded to agent
}

export interface PtyResize extends BaseMessage {
  type: 'pty.resize';
  sessionId: string;
  cols: number;
  rows: number;
  hmac?: string; // HMAC-SHA256 (base64)
}

export interface PtyClose extends BaseMessage {
  type: 'pty.close';
  sessionId: string;
  hmac?: string;
}

export interface PtyReplayRequest extends BaseMessage {
  type: 'pty.replay.request';
  sessionId: string;
}

export interface AgentPing extends BaseMessage {
  type: 'agent.ping';
  id: string;
  timestamp: number;
}

export type RelayToAgentMessage = ServerChallenge | AgentPing | PtyCreate | PtyData | PtyResize | PtyClose | PtyReplayRequest;

// --- Browser → Relay ---

export interface BrowserPtyCreate extends BaseMessage {
  type: 'pty.create';
  agentId: string;
  shell: string;
  cwd: string;
  publicKey: string; // ECDH P-256 public key (base64)
  clientReqId?: string; // browser-supplied correlation ID for matching pty.created back to a keyPair
}

export interface BrowserPtyData extends BaseMessage {
  type: 'pty.data';
  agentId: string;
  sessionId: string;
  payload: string;
}

export interface BrowserPtyResize extends BaseMessage {
  type: 'pty.resize';
  agentId: string;
  sessionId: string;
  cols: number;
  rows: number;
  hmac?: string; // HMAC-SHA256 (base64)
}

export interface BrowserPtyClose extends BaseMessage {
  type: 'pty.close';
  agentId: string;
  sessionId: string;
  hmac?: string;
}

export interface BrowserPtyReplayRequest extends BaseMessage {
  type: 'pty.replay.request';
  agentId: string;
  sessionId: string;
}

// File transfer: Browser → Relay (→ Agent)

export interface BrowserFileTransferStart extends BaseMessage {
  type: 'file.transfer.start';
  agentId: string;
  sessionId: string;
  transferId: string;
  payload: string;
}

export interface BrowserFileTransferChunk extends BaseMessage {
  type: 'file.transfer.chunk';
  agentId: string;
  sessionId: string;
  transferId: string;
  chunkIndex: number;
  payload: string;
}

export interface BrowserFileTransferEnd extends BaseMessage {
  type: 'file.transfer.end';
  agentId: string;
  sessionId: string;
  transferId: string;
  payload: string;
}

export type BrowserMessage = BrowserPtyCreate | BrowserPtyData | BrowserPtyResize | BrowserPtyClose | BrowserPtyReplayRequest | BrowserFileTransferStart | BrowserFileTransferChunk | BrowserFileTransferEnd;

// --- Relay → Browser ---

export interface RelayAgentOnline extends BaseMessage {
  type: 'agent.online';
  agentId: string;
  name: string;
  os: string;
  identityKey: string;
  capabilities?: string[];
}

export interface RelayAgentOffline extends BaseMessage {
  type: 'agent.offline';
  agentId: string;
}

export interface RelayPtyCreated extends BaseMessage {
  type: 'pty.created';
  agentId: string;
  sessionId: string;
  publicKey: string;
  signature: string;
  clientReqId?: string; // forwarded from agent
}

export interface RelayPtyData extends BaseMessage {
  type: 'pty.data';
  agentId: string;
  sessionId: string;
  payload: string;
}

export interface RelayPtyExited extends BaseMessage {
  type: 'pty.exited';
  agentId: string;
  sessionId: string;
  exitCode: number;
}

export interface RelayPtyReplay extends BaseMessage {
  type: 'pty.replay';
  agentId: string;
  sessionId: string;
  payload: string;
}

export interface RelayAgentSessions extends BaseMessage {
  type: 'agent.sessions';
  agentId: string;
  sessions: string[];
}

export interface RelayPtyError extends BaseMessage {
  type: 'pty.error';
  agentId: string;
  sessionId: string;
  error: string;
}

export interface BrowserPing extends BaseMessage {
  type: 'browser.ping';
  timestamp: number;
}

export interface RelayAgentLatency extends BaseMessage {
  type: 'agent.latency';
  agentId: string;
  latencyMs: number | null;
}

// File transfer: Relay → Browser (forwarded from agent, with agentId added)

export interface RelayFileTransferAck extends BaseMessage {
  type: 'file.transfer.ack';
  agentId: string;
  sessionId: string;
  transferId: string;
  payload: string;
}

export interface RelayFileTransferProgress extends BaseMessage {
  type: 'file.transfer.progress';
  agentId: string;
  sessionId: string;
  transferId: string;
  payload: string;
}

export interface RelayFileTransferComplete extends BaseMessage {
  type: 'file.transfer.complete';
  agentId: string;
  sessionId: string;
  transferId: string;
  payload: string;
}

export interface RelayPtyCreateError extends BaseMessage {
  type: 'pty.create.error';
  agentId: string;
  error: string;
  clientReqId?: string; // present so browser can clean up the pending keyPair Map entry
}

export type RelayToBrowserMessage =
  | RelayAgentOnline
  | RelayAgentOffline
  | RelayAgentSessions
  | RelayPtyCreated
  | RelayPtyCreateError
  | RelayPtyData
  | RelayPtyExited
  | RelayPtyReplay
  | RelayPtyError
  | RelayAgentLatency
  | RelayFileTransferAck
  | RelayFileTransferProgress
  | RelayFileTransferComplete;

export function parseMessage(raw: string): BaseMessage {
  const msg = JSON.parse(raw);
  if (!msg || typeof msg.type !== 'string') {
    throw new Error('Invalid message: missing type field');
  }
  return msg as BaseMessage;
}
