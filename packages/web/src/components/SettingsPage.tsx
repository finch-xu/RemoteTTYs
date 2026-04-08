import { useState, useEffect, useCallback } from 'react';
import { CreateTokenDialog } from './CreateTokenDialog';
import { apiFetch } from '../lib/api';
import { useTheme } from '../hooks/useTheme';
import { UI_FONT, MONO_FONT, terminalThemes } from '../lib/theme';

interface TokenInfo {
  id: number;
  token: string;
  label: string;
  notes: string;
  enabled: boolean;
  created_at: string;
  onlineAgents: string[];
}

interface AgentInfo {
  id: string;
  name: string;
  os: string;
  online: boolean;
  fingerprint: string | null;
  lastSeen: string | null;
}

export function SettingsPage() {
  const { ui, terminalThemeName, setTerminalThemeName } = useTheme();
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [serverKey, setServerKey] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchTokens = useCallback(async () => {
    try {
      const res = await apiFetch('/api/tokens');
      if (res.ok) setTokens(await res.json());
    } catch {} finally { setLoading(false); }
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await apiFetch('/api/agents');
      if (res.ok) setAgents(await res.json());
    } catch {}
  }, []);

  const fetchServerKey = useCallback(async () => {
    try {
      const res = await apiFetch('/api/server-key');
      if (res.ok) {
        const data = await res.json();
        setServerKey(data.publicKey);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchTokens();
    fetchAgents();
    fetchServerKey();
    const interval = setInterval(fetchTokens, 10_000);
    return () => clearInterval(interval);
  }, [fetchTokens, fetchAgents, fetchServerKey]);

  const handleToggle = async (id: number, enabled: boolean) => {
    await apiFetch(`/api/tokens/${id}/enabled`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }),
    });
    fetchTokens();
  };

  const handleDelete = async (tokenValue: string, label: string) => {
    if (!confirm(`Delete token "${label}"? Connected agents will be disconnected.`)) return;
    await apiFetch(`/api/tokens/${tokenValue}`, { method: 'DELETE' });
    fetchTokens();
  };

  const handleCopy = async (value: string) => {
    await navigator.clipboard.writeText(value);
  };

  const handleResetFingerprint = async (agentId: string, agentName: string) => {
    if (!confirm(`Reset fingerprint for agent "${agentName}"? The agent will re-register its fingerprint on next connection.`)) return;
    await apiFetch(`/api/agents/${agentId}/fingerprint`, { method: 'DELETE' });
    fetchAgents();
  };

  return (
    <div style={{ flex: 1, padding: 28, overflow: 'auto', fontFamily: UI_FONT }}>
      {/* Terminal Theme Section */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: ui.textPrimary }}>Terminal Theme</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {terminalThemes.map(t => (
            <div
              key={t.id}
              onClick={() => setTerminalThemeName(t.id)}
              style={{
                width: 120, padding: 10, borderRadius: 10, cursor: 'pointer',
                border: `2px solid ${t.id === terminalThemeName ? ui.accent : ui.border}`,
                background: ui.surfaceAlt, transition: 'border-color 0.15s',
              }}
            >
              {/* Color preview */}
              <div style={{ height: 48, borderRadius: 6, overflow: 'hidden', marginBottom: 8, background: t.colors.background, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 8px' }}>
                <div style={{ fontSize: 9, fontFamily: MONO_FONT, color: t.colors.foreground, lineHeight: 1.4 }}>
                  <span style={{ color: t.colors.green }}>$</span> hello
                </div>
                <div style={{ fontSize: 9, fontFamily: MONO_FONT, lineHeight: 1.4 }}>
                  <span style={{ color: t.colors.blue }}>~</span>
                  <span style={{ color: t.colors.yellow }}>/</span>
                  <span style={{ color: t.colors.red }}>src</span>
                </div>
              </div>
              <div style={{ fontSize: 12, color: ui.textPrimary, textAlign: 'center', fontWeight: t.id === terminalThemeName ? 600 : 400 }}>
                {t.name}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Agent Tokens Section */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: ui.textPrimary }}>Agent Tokens</h2>
        <button style={{ background: ui.accent, border: 'none', borderRadius: 8, color: ui.accentText, padding: '8px 18px', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', fontWeight: 500 }} onClick={() => setShowCreate(true)}>
          + New Token
        </button>
      </div>

      {loading ? (
        <div style={{ color: ui.textMuted, fontSize: 13, textAlign: 'center', marginTop: 40 }}>Loading...</div>
      ) : tokens.length === 0 ? (
        <div style={{ color: ui.textMuted, fontSize: 13, textAlign: 'center', marginTop: 40 }}>
          No agent tokens yet. Create one to connect your first agent.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tokens.map(t => (
            <div key={t.id} style={{ background: ui.surface, border: `1px solid ${ui.border}`, borderRadius: 10, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ color: t.onlineAgents.length > 0 ? ui.online : ui.textMuted, fontSize: 10 }}>{'\u25cf'}</span>
                <span style={{ fontSize: 14, color: t.enabled ? ui.textPrimary : ui.textMuted, fontWeight: 500, flex: 1 }}>
                  {t.label}
                </span>
                <button
                  style={{ border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', background: t.enabled ? ui.online : ui.surfaceAlt, color: t.enabled ? '#fff' : ui.textMuted, fontWeight: 500 }}
                  onClick={() => handleToggle(t.id, !t.enabled)}
                >
                  {t.enabled ? 'Enabled' : 'Disabled'}
                </button>
                <button
                  style={{ background: 'none', border: `1px solid ${ui.border}`, borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer', color: ui.error, fontFamily: 'inherit' }}
                  onClick={() => handleDelete(t.token, t.label)}
                >
                  Delete
                </button>
              </div>

              {t.notes && <div style={{ fontSize: 13, color: ui.textSecondary, marginBottom: 6 }}>{t.notes}</div>}

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <code style={{ fontSize: 12, color: ui.textSecondary, background: ui.surfaceAlt, padding: '4px 10px', borderRadius: 6, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: MONO_FONT }}>
                  {t.token.slice(0, 16)}...{t.token.slice(-8)}
                </code>
                <button style={{ background: ui.surfaceAlt, border: `1px solid ${ui.border}`, borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer', color: ui.textPrimary, fontFamily: 'inherit' }} onClick={() => handleCopy(t.token)}>
                  Copy
                </button>
              </div>

              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: ui.textMuted, marginTop: 8 }}>
                <span>Created: {new Date(t.created_at + 'Z').toLocaleDateString()}</span>
                {t.onlineAgents.length > 0 && <span style={{ color: ui.online }}>Online: {t.onlineAgents.join(', ')}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Server Key Section */}
      {serverKey && (
        <div style={{ marginTop: 32 }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600, color: ui.textPrimary }}>Server Public Key</h2>
          <p style={{ fontSize: 13, color: ui.textSecondary, margin: '0 0 8px' }}>
            Add this key to your agent's config.yaml as <code style={{ fontFamily: MONO_FONT }}>server_key</code> to enable server identity verification.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <code style={{ fontSize: 12, color: ui.textSecondary, background: ui.surfaceAlt, padding: '8px 12px', borderRadius: 6, flex: 1, fontFamily: MONO_FONT, wordBreak: 'break-all' }}>
              {serverKey}
            </code>
            <button style={{ background: ui.surfaceAlt, border: `1px solid ${ui.border}`, borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer', color: ui.textPrimary, fontFamily: 'inherit' }} onClick={() => handleCopy(serverKey)}>
              Copy
            </button>
          </div>
        </div>
      )}

      {/* Registered Agents Section */}
      <div style={{ marginTop: 32 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: ui.textPrimary }}>Registered Agents</h2>
        {agents.length === 0 ? (
          <div style={{ color: ui.textMuted, fontSize: 13, textAlign: 'center', marginTop: 20 }}>
            No agents registered yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {agents.map(a => (
              <div key={a.id} style={{ background: ui.surface, border: `1px solid ${ui.border}`, borderRadius: 10, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ color: a.online ? ui.online : ui.textMuted, fontSize: 10 }}>{'\u25cf'}</span>
                  <span style={{ fontSize: 14, color: ui.textPrimary, fontWeight: 500, flex: 1 }}>
                    {a.name}
                  </span>
                  <span style={{ fontSize: 12, color: ui.textMuted }}>{a.os}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: ui.textMuted }}>Fingerprint:</span>
                  {a.fingerprint ? (
                    <>
                      <code
                        title={a.fingerprint}
                        style={{ fontSize: 12, color: ui.textSecondary, background: ui.surfaceAlt, padding: '2px 8px', borderRadius: 4, fontFamily: MONO_FONT }}
                      >
                        {a.fingerprint.slice(0, 8)}...
                      </code>
                      <button
                        style={{ background: 'none', border: `1px solid ${ui.border}`, borderRadius: 6, padding: '2px 10px', fontSize: 11, cursor: 'pointer', color: ui.error, fontFamily: 'inherit' }}
                        onClick={() => handleResetFingerprint(a.id, a.name)}
                      >
                        Reset
                      </button>
                    </>
                  ) : (
                    <span style={{ fontSize: 12, color: ui.textMuted, fontStyle: 'italic' }}>not yet registered</span>
                  )}
                </div>
                {a.lastSeen && (
                  <div style={{ fontSize: 11, color: ui.textMuted, marginTop: 4 }}>
                    Last seen: {new Date(a.lastSeen + 'Z').toLocaleString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateTokenDialog
          onCreated={() => { setShowCreate(false); fetchTokens(); }}
          onCancel={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
