import { randomUUID } from 'crypto';
import {
  AgentMessage,
  AgentHello,
  BrowserMessage,
  BrowserPtyCreate,
  BrowserPtyData,
  BrowserPtyResize,
  BrowserPtyClose,
  BrowserPtyReplayRequest,
  PtyReplay,
} from './protocol.js';
import { getAgent, sendToAgent } from './agentHub.js';
import { audit } from './db.js';
import {
  getBrowser,
  broadcastToBrowsers,
  sendToSessionSubscribers,
} from './browserHub.js';

interface SessionMapping {
  agentId: string;
  browserIds: Set<string>;
  createdAt: number;
  lastActivity: number;
}

const sessions = new Map<string, SessionMapping>();
const MAX_SESSIONS = 500;
const MAX_SESSIONS_PER_AGENT = 20;
const MAX_SESSIONS_PER_BROWSER = 5;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function destroySession(sessionId: string, agentId: string, auditDetail: string, notifyAgent = true) {
  if (notifyAgent) {
    sendToAgent(agentId, { type: 'pty.close', sessionId });
  }
  const agent = getAgent(agentId);
  if (agent) {
    agent.sessions.delete(sessionId);
  }
  sessions.delete(sessionId);
  audit('session_close', undefined, auditDetail);
}

// Periodically clean up stale sessions
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, mapping] of sessions.entries()) {
    if (now - mapping.lastActivity > SESSION_TTL_MS) {
      console.log(`Cleaning up stale session ${sessionId} (inactive for >24h)`);
      destroySession(sessionId, mapping.agentId, `sessionId=${sessionId}, reason=ttl_expired`);
    }
  }
}, 60 * 60 * 1000); // Check every hour

export function handleAgentMessage(agentId: string, msg: AgentMessage) {
  switch (msg.type) {
    case 'agent.hello': {
      const hello = msg as AgentHello;
      broadcastToBrowsers({
        type: 'agent.online',
        agentId,
        name: hello.name,
        os: hello.os,
      });
      break;
    }

    case 'agent.heartbeat':
      // Already handled in agentHub (lastSeen update). No forwarding.
      break;

    case 'pty.created': {
      const mapping = sessions.get(msg.sessionId);
      if (!mapping || mapping.agentId !== agentId) break;
      const payload = JSON.stringify({
        type: 'pty.created',
        agentId,
        sessionId: msg.sessionId,
      });
      for (const browserId of mapping.browserIds) {
        const browser = getBrowser(browserId);
        if (browser) {
          browser.ws.send(payload);
        }
      }
      break;
    }

    case 'pty.data': {
      const dataMapping = sessions.get(msg.sessionId);
      if (!dataMapping || dataMapping.agentId !== agentId) break;
      dataMapping.lastActivity = Date.now();
      sendToSessionSubscribers(msg.sessionId, {
        type: 'pty.data',
        agentId,
        sessionId: msg.sessionId,
        payload: msg.payload,
      });
      break;
    }

    case 'pty.exited': {
      const exitMapping = sessions.get(msg.sessionId);
      if (!exitMapping || exitMapping.agentId !== agentId) break;
      sendToSessionSubscribers(msg.sessionId, {
        type: 'pty.exited',
        agentId,
        sessionId: msg.sessionId,
        exitCode: msg.exitCode,
      });
      destroySession(msg.sessionId, agentId, `sessionId=${msg.sessionId}, exitCode=${msg.exitCode}`, false);
      break;
    }

    case 'pty.replay': {
      const m = msg as PtyReplay;
      const replayMapping = sessions.get(m.sessionId);
      if (!replayMapping || replayMapping.agentId !== agentId) break;
      sendToSessionSubscribers(m.sessionId, {
        type: 'pty.replay',
        agentId,
        sessionId: m.sessionId,
        payload: m.payload,
      });
      break;
    }
  }
}

export function handleBrowserMessage(browserId: string, msg: BrowserMessage) {
  switch (msg.type) {
    case 'pty.create': {
      const m = msg as BrowserPtyCreate;
      const agent = getAgent(m.agentId);
      if (!agent) {
        console.error(`Browser ${browserId} requested session on unknown agent ${m.agentId}`);
        return;
      }

      // Validate shell: only allow simple paths, no arguments or special characters
      const shell = m.shell ?? '';
      if (shell && /[;&|$`\\'"(){}\[\]<>!#~\s]/.test(shell)) {
        console.error(`Browser ${browserId} sent invalid shell: ${shell}`);
        return;
      }

      // Validate cwd: reject null bytes and obviously malicious patterns
      const cwd = m.cwd ?? '';
      if (cwd && /\0/.test(cwd)) {
        console.error(`Browser ${browserId} sent invalid cwd: ${cwd}`);
        return;
      }

      // Check session limits
      if (sessions.size >= MAX_SESSIONS) {
        console.error(`Max total sessions (${MAX_SESSIONS}) reached, rejecting request`);
        return;
      }
      let agentSessionCount = 0;
      let browserSessionCount = 0;
      for (const s of sessions.values()) {
        if (s.agentId === m.agentId) agentSessionCount++;
        if (s.browserIds.has(browserId)) browserSessionCount++;
      }
      if (agentSessionCount >= MAX_SESSIONS_PER_AGENT) {
        console.error(`Max sessions per agent (${MAX_SESSIONS_PER_AGENT}) reached for ${m.agentId}`);
        return;
      }
      if (browserSessionCount >= MAX_SESSIONS_PER_BROWSER) {
        console.error(`Max sessions per browser (${MAX_SESSIONS_PER_BROWSER}) reached for ${browserId}`);
        return;
      }

      const sessionId = randomUUID();
      const now = Date.now();

      // Register session mapping
      sessions.set(sessionId, {
        agentId: m.agentId,
        browserIds: new Set([browserId]),
        createdAt: now,
        lastActivity: now,
      });

      // Subscribe browser to this session
      const browser = getBrowser(browserId);
      if (browser) {
        browser.subscribedSessions.add(sessionId);
      }

      // Track on agent
      agent.sessions.add(sessionId);

      // Forward to agent (strip agentId, add sessionId)
      sendToAgent(m.agentId, {
        type: 'pty.create',
        sessionId,
        shell,
        cwd,
      });

      console.log(`Session ${sessionId} created on agent ${m.agentId} by browser ${browserId}`);
      audit('session_create', undefined, `sessionId=${sessionId}, agentId=${m.agentId}`);
      break;
    }

    case 'pty.data': {
      const m = msg as BrowserPtyData;
      const dataSession = sessions.get(m.sessionId);
      if (!dataSession || dataSession.agentId !== m.agentId || !dataSession.browserIds.has(browserId)) {
        return;
      }
      dataSession.lastActivity = Date.now();
      sendToAgent(m.agentId, {
        type: 'pty.data',
        sessionId: m.sessionId,
        payload: m.payload,
      });
      break;
    }

    case 'pty.resize': {
      const m = msg as BrowserPtyResize;
      const resizeSession = sessions.get(m.sessionId);
      if (!resizeSession || resizeSession.agentId !== m.agentId || !resizeSession.browserIds.has(browserId)) {
        return;
      }
      sendToAgent(m.agentId, {
        type: 'pty.resize',
        sessionId: m.sessionId,
        cols: Math.max(1, Math.min(m.cols, 500)),
        rows: Math.max(1, Math.min(m.rows, 500)),
      });
      break;
    }

    case 'pty.close': {
      const m = msg as BrowserPtyClose;
      const closeMapping = sessions.get(m.sessionId);
      if (!closeMapping || closeMapping.agentId !== m.agentId || !closeMapping.browserIds.has(browserId)) {
        return;
      }
      sendToAgent(m.agentId, {
        type: 'pty.close',
        sessionId: m.sessionId,
      });
      break;
    }

    case 'pty.replay.request': {
      const m = msg as BrowserPtyReplayRequest;
      const replaySession = sessions.get(m.sessionId);
      if (!replaySession || replaySession.agentId !== m.agentId || !replaySession.browserIds.has(browserId)) {
        return;
      }
      // Subscribe browser to this session (in case it reconnected)
      const browser = getBrowser(browserId);
      if (browser) {
        browser.subscribedSessions.add(m.sessionId);
      }
      sendToAgent(m.agentId, {
        type: 'pty.replay.request',
        sessionId: m.sessionId,
      });
      break;
    }
  }
}

export function handleBrowserDisconnect(browserId: string) {
  for (const [sessionId, mapping] of sessions.entries()) {
    mapping.browserIds.delete(browserId);
    if (mapping.browserIds.size === 0) {
      destroySession(sessionId, mapping.agentId, `sessionId=${sessionId}, reason=browser_disconnect`);
      console.log(`Orphan session ${sessionId} closed (browser ${browserId} disconnected)`);
    }
  }
}

export function handleAgentDisconnect(agentId: string) {
  broadcastToBrowsers({
    type: 'agent.offline',
    agentId,
  });

  // Clean up sessions belonging to this agent
  for (const [sessionId, mapping] of sessions.entries()) {
    if (mapping.agentId === agentId) {
      sessions.delete(sessionId);
    }
  }
}
