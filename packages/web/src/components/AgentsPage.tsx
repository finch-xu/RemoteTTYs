import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { relativeTime } from '../lib/audit';
import {
  Page,
  Card,
  Button,
  Chip,
  IOSToggle,
  SectionHeader,
  CopyButton,
} from './primitives';
import * as Icons from '../lib/icons';
import { OnboardWizard } from './OnboardWizard';

interface TokenInfo {
  id: number;
  token: string;
  label: string;
  notes: string;
  enabled: boolean;
  created_at: string;
  onlineAgents: string[];
}

interface AgentRecord {
  id: string;
  name: string;
  os: string;
  online: boolean;
  fingerprint: string | null;
  lastSeen: string | null;
}

interface AgentsPageProps {
  onAgentDeleted?: () => void;
}

function maskToken(t: string): string {
  if (!t) return '';
  if (t.length <= 20) return t.slice(0, 6) + '…' + t.slice(-4);
  return t.slice(0, 10) + '…' + t.slice(-8);
}

export function AgentsPage({ onAgentDeleted }: AgentsPageProps) {
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [serverKey, setServerKey] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 10-second polling writes fresh arrays every tick; JSON-hash short-circuit
  // keeps React from re-rendering tables that haven't changed.
  const prevHashRef = useRef({ tokens: '', agents: '', key: '' });

  const fetchAll = useCallback(async () => {
    try {
      const [tRes, aRes, kRes] = await Promise.all([
        apiFetch('/api/tokens'),
        apiFetch('/api/agents'),
        apiFetch('/api/server-key'),
      ]);
      if (tRes.ok) {
        const data = await tRes.json();
        const hash = JSON.stringify(data);
        if (hash !== prevHashRef.current.tokens) {
          prevHashRef.current.tokens = hash;
          setTokens(data);
        }
      }
      if (aRes.ok) {
        const data = await aRes.json();
        const hash = JSON.stringify(data);
        if (hash !== prevHashRef.current.agents) {
          prevHashRef.current.agents = hash;
          setAgents(data);
        }
      }
      if (kRes.ok) {
        const data = await kRes.json();
        if (data.publicKey !== prevHashRef.current.key) {
          prevHashRef.current.key = data.publicKey;
          setServerKey(data.publicKey);
        }
      }
    } catch {
      // network errors leave previous state in place
    }
  }, []);

  useEffect(() => {
    fetchAll();
    timerRef.current = setInterval(fetchAll, 10_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchAll]);

  const handleToggle = async (id: number, enabled: boolean) => {
    await apiFetch(`/api/tokens/${id}/enabled`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    fetchAll();
  };

  const handleDelete = async (token: string, label: string) => {
    if (!confirm(`Revoke token "${label}"? Connected agents will be disconnected.`)) return;
    await apiFetch(`/api/tokens/${token}`, { method: 'DELETE' });
    fetchAll();
  };

  const handleResetKey = async () => {
    if (
      !confirm(
        'Reset server key? All agents will need their server_key config updated. Connected agents stay connected until they reconnect.',
      )
    )
      return;
    const res = await apiFetch('/api/server-key/reset', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      setServerKey(data.publicKey);
    }
  };

  const handleDeleteAgent = async (id: string, name: string) => {
    if (!confirm(`Delete agent "${name}"? This removes it from the registry.`)) return;
    await apiFetch(`/api/agents/${id}`, { method: 'DELETE' });
    fetchAll();
    onAgentDeleted?.();
  };

  const handleResetFingerprint = async (id: string, name: string) => {
    if (!confirm(`Reset fingerprint for "${name}"? It will re-register on next connect.`)) return;
    await apiFetch(`/api/agents/${id}/fingerprint`, { method: 'DELETE' });
    fetchAll();
  };

  return (
    <>
      <Page
        title="Agents"
        subtitle="Server key, connection tokens, and registered machines"
        actions={
          <Button variant="primary" icon={Icons.Plus} onClick={() => setWizardOpen(true)}>
            New agent
          </Button>
        }
      >
        <SectionHeader
          title="Server public key"
          subtitle="Agents pin this key to verify they're talking to the right relay."
          actions={
            <Button variant="danger" size="sm" onClick={handleResetKey}>
              Reset key
            </Button>
          }
        />
        <Card padding={16} style={{ marginBottom: 28 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 10,
            }}
          >
            <pre
              style={{
                margin: 0,
                fontFamily: '"JetBrains Mono Variable", monospace',
                fontSize: 11.5,
                color: 'var(--text-secondary)',
                background: 'var(--surface-alt)',
                padding: '10px 12px',
                borderRadius: 8,
                flex: 1,
                overflow: 'auto',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {serverKey || 'Loading…'}
            </pre>
            {serverKey && <CopyButton text={serverKey} />}
          </div>
        </Card>

        <SectionHeader
          title="Connection tokens"
          subtitle={`${tokens.length} token${tokens.length === 1 ? '' : 's'}`}
        />
        <Card padding={0} style={{ marginBottom: 28 }}>
          {tokens.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
              No tokens yet. Click <b>New agent</b> to create one.
            </div>
          ) : (
            tokens.map((t, i) => (
              <div
                key={t.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.2fr 1.4fr 0.7fr auto auto',
                  alignItems: 'center',
                  gap: 14,
                  padding: '14px 18px',
                  borderBottom: i < tokens.length - 1 ? '1px solid var(--border)' : 'none',
                  fontSize: 13,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t.label}
                  </div>
                  {t.onlineAgents.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      <Chip tone="online" size="sm">
                        {t.onlineAgents.length} online
                      </Chip>
                    </div>
                  )}
                </div>
                <div
                  className="mono"
                  style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden' }}
                >
                  {maskToken(t.token)}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                  {relativeTime(t.created_at, '—')}
                </div>
                <IOSToggle
                  checked={t.enabled}
                  onChange={(v) => handleToggle(t.id, v)}
                  ariaLabel={`${t.enabled ? 'Disable' : 'Enable'} token ${t.label}`}
                />
                <Button variant="danger" size="sm" onClick={() => handleDelete(t.token, t.label)}>
                  Revoke
                </Button>
              </div>
            ))
          )}
        </Card>

        <SectionHeader title="Registered machines" subtitle={`${agents.length} total`} />
        <Card padding={0}>
          {agents.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
              No machines registered yet.
            </div>
          ) : (
            agents.map((a, i) => (
              <div
                key={a.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.2fr 0.7fr 1.4fr 0.8fr auto',
                  alignItems: 'center',
                  gap: 14,
                  padding: '14px 18px',
                  borderBottom: i < agents.length - 1 ? '1px solid var(--border)' : 'none',
                  fontSize: 13,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: a.online ? 'var(--online)' : 'var(--text-muted)',
                      boxShadow: a.online ? '0 0 0 3px var(--online-soft)' : 'none',
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {a.name}
                  </span>
                </div>
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{a.os}</span>
                <span
                  className="mono"
                  style={{
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={a.fingerprint || undefined}
                >
                  {a.fingerprint ? a.fingerprint.slice(0, 24) + '…' : '—'}
                </span>
                <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                  {a.online ? 'online' : `last ${relativeTime(a.lastSeen, '—')}`}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button variant="ghost" size="sm" onClick={() => handleResetFingerprint(a.id, a.name)}>
                    Reset fp
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => handleDeleteAgent(a.id, a.name)}>
                    Delete
                  </Button>
                </div>
              </div>
            ))
          )}
        </Card>
      </Page>

      <OnboardWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onTokenCreated={fetchAll}
      />
    </>
  );
}
