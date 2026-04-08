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
}

export interface AgentOffline extends BaseMessage {
  type: 'agent.offline';
  agentId: string;
}

export interface PtyCreated extends BaseMessage {
  type: 'pty.created';
  agentId: string;
  sessionId: string;
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

export type RelayMessage = AgentOnline | AgentOffline | PtyCreated | PtyData | PtyExited | PtyReplay | AgentSessions;

// Browser → Relay messages
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

// Base64 helpers — binary-safe via Uint8Array
export function encodePayload(data: string): string {
  const bytes = new TextEncoder().encode(data);
  // Chunk to avoid call stack overflow on large arrays
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  }
  return btoa(chunks.join(''));
}

export function decodePayload(payload: string): Uint8Array {
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
