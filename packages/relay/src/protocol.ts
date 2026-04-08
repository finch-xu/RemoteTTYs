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
}

export interface AgentHeartbeat extends BaseMessage {
  type: 'agent.heartbeat';
}

export interface PtyCreated extends BaseMessage {
  type: 'pty.created';
  sessionId: string;
  pid: number;
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

export type AgentMessage = AgentHello | AgentHeartbeat | PtyCreated | PtyData | PtyExited | PtyReplay;

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
}

export interface PtyResize extends BaseMessage {
  type: 'pty.resize';
  sessionId: string;
  cols: number;
  rows: number;
}

export interface PtyClose extends BaseMessage {
  type: 'pty.close';
  sessionId: string;
}

export interface PtyReplayRequest extends BaseMessage {
  type: 'pty.replay.request';
  sessionId: string;
}

export type RelayToAgentMessage = ServerChallenge | PtyCreate | PtyData | PtyResize | PtyClose | PtyReplayRequest;

// --- Browser → Relay ---

export interface BrowserPtyCreate extends BaseMessage {
  type: 'pty.create';
  agentId: string;
  shell: string;
  cwd: string;
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
}

export interface BrowserPtyClose extends BaseMessage {
  type: 'pty.close';
  agentId: string;
  sessionId: string;
}

export interface BrowserPtyReplayRequest extends BaseMessage {
  type: 'pty.replay.request';
  agentId: string;
  sessionId: string;
}

export type BrowserMessage = BrowserPtyCreate | BrowserPtyData | BrowserPtyResize | BrowserPtyClose | BrowserPtyReplayRequest;

// --- Relay → Browser ---

export interface RelayAgentOnline extends BaseMessage {
  type: 'agent.online';
  agentId: string;
  name: string;
  os: string;
}

export interface RelayAgentOffline extends BaseMessage {
  type: 'agent.offline';
  agentId: string;
}

export interface RelayPtyCreated extends BaseMessage {
  type: 'pty.created';
  agentId: string;
  sessionId: string;
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

export type RelayToBrowserMessage =
  | RelayAgentOnline
  | RelayAgentOffline
  | RelayAgentSessions
  | RelayPtyCreated
  | RelayPtyData
  | RelayPtyExited
  | RelayPtyReplay;

export function parseMessage(raw: string): BaseMessage {
  const msg = JSON.parse(raw);
  if (!msg || typeof msg.type !== 'string') {
    throw new Error('Invalid message: missing type field');
  }
  return msg as BaseMessage;
}
