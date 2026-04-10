import type { AgentInfo } from '../hooks/useAgentStore';
import { useTheme } from '../hooks/useTheme';
import { UI_FONT, MONO_FONT } from '../lib/theme';
import type { UIThemeMode } from '../lib/theme';

interface SidebarProps {
  agents: AgentInfo[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
  currentView: 'terminal' | 'settings';
  onViewChange: (view: 'terminal' | 'settings') => void;
  onLogout: () => void;
}

function getOsLabel(os: string): string {
  if (os === 'darwin') return 'macOS';
  if (os === 'linux') return 'Linux';
  if (os === 'windows') return 'Windows';
  return os;
}

const themeModeIcons: Record<UIThemeMode, string> = {
  light: '\u2600',  // sun
  dark: '\u263E',    // moon
  system: '\u25D0',  // half circle
};

const themeModeLabels: Record<UIThemeMode, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'Auto',
};

const themeCycle: UIThemeMode[] = ['light', 'dark', 'system'];

export function Sidebar({ agents, selectedAgentId, onSelectAgent, currentView, onViewChange, onLogout }: SidebarProps) {
  const { ui, uiMode, setUIMode } = useTheme();

  const cycleTheme = () => {
    const idx = themeCycle.indexOf(uiMode);
    setUIMode(themeCycle[(idx + 1) % themeCycle.length]);
  };

  const itemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', cursor: 'pointer', borderRadius: 6, margin: '1px 6px',
  };

  return (
    <div style={{ width: 200, minWidth: 200, background: ui.surface, borderRight: `1px solid ${ui.border}`, display: 'flex', flexDirection: 'column', fontFamily: UI_FONT, userSelect: 'none' }}>
      <div style={{ padding: '14px 14px 8px', fontSize: 11, fontWeight: 600, color: ui.textSecondary, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
        Machines
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {agents.length === 0 && (
          <div style={{ color: ui.textMuted, fontSize: 12, padding: '8px 14px' }}>
            No agents
          </div>
        )}
        {agents.map(agent => (
          <div
            key={agent.id}
            style={{ ...itemStyle, background: agent.id === selectedAgentId && currentView === 'terminal' ? ui.surfaceActive : 'transparent' }}
            onClick={() => onSelectAgent(agent.id)}
          >
            <span style={{ color: agent.online ? ui.online : ui.textMuted, fontSize: 10 }}>{'\u25cf'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: agent.online ? ui.textPrimary : ui.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {agent.name}
              </div>
              <div style={{ fontSize: 11, color: ui.textSecondary, fontFamily: MONO_FONT }}>
                {getOsLabel(agent.os)}
                {agent.sessions.length > 0 && ` \u00b7 ${agent.sessions.length}`}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ borderTop: `1px solid ${ui.border}`, padding: '4px 0' }}>
        <div
          style={{ ...itemStyle, background: currentView === 'settings' ? ui.surfaceActive : 'transparent' }}
          onClick={() => onViewChange('settings')}
        >
          <span style={{ fontSize: 14, color: ui.textSecondary }}>{'\u2699'}</span>
          <span style={{ fontSize: 13, color: ui.textSecondary }}>Settings</span>
        </div>
        <div style={itemStyle} onClick={cycleTheme}>
          <span style={{ fontSize: 14, color: ui.textSecondary }}>{themeModeIcons[uiMode]}</span>
          <span style={{ fontSize: 13, color: ui.textSecondary }}>{themeModeLabels[uiMode]}</span>
        </div>
        <div style={itemStyle} onClick={onLogout}>
          <span style={{ fontSize: 13, color: ui.textSecondary }}>{'\u2192'}</span>
          <span style={{ fontSize: 13, color: ui.textSecondary }}>Logout</span>
        </div>
      </div>
    </div>
  );
}
