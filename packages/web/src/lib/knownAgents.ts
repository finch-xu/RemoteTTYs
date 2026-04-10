export type TOFUResult =
  | { status: 'trusted' }
  | { status: 'new' }
  | { status: 'mismatch'; storedFingerprint: string; currentFingerprint: string };

interface KnownAgent {
  identityKey: string; // base64
  fingerprint: string;
  firstSeen: string;   // ISO date
  lastSeen: string;    // ISO date
}

type KnownAgentsMap = Record<string, KnownAgent>;

const STORAGE_KEY = 'rttys-known-agents';

function loadKnownAgents(): KnownAgentsMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as KnownAgentsMap;
  } catch {
    return {};
  }
}

function saveKnownAgents(agents: KnownAgentsMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
}

async function computeFingerprint(identityKeyBase64: string): Promise<string> {
  const binaryStr = atob(identityKeyBase64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const hashBytes = new Uint8Array(hashBuffer);
  // base64 without padding
  const base64 = btoa(String.fromCharCode(...hashBytes)).replace(/=+$/, '');
  return `SHA256:${base64}`;
}

export async function checkAgentIdentity(
  agentId: string,
  identityKeyBase64: string
): Promise<TOFUResult> {
  const agents = loadKnownAgents();
  const fingerprint = await computeFingerprint(identityKeyBase64);
  const now = new Date().toISOString();

  const existing = agents[agentId];
  if (!existing) {
    agents[agentId] = {
      identityKey: identityKeyBase64,
      fingerprint,
      firstSeen: now,
      lastSeen: now,
    };
    saveKnownAgents(agents);
    return { status: 'new' };
  }

  if (existing.identityKey === identityKeyBase64) {
    existing.lastSeen = now;
    saveKnownAgents(agents);
    return { status: 'trusted' };
  }

  return {
    status: 'mismatch',
    storedFingerprint: existing.fingerprint,
    currentFingerprint: fingerprint,
  };
}

export function acceptNewIdentity(
  agentId: string,
  identityKeyBase64: string,
  fingerprint: string
): void {
  const agents = loadKnownAgents();
  const now = new Date().toISOString();
  agents[agentId] = {
    identityKey: identityKeyBase64,
    fingerprint,
    firstSeen: now,
    lastSeen: now,
  };
  saveKnownAgents(agents);
}
