import { WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { AgentHello, AgentPong, AgentMessage, ServerChallenge, parseMessage } from './protocol.js';
import { audit, findAgentByTokenAndName, upsertAgent, setAgentOnline, setAgentFingerprint } from './db.js';

// WebSocket close codes for agent connections
const WS_CLOSE_MISSING_FINGERPRINT = 4003;
const WS_CLOSE_FINGERPRINT_MISMATCH = 4004;

export interface AgentConnection {
  id: string;
  ws: WebSocket;
  name: string;
  os: string;
  token: string;
  sessions: Set<string>;
  lastSeen: number;
  identityKey: string;
  latencyMs: number | null;
  pendingPing: { id: string; sentAt: number } | null;
}

export interface PreAuth {
  tokenHash: string;
  challengeSignature: string;
  label?: string;
}

const agents = new Map<string, AgentConnection>();

let onAgentMessage: (agentId: string, msg: AgentMessage) => void = () => {};
let onAgentDisconnect: (agentId: string, tokenHash: string) => void = () => {};
let onLatencyUpdate: (agentId: string, latencyMs: number | null) => void = () => {};

export function setAgentMessageHandler(handler: typeof onAgentMessage) {
  onAgentMessage = handler;
}

export function setAgentDisconnectHandler(handler: typeof onAgentDisconnect) {
  onAgentDisconnect = handler;
}

export function setLatencyUpdateHandler(handler: typeof onLatencyUpdate) {
  onLatencyUpdate = handler;
}

const MAX_AGENT_MSG_SIZE = 512 * 1024; // 512KB (PTY data is base64, can be larger)

export function handleAgentConnection(ws: WebSocket, preAuth: PreAuth) {
  let agentId: string | null = null;

  // Send pre-computed server.challenge — agent must verify before sending agent.hello
  const challenge: ServerChallenge = {
    type: 'server.challenge',
    signature: preAuth.challengeSignature,
  };
  ws.send(JSON.stringify(challenge));

  ws.on('message', (data) => {
    const raw = data.toString();
    if (raw.length > MAX_AGENT_MSG_SIZE) {
      console.error('Agent message exceeds size limit:', raw.length);
      ws.close(1009, 'Message too large');
      return;
    }
    let msg: AgentMessage;
    try {
      msg = parseMessage(raw) as AgentMessage;
    } catch {
      console.error('Invalid message from agent:', raw);
      return;
    }

    // First message must be agent.hello
    if (agentId === null) {
      if (msg.type !== 'agent.hello') {
        console.error('Expected agent.hello, got:', msg.type);
        ws.close();
        return;
      }
      const hello = msg as AgentHello;

      if (!hello.fingerprint) {
        console.error(`Agent rejected: missing fingerprint from ${hello.name}`);
        audit('agent_reject', undefined, `name=${hello.name}, reason=missing fingerprint`);
        ws.close(WS_CLOSE_MISSING_FINGERPRINT, 'Missing fingerprint');
        return;
      }

      const { tokenHash, label: tokenLabel } = preAuth;

      // Check if agent already exists — reuse ID and verify fingerprint
      const existing = findAgentByTokenAndName(tokenHash, hello.name);
      if (existing && existing.fingerprint && existing.fingerprint !== hello.fingerprint) {
        console.error(`Agent rejected: fingerprint mismatch for ${hello.name} (${existing.id})`);
        audit('agent_reject', undefined, `name=${hello.name}, agentId=${existing.id}, reason=fingerprint mismatch`);
        ws.close(WS_CLOSE_FINGERPRINT_MISMATCH, 'Fingerprint mismatch');
        return;
      }

      agentId = existing?.id ?? randomUUID();

      // DB write happens after all validation passes
      upsertAgent(agentId, hello.name, hello.os, tokenHash);

      // Record fingerprint on first connection
      if (!existing?.fingerprint) {
        setAgentFingerprint(agentId, hello.fingerprint);
      }

      const conn: AgentConnection = {
        id: agentId,
        ws,
        name: hello.name,
        os: hello.os,
        token: tokenHash,
        sessions: new Set(),
        lastSeen: Date.now(),
        identityKey: (msg as AgentHello).identityKey || '',
        latencyMs: null,
        pendingPing: null,
      };
      // Close old connection if this agent is reconnecting before the old WS timed out
      const existingConn = agents.get(agentId);
      if (existingConn && existingConn.ws.readyState === WebSocket.OPEN) {
        console.log(`Replacing existing connection for agent ${agentId}`);
        existingConn.ws.close(4001, 'Replaced by new connection');
      }

      agents.set(agentId, conn);
      console.log(`Agent connected: ${hello.name} (${agentId})`);
      audit('agent_connect', tokenLabel, `name=${hello.name}, os=${hello.os}`);

      // Notify browsers about this agent
      onAgentMessage(agentId, msg);
      return;
    }

    // Update heartbeat timestamp
    const conn = agents.get(agentId);
    if (conn) {
      conn.lastSeen = Date.now();
    }

    if (msg.type === 'agent.pong') {
      const pong = msg as AgentPong;
      if (conn && conn.pendingPing && pong.id === conn.pendingPing.id) {
        const rawLatency = Date.now() - pong.timestamp;
        conn.latencyMs = conn.latencyMs === null
          ? rawLatency
          : Math.round(0.3 * rawLatency + 0.7 * conn.latencyMs);
        conn.pendingPing = null;
        onLatencyUpdate(agentId, conn.latencyMs);
      }
      return;
    }

    onAgentMessage(agentId, msg);
  });

  ws.on('close', () => {
    if (agentId) {
      const current = agents.get(agentId);
      // Only clean up if this WebSocket is still the active connection.
      // If a newer connection replaced us, current.ws !== ws.
      if (current && current.ws === ws) {
        const tokenHash = current.token;
        console.log(`Agent disconnected: ${agentId}`);
        audit('agent_disconnect', undefined, `agentId=${agentId}, name=${current.name}`);
        setAgentOnline(agentId, false);
        agents.delete(agentId);
        onAgentDisconnect(agentId, tokenHash);
      } else {
        console.log(`Stale connection closed for agent ${agentId} (already replaced)`);
      }
    }
  });

  ws.on('error', (err) => {
    console.error(`Agent WebSocket error: ${err.message}`);
  });
}

export function getAgent(agentId: string): AgentConnection | undefined {
  return agents.get(agentId);
}

export function getAgentIdentityKey(agentId: string): string {
  const agent = agents.get(agentId);
  return agent?.identityKey ?? '';
}

export function sendToAgent(agentId: string, msg: object) {
  const agent = agents.get(agentId);
  if (agent && agent.ws.readyState === WebSocket.OPEN) {
    agent.ws.send(JSON.stringify(msg));
  }
}

export function getAllAgents(): AgentConnection[] {
  return Array.from(agents.values());
}

export function disconnectAgentsByToken(token: string): void {
  for (const [, conn] of agents) {
    if (conn.token === token) {
      console.log(`Disconnecting agent ${conn.name} (${conn.id}): token disabled/deleted`);
      conn.ws.close(4002, 'Token disabled');
    }
  }
}

const PING_INTERVAL_MS = 30_000;
const PING_TIMEOUT_MS = 10_000;

export function startPingLoop(): ReturnType<typeof setInterval> {
  return setInterval(() => {
    const now = Date.now();
    for (const conn of agents.values()) {
      if (conn.ws.readyState !== WebSocket.OPEN) continue;

      // Skip sending new ping if the previous one timed out
      if (conn.pendingPing && now - conn.pendingPing.sentAt > PING_TIMEOUT_MS) {
        const hadLatency = conn.latencyMs !== null;
        conn.latencyMs = null;
        conn.pendingPing = null;
        if (hadLatency) {
          onLatencyUpdate(conn.id, null);
        }
        continue;
      }

      const pingId = randomUUID();
      conn.pendingPing = { id: pingId, sentAt: now };
      conn.ws.send(JSON.stringify({
        type: 'agent.ping',
        id: pingId,
        timestamp: now,
      }));
    }
  }, PING_INTERVAL_MS);
}
