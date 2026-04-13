import { useState } from 'react';
import { Settings, Sun, Moon, SunMoon, LogOut, ChevronLeft, ChevronRight, ScrollText, Users } from 'lucide-react';
import type { AgentInfo } from '../hooks/useAgentStore';
import { useTheme } from '../hooks/useTheme';
import { UI_FONT, MONO_FONT } from '../lib/theme';
import type { UIThemeMode } from '../lib/theme';

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
}

function getOsLabel(os: string): string {
  if (os === 'darwin') return 'macOS';
  if (os === 'linux') return 'Linux';
  if (os === 'windows') return 'Windows';
  return os;
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

export function Sidebar({ agents, selectedAgentId, onSelectAgent, currentView, onViewChange, onLogout, userRole }: SidebarProps) {
  const { ui, uiMode, setUIMode } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const cycleTheme = () => {
    const idx = themeCycle.indexOf(uiMode);
    setUIMode(themeCycle[(idx + 1) % themeCycle.length]);
  };

  const width = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;

  const itemStyle = (isActive: boolean, isHovered: boolean): React.CSSProperties => ({
    ...btnReset,
    display: 'flex', alignItems: 'center', gap: 8,
    width: `calc(100% - 12px)`,
    padding: collapsed ? '7px 0' : '7px 14px',
    justifyContent: collapsed ? 'center' : 'flex-start',
    borderRadius: 6, margin: '1px 6px',
    background: isActive ? ui.surfaceActive : isHovered ? ui.surfaceAlt : 'transparent',
    boxSizing: 'border-box',
  });

  const ThemeIcon = themeModeIcons[uiMode];

  return (
    <div style={{ width, minWidth: width, background: ui.surface, borderRight: `1px solid ${ui.border}`, display: 'flex', flexDirection: 'column', fontFamily: UI_FONT, userSelect: 'none', transition: 'width 0.2s ease, min-width 0.2s ease', overflow: 'hidden' }}>
      <div style={{ padding: collapsed ? '10px 0 8px' : '14px 14px 8px', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between' }}>
        {!collapsed && (
          <span style={{ fontSize: 11, fontWeight: 600, color: ui.textSecondary, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            Machines
          </span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{ ...btnReset, color: ui.textSecondary, lineHeight: 1, padding: '2px 4px', borderRadius: 4 }}
        >
          {collapsed ? <ChevronRight size={16} strokeWidth={ICON_STROKE} /> : <ChevronLeft size={16} strokeWidth={ICON_STROKE} />}
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {agents.length === 0 && !collapsed && (
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
            onClick={() => onSelectAgent(agent.id)}
            onMouseEnter={() => setHoveredId(agent.id)}
            onMouseLeave={() => setHoveredId(null)}
            title={collapsed ? `${agent.name} (${getOsLabel(agent.os)})` : undefined}
            aria-label={collapsed ? `${agent.name} (${getOsLabel(agent.os)})` : undefined}
          >
            <span style={{ color: agent.online ? ui.online : ui.textMuted, fontSize: 10, flexShrink: 0 }}>{'\u25cf'}</span>
            {!collapsed && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: agent.online ? ui.textPrimary : ui.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {agent.name}
                </div>
                <div style={{ fontSize: 11, color: ui.textSecondary, fontFamily: MONO_FONT }}>
                  {getOsLabel(agent.os)}
                  {agent.sessions.length > 0 && ` \u00b7 ${agent.sessions.length}`}
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
            onClick={() => onViewChange('users')}
            onMouseEnter={() => setHoveredId('_users')}
            onMouseLeave={() => setHoveredId(null)}
            title={collapsed ? 'Users' : undefined}
            aria-label={collapsed ? 'Users' : undefined}
          >
            <Users size={16} strokeWidth={ICON_STROKE} color={ui.textSecondary} />
            {!collapsed && <span style={{ fontSize: 13, color: ui.textSecondary }}>Users</span>}
          </button>
        )}
        <button
          style={itemStyle(currentView === 'audit', hoveredId === '_audit')}
          onClick={() => onViewChange('audit')}
          onMouseEnter={() => setHoveredId('_audit')}
          onMouseLeave={() => setHoveredId(null)}
          title={collapsed ? 'Audit Log' : undefined}
          aria-label={collapsed ? 'Audit Log' : undefined}
        >
          <ScrollText size={16} strokeWidth={ICON_STROKE} color={ui.textSecondary} />
          {!collapsed && <span style={{ fontSize: 13, color: ui.textSecondary }}>Audit Log</span>}
        </button>
        <button
          style={itemStyle(currentView === 'settings', hoveredId === '_settings')}
          onClick={() => onViewChange('settings')}
          onMouseEnter={() => setHoveredId('_settings')}
          onMouseLeave={() => setHoveredId(null)}
          title={collapsed ? 'Settings' : undefined}
          aria-label={collapsed ? 'Settings' : undefined}
        >
          <Settings size={16} strokeWidth={ICON_STROKE} color={ui.textSecondary} />
          {!collapsed && <span style={{ fontSize: 13, color: ui.textSecondary }}>Settings</span>}
        </button>
        <button
          style={itemStyle(false, hoveredId === '_theme')}
          onClick={cycleTheme}
          onMouseEnter={() => setHoveredId('_theme')}
          onMouseLeave={() => setHoveredId(null)}
          title={collapsed ? themeModeLabels[uiMode] : undefined}
          aria-label={`Theme: ${themeModeLabels[uiMode]}`}
        >
          <ThemeIcon size={16} strokeWidth={ICON_STROKE} color={ui.textSecondary} />
          {!collapsed && <span style={{ fontSize: 13, color: ui.textSecondary }}>{themeModeLabels[uiMode]}</span>}
        </button>
        <button
          style={itemStyle(false, hoveredId === '_logout')}
          onClick={onLogout}
          onMouseEnter={() => setHoveredId('_logout')}
          onMouseLeave={() => setHoveredId(null)}
          title={collapsed ? 'Logout' : undefined}
          aria-label={collapsed ? 'Logout' : undefined}
        >
          <LogOut size={16} strokeWidth={ICON_STROKE} color={ui.textSecondary} />
          {!collapsed && <span style={{ fontSize: 13, color: ui.textSecondary }}>Logout</span>}
        </button>
      </div>
    </div>
  );
}
