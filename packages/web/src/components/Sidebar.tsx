import { useState } from 'react';
import type { AgentInfo } from '../hooks/useAgentStore';
import { useTheme } from '../hooks/useTheme';
import { UI_FONT } from '../lib/theme';
import * as Icons from '../lib/icons';
import { StatusDot, Kbd, IconButton, getOsLabel } from './primitives';

const SIDEBAR_WIDTH = 260;
const SIDEBAR_COLLAPSED_WIDTH = 58;
const ICON_STROKE = 1.75;

export type AppView = 'dashboard' | 'terminal' | 'agents' | 'audit' | 'settings' | 'users';

interface SidebarProps {
  agents: AgentInfo[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
  currentView: AppView;
  onViewChange: (view: AppView) => void;
  onLogout: () => void;
  username: string;
  userRole: string;
  relayLatencyMs: number | null;
  drawerMode?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
  onOpenPalette: () => void;
}

export function Sidebar({
  agents,
  selectedAgentId,
  onSelectAgent,
  currentView,
  onViewChange,
  onLogout,
  username,
  userRole,
  relayLatencyMs,
  drawerMode,
  isOpen,
  onClose,
  onOpenPalette,
}: SidebarProps) {
  const { uiMode, setUIMode } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const effectiveCollapsed = drawerMode ? false : collapsed;
  const width = effectiveCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;

  const resolved = uiMode === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : uiMode;

  const handleSelectAgent = (agentId: string) => {
    onSelectAgent(agentId);
    if (drawerMode) onClose?.();
  };

  const handleViewChange = (view: AppView) => {
    onViewChange(view);
    if (drawerMode) onClose?.();
  };

  const toggleTheme = () => setUIMode(resolved === 'dark' ? 'light' : 'dark');

  const navItem = (
    key: string,
    Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>,
    label: string,
    onClick: () => void,
    active: boolean,
    trailing?: React.ReactNode,
  ) => {
    const isHover = hoveredKey === key;
    return (
      <button
        key={key}
        type="button"
        onClick={onClick}
        onMouseEnter={() => setHoveredKey(key)}
        onMouseLeave={() => setHoveredKey(null)}
        title={effectiveCollapsed ? label : undefined}
        aria-label={effectiveCollapsed ? label : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          padding: effectiveCollapsed ? '10px 0' : '8px 12px',
          justifyContent: effectiveCollapsed ? 'center' : 'flex-start',
          borderRadius: 8,
          background: active
            ? 'var(--surface-active)'
            : isHover
              ? 'var(--surface-alt)'
              : 'transparent',
          color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
          fontSize: 13,
          fontWeight: active ? 500 : 400,
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
        }}
      >
        <Icon size={16} strokeWidth={active ? 2 : ICON_STROKE} />
        {!effectiveCollapsed && <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>}
        {!effectiveCollapsed && trailing}
      </button>
    );
  };

  const sidebarContent = (
    <aside
      style={{
        width,
        minWidth: width,
        maxWidth: width,
        ...(drawerMode
          ? {
              position: 'fixed' as const,
              top: 0,
              left: 0,
              bottom: 0,
              zIndex: 51,
              transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 0.25s ease',
              boxShadow: isOpen ? '4px 0 24px rgba(0,0,0,0.15)' : 'none',
            }
          : { transition: 'width 0.2s ease, min-width 0.2s ease, max-width 0.2s ease' }),
        height: '100%',
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        fontFamily: UI_FONT,
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      {/* Brand + collapse/expand toggle (always at top so the button stays where the user clicked it) */}
      <div
        style={{
          padding: effectiveCollapsed ? '16px 0 12px' : '16px 16px 12px',
          display: 'flex',
          flexDirection: effectiveCollapsed ? 'column' : 'row',
          alignItems: 'center',
          justifyContent: effectiveCollapsed ? 'center' : 'space-between',
          gap: effectiveCollapsed ? 8 : 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              background: 'var(--accent)',
              display: 'grid',
              placeItems: 'center',
              color: 'var(--accent-text)',
              fontFamily: '"JetBrains Mono Variable", monospace',
              fontSize: 12,
              fontWeight: 700,
              boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.15)',
              flexShrink: 0,
            }}
          >
            ›_
          </div>
          {!effectiveCollapsed && (
            <div style={{ lineHeight: 1.1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>
                RemoteTTYs
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>v0.5.3</div>
            </div>
          )}
        </div>
        {!drawerMode && (
          <IconButton
            size={26}
            tone="muted"
            onClick={() => setCollapsed((c) => !c)}
            title={effectiveCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={effectiveCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {effectiveCollapsed ? <Icons.ChevronRight size={15} /> : <Icons.ChevronLeft size={15} />}
          </IconButton>
        )}
      </div>

      {/* Primary nav */}
      <div
        style={{
          padding: effectiveCollapsed ? '0 6px' : '0 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {navItem('dashboard', Icons.Layout, 'Dashboard', () => handleViewChange('dashboard'), currentView === 'dashboard')}
        {navItem(
          'cmd',
          Icons.Search,
          'Quick connect',
          () => {
            onOpenPalette();
            if (drawerMode) onClose?.();
          },
          false,
          <span style={{ display: 'flex', gap: 2 }}>
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>,
        )}
      </div>

      {/* Machines section label */}
      <div
        style={{
          padding: effectiveCollapsed ? '18px 0 6px' : '18px 16px 6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: effectiveCollapsed ? 'center' : 'space-between',
        }}
      >
        {!effectiveCollapsed ? (
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              color: 'var(--text-muted)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Machines · {agents.length}
          </span>
        ) : (
          <div style={{ width: 24, height: 1, background: 'var(--border)' }} />
        )}
      </div>

      {/* Agent list */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: effectiveCollapsed ? '0 6px' : '0 10px',
        }}
      >
        {agents.length === 0 && !effectiveCollapsed && (
          <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '8px 12px' }}>
            No agents yet
          </div>
        )}
        {agents.map((agent) => {
          const active = agent.id === selectedAgentId && currentView === 'terminal';
          const isHover = hoveredKey === agent.id;
          const totalLatency =
            agent.online && agent.latencyMs !== null
              ? agent.latencyMs + (relayLatencyMs ?? 0)
              : null;
          const latColor =
            totalLatency == null
              ? 'var(--text-muted)'
              : totalLatency < 60
                ? 'var(--online)'
                : totalLatency < 150
                  ? 'var(--warning)'
                  : 'var(--error)';

          return (
            <button
              key={agent.id}
              type="button"
              onClick={() => handleSelectAgent(agent.id)}
              onMouseEnter={() => setHoveredKey(agent.id)}
              onMouseLeave={() => setHoveredKey(null)}
              title={effectiveCollapsed ? agent.name : undefined}
              aria-label={effectiveCollapsed ? agent.name : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: effectiveCollapsed ? '8px 0' : '9px 10px',
                justifyContent: effectiveCollapsed ? 'center' : 'flex-start',
                borderRadius: 8,
                marginBottom: 1,
                position: 'relative',
                background: active
                  ? 'var(--surface-active)'
                  : isHover
                    ? 'var(--surface-alt)'
                    : 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
              }}
            >
              {active && !effectiveCollapsed && (
                <span
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 8,
                    bottom: 8,
                    width: 2,
                    background: 'var(--accent)',
                    borderRadius: 2,
                  }}
                />
              )}
              <StatusDot online={agent.online} size={7} />
              {!effectiveCollapsed && (
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: agent.online ? 'var(--text-primary)' : 'var(--text-muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {agent.name}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--text-secondary)',
                      marginTop: 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontFamily: '"JetBrains Mono Variable", monospace',
                    }}
                  >
                    <span>{getOsLabel(agent.os)}</span>
                    {agent.sessions.length > 0 && <span>· {agent.sessions.length}</span>}
                    {totalLatency !== null && (
                      <span
                        style={{ color: latColor }}
                        title={`Web ↔ Relay: ${relayLatencyMs ?? '?'}ms\nRelay ↔ Agent: ${agent.latencyMs}ms`}
                      >
                        · {totalLatency}ms
                      </span>
                    )}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom nav */}
      <div
        style={{
          borderTop: '1px solid var(--border)',
          padding: effectiveCollapsed ? '8px 6px' : '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {userRole === 'admin' &&
          navItem('users', Icons.Users, 'Users', () => handleViewChange('users'), currentView === 'users')}
        {userRole === 'admin' &&
          navItem('agents', Icons.Key, 'Agents', () => handleViewChange('agents'), currentView === 'agents')}
        {navItem('audit', Icons.ScrollText, 'Audit Log', () => handleViewChange('audit'), currentView === 'audit')}
        {navItem('settings', Icons.Settings, 'Settings', () => handleViewChange('settings'), currentView === 'settings')}
      </div>

      {/* User row + theme toggle */}
      <div
        style={{
          borderTop: '1px solid var(--border)',
          padding: effectiveCollapsed ? '10px 6px' : '10px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          justifyContent: effectiveCollapsed ? 'center' : 'space-between',
        }}
      >
        {!effectiveCollapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, flex: 1 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: 'var(--accent-soft)',
                display: 'grid',
                placeItems: 'center',
                color: 'var(--accent)',
                fontSize: 12,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {username ? username[0].toUpperCase() : '?'}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {username || 'User'}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{userRole}</div>
            </div>
          </div>
        )}
        <div
          style={{
            display: 'flex',
            // Collapsed sidebar is 58px wide — two 28px buttons + gap can't sit horizontally,
            // so stack them vertically. Expanded width can fit them in a row.
            flexDirection: effectiveCollapsed ? 'column' : 'row',
            gap: effectiveCollapsed ? 4 : 2,
          }}
        >
          <IconButton
            size={28}
            onClick={toggleTheme}
            title={`Theme: ${resolved === 'dark' ? 'Dark' : 'Light'} (click to toggle)`}
            aria-label="Toggle theme"
          >
            {resolved === 'dark' ? <Icons.Sun size={15} /> : <Icons.Moon size={15} />}
          </IconButton>
          <IconButton
            size={28}
            tone="danger"
            onClick={() => {
              if (drawerMode) onClose?.();
              onLogout();
            }}
            title="Logout"
            aria-label="Logout"
          >
            <Icons.LogOut size={15} />
          </IconButton>
        </div>
      </div>
    </aside>
  );

  if (drawerMode) {
    return (
      <>
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'var(--overlay)',
            zIndex: 50,
            opacity: isOpen ? 1 : 0,
            pointerEvents: isOpen ? 'auto' : 'none',
            transition: 'opacity 0.25s ease',
          }}
        />
        {sidebarContent}
      </>
    );
  }

  return sidebarContent;
}
