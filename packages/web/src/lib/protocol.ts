// Message types matching the relay protocol

export interface BaseMessage {
  type: string;
}

// Relay → Browser messages
export interface AgentOnline extends BaseMessage {
  type: 'agent.online';
  agentId: string;
  name: string;
  os: string;
  identityKey: string;
  capabilities?: string[];
}

export interface AgentOffline extends BaseMessage {
  type: 'agent.offline';
  agentId: string;
}

export interface PtyCreated extends BaseMessage {
  type: 'pty.created';
  agentId: string;
  sessionId: string;
  publicKey: string;
  signature: string;
  clientReqId?: string; // browser-supplied correlation ID, echoed by agent for matching
}

export interface PtyData extends BaseMessage {
  type: 'pty.data';
  agentId: string;
  sessionId: string;
  payload: string;
}

export interface PtyExited extends BaseMessage {
  type: 'pty.exited';
  agentId: string;
  sessionId: string;
  exitCode: number;
}

export interface PtyReplay extends BaseMessage {
  type: 'pty.replay';
  agentId: string;
  sessionId: string;
  payload: string;
}

export interface AgentSessions extends BaseMessage {
  type: 'agent.sessions';
  agentId: string;
  sessions: string[]; // session IDs
}

export interface PtyError extends BaseMessage {
  type: 'pty.error';
  agentId: string;
  sessionId: string;
  error: string;
}

export interface AgentLatency extends BaseMessage {
  type: 'agent.latency';
  agentId: string;
  latencyMs: number | null;
}

export interface PtyCreateError extends BaseMessage {
  type: 'pty.create.error';
  agentId: string;
  error: string;
  clientReqId?: string; // matches the clientReqId sent in pty.create so browser can clean up its keyPair Map
}

// File transfer: Relay → Browser

export interface FileTransferAck extends BaseMessage {
  type: 'file.transfer.ack';
  agentId: string;
  sessionId: string;
  transferId: string;
  payload: string;
}

export interface FileTransferProgress extends BaseMessage {
  type: 'file.transfer.progress';
  agentId: string;
  sessionId: string;
  transferId: string;
  payload: string;
}

export interface FileTransferComplete extends BaseMessage {
  type: 'file.transfer.complete';
  agentId: string;
  sessionId: string;
  transferId: string;
  payload: string;
}

export type RelayMessage = AgentOnline | AgentOffline | PtyCreated | PtyCreateError | PtyData | PtyExited | PtyReplay | AgentSessions | PtyError | AgentLatency | FileTransferAck | FileTransferProgress | FileTransferComplete;

// Browser → Relay messages
export interface BrowserPtyCreate extends BaseMessage {
  type: 'pty.create';
  agentId: string;
  shell: string;
  cwd: string;
  publicKey: string;
  clientReqId: string; // required: correlation ID for matching pty.created back to the keyPair we generated
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