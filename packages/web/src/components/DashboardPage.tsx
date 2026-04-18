import { useEffect, useState } from 'react';
import type { AgentInfo } from '../hooks/useAgentStore';
import { apiFetch } from '../lib/api';
import { relativeTime } from '../lib/audit';
import {
  Page,
  SectionHeader,
  Card,
  Chip,
  Kbd,
  Button,
  StatusDot,
  ActionBadge,
  getOsLabel,
  getOsGlyph,
} from './primitives';
import * as Icons from '../lib/icons';

interface AuditLog {
  id: number;
  ts: string;
  action: string;
  user: string | null;
  detail: string | null;
}

function MiniStat({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'neutral' | 'accent' | 'online';
}) {
  const color =
    tone === 'accent' ? 'var(--accent)' : tone === 'online' ? 'var(--online)' : 'var(--text-primary)';
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          marginTop: 3,
          letterSpacing: '-0.02em',
          color,
          fontFamily: 'var(--ui-font, inherit)',
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

function MachineCard({
  agent,
  onOpen,
  relayLatencyMs,
}: {
  agent: AgentInfo;
  onOpen: (id: string) => void;
  relayLatencyMs: number | null;
}) {
  const [hovered, setHovered] = useState(false);
  const totalLatency =
    agent.online && agent.latencyMs !== null ? agent.latencyMs + (relayLatencyMs ?? 0) : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => agent.online && onOpen(agent.id)}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && agent.online) {
          e.preventDefault();
          onOpen(agent.id);
        }
      }}
      style={{
        background: 'var(--surface)',
        border: `1px solid ${hovered ? 'var(--border-strong)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-md)',
        padding: 18,
        cursor: agent.online ? 'pointer' : 'default',
        opacity: agent.online ? 1 : 0.55,
        boxShadow: hovered ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transition: 'border-color 0.15s, box-shadow 0.15s, opacity 0.15s',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: 'var(--surface-alt)',
              display: 'grid',
              placeItems: 'center',
              fontSize: 15,
              color: agent.online ? 'var(--text-primary)' : 'var(--text-muted)',
              fontFamily: '"JetBrains Mono Variable", monospace',
              flexShrink: 0,
            }}
          >
            {getOsGlyph(agent.os)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: '-0.01em',
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {agent.name}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 1 }}>
              {getOsLabel(agent.os)}
            </div>
          </div>
        </div>
        <StatusDot online={agent.online} size={8} />
      </div>

      {agent.online ? (
        <>
          {/* CPU/MEM/NET placeholder — Go agent doesn't report resource samples yet. */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 10,
              marginTop: 16,
            }}
          >
            {['CPU', 'MEM', 'NET'].map((label) => (
              <div key={label}>
                <div
                  style={{
                    fontSize: 10.5,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontWeight: 600,
                  }}
                >
                  {label}
                </div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    fontFamily: '"JetBrains Mono Variable", monospace',
                    color: 'var(--text-muted)',
                    marginTop: 2,
                  }}
                >
                  —
                </div>
                <div
                  style={{
                    height: 18,
                    background:
                      'linear-gradient(90deg, var(--surface-alt) 0%, var(--surface-active) 50%, var(--surface-alt) 100%)',
                    borderRadius: 2,
                    marginTop: 4,
                    opacity: 0.5,
                  }}
                />
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {agent.sessions.length > 0 && (
                <Chip tone="accent" size="sm">
                  {agent.sessions.length} active
                </Chip>
              )}
              {totalLatency !== null && (
                <Chip tone="outline" size="sm">
                  {totalLatency}ms
                </Chip>
              )}
            </div>
            <Button
              variant="soft"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onOpen(agent.id);
              }}
              style={{ color: 'var(--accent)', background: 'var(--accent-soft)' }}
            >
              Open <Icons.ArrowUpRight size={12} />
            </Button>
          </div>
        </>
      ) : (
        <div style={{ marginTop: 16, padding: '14px 0', textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Offline · last seen {relativeTime(agent.lastSeen)}
          </div>
        </div>
      )}
    </div>
  );
}

interface DashboardPageProps {
  agents: AgentInfo[];
  relayLatencyMs: number | null;
  onOpenAgent: (id: string) => void;
  onOpenPalette: () => void;
  onOpenAgentsPage: () => void;
  userRole: string;
}

export function DashboardPage({
  agents,
  relayLatencyMs,
  onOpenAgent,
  onOpenPalette,
  onOpenAgentsPage,
  userRole,
}: DashboardPageProps) {
  const [recent, setRecent] = useState<AuditLog[]>([]);
  const online = agents.filter((a) => a.online);
  const totalSessions = agents.reduce((s, a) => s + a.sessions.length, 0);
  const latAgents = online.filter((a) => a.latencyMs !== null);
  const avgLat = latAgents.length
    ? Math.round(
        latAgents.reduce((s, a) => s + (a.latencyMs ?? 0), 0) / latAgents.length +
          (relayLatencyMs ?? 0),
      )
    : null;

  useEffect(() => {
    if (userRole !== 'admin') return;
    apiFetch('/api/audit?limit=6')
      .then((r) => (r.ok ? r.json() : { logs: [] }))
      .then((data) => setRecent(data.logs ?? []))
      .catch(() => setRecent([]));
  }, [userRole]);

  return (
    <Page
      title="Dashboard"
      subtitle="All registered machines at a glance"
      actions={
        <>
          <Button variant="ghost" icon={Icons.Search} onClick={onOpenPalette}>
            Quick connect{' '}
            <span style={{ marginLeft: 6, opacity: 0.7, display: 'inline-flex', gap: 2 }}>
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </span>
          </Button>
          {userRole === 'admin' && (
            <Button variant="primary" icon={Icons.Plus} onClick={onOpenAgentsPage}>
              New agent
            </Button>
          )}
        </>
      }
    >
      <Card padding={20} style={{ marginBottom: 20, display: 'flex', gap: 0, alignItems: 'center' }}>
        <MiniStat
          label="Online"
          value={`${online.length} / ${agents.length}`}
          sub="agents connected"
          tone="online"
        />
        <div style={{ width: 1, height: 44, background: 'var(--border)', margin: '0 24px' }} />
        <MiniStat
          label="Active sessions"
          value={totalSessions}
          sub={totalSessions ? 'across all machines' : 'none'}
        />
        <div style={{ width: 1, height: 44, background: 'var(--border)', margin: '0 24px' }} />
        <MiniStat
          label="Avg latency"
          value={avgLat !== null ? `${avgLat}ms` : '—'}
          sub="web ↔ relay ↔ agent"
        />
        <div style={{ width: 1, height: 44, background: 'var(--border)', margin: '0 24px' }} />
        <MiniStat
          label="Relay"
          value={relayLatencyMs !== null ? 'OK' : '—'}
          sub={relayLatencyMs !== null ? `${relayLatencyMs}ms rtt` : 'disconnected'}
          tone={relayLatencyMs !== null ? 'online' : 'neutral'}
        />
      </Card>

      <SectionHeader title="Machines" subtitle={`${agents.length} registered`} />
      {agents.length === 0 ? (
        <Card padding={32} style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            No machines yet. {userRole === 'admin' ? 'Create an agent token to connect your first machine.' : 'Ask an admin to invite your first agent.'}
          </div>
          {userRole === 'admin' && (
            <div style={{ marginTop: 14 }}>
              <Button variant="primary" icon={Icons.Plus} onClick={onOpenAgentsPage}>
                New agent
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 14,
          }}
        >
          {agents.map((a) => (
            <MachineCard key={a.id} agent={a} onOpen={onOpenAgent} relayLatencyMs={relayLatencyMs} />
          ))}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.4fr 1fr',
          gap: 16,
          marginTop: 28,
        }}
      >
        {userRole === 'admin' && (
          <div>
            <SectionHeader title="Recent activity" />
            <Card padding={0}>
              {recent.length === 0 ? (
                <div style={{ padding: 18, fontSize: 12.5, color: 'var(--text-muted)' }}>
                  No recent events yet.
                </div>
              ) : (
                recent.map((r, i) => (
                  <div
                    key={r.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '11px 18px',
                      borderBottom:
                        i < recent.length - 1 ? '1px solid var(--border)' : 'none',
                      fontSize: 12.5,
                    }}
                  >
                    <ActionBadge action={r.action} minWidth={100} />
                    <span
                      style={{
                        flex: 1,
                        color: 'var(--text-secondary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {r.detail || r.user || '—'}
                    </span>
                    <span
                      className="mono"
                      style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}
                    >
                      {relativeTime(r.ts)}
                    </span>
                  </div>
                ))
              )}
            </Card>
          </div>
        )}
        <div style={{ gridColumn: userRole === 'admin' ? undefined : '1 / -1' }}>
          <SectionHeader title="Shortcuts" />
          <Card padding={0}>
            {[
              { k: ['⌘', 'K'], label: 'Quick connect to any agent' },
              { k: ['⌘', 'T'], label: 'New terminal tab' },
              { k: ['⌘', 'W'], label: 'Close current tab' },
              { k: ['⌘', '\\'], label: 'Split terminal' },
              { k: ['Esc'], label: 'Close dialogs / palette' },
            ].map((s, i, arr) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 18px',
                  borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{s.label}</span>
                <span style={{ display: 'flex', gap: 3 }}>
                  {s.k.map((x, j) => (
                    <Kbd key={j}>{x}</Kbd>
                  ))}
                </span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </Page>
  );
}
