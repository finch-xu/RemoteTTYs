import { useState } from 'react';
import { Settings, Sun, Moon, SunMoon, LogOut, ChevronLeft, ChevronRight, ScrollText, Users } from 'lucide-react';
import type { AgentInfo } from '../hooks/useAgentStore';
import { useTheme } from '../hooks/useTheme';
import { UI_FONT, MONO_FONT } from '../lib/theme';
import type { UITheme, UIThemeMode } from '../lib/theme';

const SIDEBAR_WIDTH = 200;
const SIDEBAR_COLLAPSED_WIDTH = 48;
const ICON_STROKE = 1.75;

interface SidebarProps {
  agents: AgentInfo[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
  currentView: 'terminal' | 'settings' | 'audit' | 'users';
  onViewChange: (view: 'terminal' | 'settings' | 'audit' | 'users') => void;
  onLogout: () => void;
  userRole: string;
  relayLatencyMs: number | null;
  drawerMode?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
}

function getOsLabel(os: string): string {
  if (os === 'darwin') return 'macOS';
  if (os === 'linux') return 'Linux';
  if (os === 'windows') return 'Windows';
  return os;
}

function getLatencyColor(latencyMs: number | null, ui: UITheme): string {
  if (latencyMs === null) return ui.textMuted;
  if (latencyMs < 100) return ui.online;
  if (latencyMs < 300) return ui.warning;
  return ui.error;
}

const themeModeIcons: Record<UIThemeMode, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: SunMoon,
};

const themeModeLabels: Record<UIThemeMode, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'Auto',
};

const themeCycle: UIThemeMode[] = ['light', 'dark', 'system'];

const btnReset: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0, margin: 0,
  font: 'inherit', cursor: 'pointer', textAlign: 'left' as const,
};

export function Sidebar({ agents, selectedAgentId, onSelectAgent, currentView, onViewChange, onLogout, userRole, relayLatencyMs, drawerMode, isOpen, onClose }: SidebarProps) {
  const { ui, uiMode, setUIMode } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const cycleTheme = () => {
    const idx = themeCycle.indexOf(uiMode);
    setUIMode(themeCycle[(idx + 1) % themeCycle.length]);
  };

  // In drawer mode, always use expanded width
  const effectiveCollapsed = drawerMode ? false : collapsed;
  const width = effectiveCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;

  const itemStyle = (isActive: boolean, isHovered: boolean): React.CSSProperties => ({
    ...btnReset,
    display: 'flex', alignItems: 'center', gap: 8,
    width: `calc(100% - 12px)`,
    padding: effectiveCollapsed ? '7px 0' : '7px 14px',
    justifyContent: effectiveCollapsed ? 'center' : 'flex-start',
    borderRadius: 6, margin: '1px 6px',
    background: isActive ? ui.surfaceActive : isHovered ? ui.surfaceAlt : 'transparent',
    boxSizing: 'border-box',
  });

  const ThemeIcon = themeModeIcons[uiMode];

  const handleSelectAgent = (agentId: string) => {
    onSelectAgent(agentId);
    if (drawerMode) onClose?.();
  };

  const handleViewChange = (view: 'terminal' | 'settings' | 'audit' | 'users') => {
    onViewChange(view);
    if (drawerMode) onClose?.();
  };

  const handleLogout = () => {
    onLogout();
    if (drawerMode) onClose?.();
  };

  const sidebarContent = (
    <div style={{
      width: SIDEBAR_WIDTH, minWidth: SIDEBAR_WIDTH,
      ...(drawerMode ? {
        position: 'fixed' as const, top: 0, left: 0, bottom: 0, zIndex: 51,
        transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.25s ease',
        boxShadow: isOpen ? '4px 0 24px rgba(0,0,0,0.15)' : 'none',
      } : {
        width, minWidth: width,
        transition: 'width 0.2s ease, min-width 0.2s ease',
      }),
      background: ui.surface, borderRight: `1px solid ${ui.border}`,
      display: 'flex', flexDirection: 'column' as const, fontFamily: UI_FONT,
      userSelect: 'none' as const, overflow: 'hidden',
    }}>
      <div style={{ padding: effectiveCollapsed ? '10px 0 8px' : '14px 14px 8px', display: 'flex', alignItems: 'center', justifyContent: effectiveCollapsed ? 'center' : 'space-between' }}>
        {!effectiveCollapsed && (
          <span style={{ fontSize: 11, fontWeight: 600, color: ui.textSecondary, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            Machines
          </span>
        )}
        {!drawerMode && (
          <button
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{ ...btnReset, color: ui.textSecondary, lineHeight: 1, padding: '2px 4px', borderRadius: 4 }}
          >
            {collapsed ? <ChevronRight size={16} strokeWidth={ICON_STROKE} /> : <ChevronLeft size={16} strokeWidth={ICON_STROKE} />}
          </button>
        )}
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {agents.length === 0 && !effectiveCollapsed && (
          <div style={{ color: ui.textMuted, fontSize: 12, padding: '8px 14px' }}>
            No agents
          </div>
        )}
        {agents.map(agent => (
          <button
            key={agent.id}
            style={itemStyle(
              agent.id === selectedAgentId && currentView === 'terminal',
              hoveredId === agent.id
            )}
            onClick={() => handleSelectAgent(agent.id)}
            onMouseEnter={() => setHoveredId(agent.id)}
            onMouseLeave={() => setHoveredId(null)}
            title={effectiveCollapsed ? `${agent.name} (${getOsLabel(agent.os)})${agent.online && agent.latencyMs !== null ? ` \u00b7 ${(agent.latencyMs + (relayLatencyMs ?? 0))}ms` : ''}` : undefined}
            aria-label={effectiveCollapsed ? `${agent.name} (${getOsLabel(agent.os)})` : undefined}
          >
            <span style={{ color: agent.online ? ui.online : ui.textMuted, fontSize: 10, flexShrink: 0 }}>{'\u25cf'}</span>
            {!effectiveCollapsed && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: agent.online ? ui.textPrimary : ui.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {agent.name}
                </div>
                <div style={{ fontSize: 11, color: ui.textSecondary, fontFamily: MONO_FONT }}>
                  {getOsLabel(agent.os)}
                  {agent.sessions.length > 0 && ` \u00b7 ${agent.sessions.length}`}
                  {agent.online && agent.latencyMs !== null && (
                    <span
                      style={{ color: getLatencyColor(agent.latencyMs + (relayLatencyMs ?? 0), ui), cursor: 'default' }}
                      title={`Web \u2194 Relay: ${relayLatencyMs ?? '?'}ms\nRelay \u2194 Agent: ${agent.latencyMs}ms`}
                    >
                      {` \u00b7 ${agent.latencyMs + (relayLatencyMs ?? 0)}ms`}
                    </span>
                  )}
                </div>
              </div>
            )}
          </button>
        ))}
      </div>
      <div style={{ borderTop: `1px solid ${ui.border}`, padding: '4px 0' }}>
        {userRole === 'admin' && (
          <button
            style={itemStyle(currentView === 'users', hoveredId === '_users')}
            onClick={() => handleViewChange('users')}
            onMouseEnter={() => setHoveredId('_users')}
            onMouseLeave={() => setHoveredId(null)}
            title={effectiveCollapsed ? 'Users' : undefined}
            aria-label={effectiveCollapsed ? 'Users' : undefined}
          >
            <Users size={16} strokeWidth={ICON_STROKE} color={ui.textSecondary} />
            {!effectiveCollapsed && <span style={{ fontSize: 13, color: ui.textSecondary }}>Users</span>}
          </button>
        )}
        <button
          style={itemStyle(currentView === 'audit', hoveredId === '_audit')}
          onClick={() => handleViewChange('audit')}
          onMouseEnter={() => setHoveredId('_audit')}
          onMouseLeave={() => setHoveredId(null)}
          title={effectiveCollapsed ? 'Audit Log' : undefined}
          aria-label={effectiveCollapsed ? 'Audit Log' : undefined}
        >
          <ScrollText size={16} strokeWidth={ICON_STROKE} color={ui.textSecondary} />
          {!effectiveCollapsed && <span style={{ fontSize: 13, color: ui.textSecondary }}>Audit Log</span>}
        </button>
        <button
          style={itemStyle(currentView === 'settings', hoveredId === '_settings')}
          onClick={() => handleViewChange('settings')}
          onMouseEnter={() => setHoveredId('_settings')}
          onMouseLeave={() => setHoveredId(null)}
          title={effectiveCollapsed ? 'Settings' : undefined}
          aria-label={effectiveCollapsed ? 'Settings' : undefined}
        >
          <Settings size={16} strokeWidth={ICON_STROKE} color={ui.textSecondary} />
          {!effectiveCollapsed && <span style={{ fontSize: 13, color: ui.textSecondary }}>Settings</span>}
        </button>
        <button
          style={itemStyle(false, hoveredId === '_theme')}
          onClick={cycleTheme}
          onMouseEnter={() => setHoveredId('_theme')}
          onMouseLeave={() => setHoveredId(null)}
          title={effectiveCollapsed ? themeModeLabels[uiMode] : undefined}
          aria-label={`Theme: ${themeModeLabels[uiMode]}`}
        >
          <ThemeIcon size={16} strokeWidth={ICON_STROKE} color={ui.textSecondary} />
          {!effectiveCollapsed && <span style={{ fontSize: 13, color: ui.textSecondary }}>{themeModeLabels[uiMode]}</span>}
        </button>
        <button
          style={itemStyle(false, hoveredId === '_logout')}
          onClick={handleLogout}
          onMouseEnter={() => setHoveredId('_logout')}
          onMouseLeave={() => setHoveredId(null)}
          title={effectiveCollapsed ? 'Logout' : undefined}
          aria-label={effectiveCollapsed ? 'Logout' : undefined}
        >
          <LogOut size={16} strokeWidth={ICON_STROKE} color={ui.textSecondary} />
          {!effectiveCollapsed && <span style={{ fontSize: 13, color: ui.textSecondary }}>Logout</span>}
        </button>
      </div>
    </div>
  );

  if (drawerMode) {
    return (
      <>
        {/* Backdrop overlay */}
        <div
          onClick={onClose}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: ui.overlay, zIndex: 50,
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
