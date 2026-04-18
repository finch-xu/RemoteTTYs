import { useEffect, useRef, useState, useMemo } from 'react';
import type { AgentInfo } from '../hooks/useAgentStore';
import type { AppView } from './Sidebar';
import { StatusDot, Kbd } from './primitives';
import * as Icons from '../lib/icons';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  agents: AgentInfo[];
  onSelectAgent: (id: string) => void;
  onNavigate: (view: AppView) => void;
  userRole: string;
}

interface PaletteItem {
  group: 'Machines' | 'Pages';
  key: string;
  label: string;
  sub?: string;
  online?: boolean;
  run: () => void;
  icon?: React.ComponentType<{ size?: number }>;
}

function fuzzyMatch(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (!q) return 1;
  if (t.includes(q)) return 2 - t.indexOf(q) / t.length;
  // Token match (substring of any word)
  for (const word of t.split(/\W+/)) {
    if (word.startsWith(q)) return 1;
  }
  return 0;
}

export function CommandPalette({
  open,
  onClose,
  agents,
  onSelectAgent,
  onNavigate,
  userRole,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo<PaletteItem[]>(() => {
    const machines: PaletteItem[] = agents.map((a) => ({
      group: 'Machines',
      key: `agent:${a.id}`,
      label: a.name,
      sub: `${a.os}${a.online ? ' · online' : ' · offline'}`,
      online: a.online,
      run: () => {
        if (a.online) {
          onSelectAgent(a.id);
          onClose();
        }
      },
      icon: Icons.Terminal,
    }));

    const pages: PaletteItem[] = [
      { group: 'Pages', key: 'page:dashboard', label: 'Dashboard', run: () => { onNavigate('dashboard'); onClose(); }, icon: Icons.Layout },
      { group: 'Pages', key: 'page:audit', label: 'Audit Log', run: () => { onNavigate('audit'); onClose(); }, icon: Icons.ScrollText },
      { group: 'Pages', key: 'page:settings', label: 'Settings', run: () => { onNavigate('settings'); onClose(); }, icon: Icons.Settings },
    ];
    if (userRole === 'admin') {
      pages.push({ group: 'Pages', key: 'page:users', label: 'Users', run: () => { onNavigate('users'); onClose(); }, icon: Icons.Users });
      pages.push({ group: 'Pages', key: 'page:agents', label: 'Agents', run: () => { onNavigate('agents'); onClose(); }, icon: Icons.Key });
    }

    return [...machines, ...pages];
  }, [agents, onSelectAgent, onNavigate, onClose, userRole]);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    return items
      .map((it) => ({ it, score: Math.max(fuzzyMatch(query, it.label), fuzzyMatch(query, it.sub ?? '')) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ it }) => it);
  }, [items, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, PaletteItem[]>();
    for (const it of filtered) {
      const arr = map.get(it.group) ?? [];
      arr.push(it);
      map.set(it.group, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (selectedIndex >= filtered.length) setSelectedIndex(Math.max(0, filtered.length - 1));
  }, [filtered.length, selectedIndex]);

  useEffect(() => {
    if (!open) return;
    function handle(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(filtered.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        filtered[selectedIndex]?.run();
      }
    }
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [open, filtered, selectedIndex, onClose]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!open) return null;

  let flatIdx = -1;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--overlay)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
        animation: 'fadeIn 0.15s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-content"
        style={{
          width: 560,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 16px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <Icons.Search size={16} />
          <input
            type="text"
            value={query}
            autoFocus
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Jump to machine or page…"
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 14,
              fontFamily: '"JetBrains Mono Variable", monospace',
              color: 'var(--text-primary)',
            }}
          />
          <span style={{ display: 'flex', gap: 3 }}>
            <Kbd>Esc</Kbd>
          </span>
        </div>

        <div ref={listRef} style={{ flex: 1, overflow: 'auto', padding: '6px 0' }}>
          {grouped.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No matches
            </div>
          ) : (
            grouped.map(([group, list]) => (
              <div key={group}>
                <div
                  style={{
                    padding: '10px 18px 4px',
                    fontSize: 10.5,
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                  }}
                >
                  {group}
                </div>
                {list.map((it) => {
                  flatIdx++;
                  const active = flatIdx === selectedIndex;
                  const Icon = it.icon;
                  const localIdx = flatIdx;
                  return (
                    <div
                      key={it.key}
                      data-idx={localIdx}
                      onMouseEnter={() => setSelectedIndex(localIdx)}
                      onClick={it.run}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '9px 18px',
                        cursor: 'pointer',
                        background: active ? 'var(--surface-active)' : 'transparent',
                      }}
                    >
                      {it.online !== undefined ? (
                        <StatusDot online={it.online} size={7} />
                      ) : Icon ? (
                        <Icon size={15} />
                      ) : null}
                      <span
                        style={{
                          flex: 1,
                          fontSize: 13,
                          fontWeight: 500,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {it.label}
                      </span>
                      {it.sub && (
                        <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{it.sub}</span>
                      )}
                      {active && <Kbd>↵</Kbd>}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div
          style={{
            padding: '8px 16px',
            borderTop: '1px solid var(--border)',
            fontSize: 11,
            color: 'var(--text-muted)',
            display: 'flex',
            gap: 14,
          }}
        >
          <span>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> navigate
          </span>
          <span>
            <Kbd>↵</Kbd> select
          </span>
          <span>
            <Kbd>Esc</Kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
