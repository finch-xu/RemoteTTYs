import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '../lib/api';
import type { AgentOnline, AgentLatency } from '../lib/protocol';

export interface AgentInfo {
  id: string;
  name: string;
  os: string;
  online: boolean;
  sessions: string[];
  lastSeen: string | null;
  identityKey: string | null;
  latencyMs: number | null;
  capabilities: string[];
}

interface ApiAgent {
  id: string;
  name: string;
  os: string;
  online: boolean;
  sessions: string[];
  fingerprint: string | null;
  identityKey: string | null;
  latencyMs: number | null;
  lastSeen: string | null;
  createdAt: string;
}

export function useAgentStore(
  subscribe: (type: string, handler: (msg: any) => void) => () => void,
) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await apiFetch('/api/agents');
      if (!res.ok) return;
      const data: ApiAgent[] = await res.json();
      setAgents(prev => {
        const prevMap = new Map(prev.map(a => [a.id, a]));
        return data.map(a => ({
          id: a.id,
          name: a.name,
          os: a.os,
          online: a.online,
          sessions: a.sessions,
          lastSeen: a.lastSeen,
          // Use identityKey from API (available for online agents), fall back to
          // WebSocket-delivered value, then null
          identityKey: a.identityKey || prevMap.get(a.id)?.identityKey || null,
          latencyMs: a.latencyMs ?? prevMap.get(a.id)?.latencyMs ?? null,
          capabilities: prevMap.get(a.id)?.capabilities ?? [],
        }));
      });
    } catch {
      // ignore fetch errors
    }
  }, []);

  // Initial fetch + periodic refresh
  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, 10_000);
    return () => clearInterval(interval);
  }, [fetchAgents]);

  // Re-fetch on WebSocket agent status changes and capture identityKey
  useEffect(() => {
    const unsubOnline = subscribe('agent.online', (msg: AgentOnline) => {
      setAgents(prev => prev.map(a =>
        a.id === msg.agentId ? {
          ...a,
          ...(msg.identityKey && { identityKey: msg.identityKey }),
          capabilities: msg.capabilities ?? [],
        } : a
      ));
      fetchAgents();
    });
    const unsubOffline = subscribe('agent.offline', () => { fetchAgents(); });
    const unsubLatency = subscribe('agent.latency', (msg: AgentLatency) => {
      setAgents(prev => {
        const idx = prev.findIndex(a => a.id === msg.agentId);
        if (idx === -1) return prev;
        const newLatency = msg.latencyMs !== null && msg.latencyMs > 0 ? msg.latencyMs : null;
        if (prev[idx].latencyMs === newLatency) return prev;
        const next = [...prev];
        next[idx] = { ...prev[idx], latencyMs: newLatency };
        return next;
      });
    });
    return () => {
      unsubOnline();
      unsubOffline();
      unsubLatency();
    };
  }, [subscribe, fetchAgents]);

  // Auto-select first online agent
  useEffect(() => {
    if (selectedAgentId) return;
    const firstOnline = agents.find(a => a.online);
    if (firstOnline) {
      setSelectedAgentId(firstOnline.id);
    }
  }, [agents, selectedAgentId]);

  const selectAgent = useCallback((agentId: string) => {
    setSelectedAgentId(agentId);
  }, []);

  const deleteAgent = useCallback(async (agentId: string) => {
    try {
      const res = await apiFetch(`/api/agents/${agentId}`, { method: 'DELETE' });
      if (!res.ok) return;
      if (selectedAgentId === agentId) {
        const remaining = agents.filter(a => a.id !== agentId);
        const nextOnline = remaining.find(a => a.online);
        setSelectedAgentId(nextOnline?.id ?? remaining[0]?.id ?? null);
      }
      await fetchAgents();
    } catch {
      // ignore
    }
  }, [selectedAgentId, agents, fetchAgents]);

  const agentsMap = useMemo(() => new Map(agents.map(a => [a.id, a])), [agents]);
  const selectedAgent = useMemo(
    () => (selectedAgentId ? agentsMap.get(selectedAgentId) ?? null : null),
    [agentsMap, selectedAgentId],
  );

  return {
    agents,
    selectedAgent,
    selectedAgentId,
    selectAgent,
    deleteAgent,
    fetchAgents,
  };
}
