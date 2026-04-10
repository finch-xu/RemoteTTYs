import { useState, useEffect, useRef, useCallback } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useAgentStore } from './hooks/useAgentStore';
import { ThemeContext, useTheme, useThemeProvider } from './hooks/useTheme';
import { Sidebar } from './components/Sidebar';
import { TerminalTabs } from './components/TerminalTabs';
import { LoginPage } from './components/LoginPage';
import { SetupPage } from './components/SetupPage';
import { SettingsPage } from './components/SettingsPage';
import { FingerprintWarning } from './components/FingerprintWarning';
import { checkAgentIdentity, acceptNewIdentity } from './lib/knownAgents';
import type { TOFUResult } from './lib/knownAgents';
import { UI_FONT } from './lib/theme';

type AppView = 'terminal' | 'settings';
type AuthState = 'loading' | 'authenticated' | 'unauthenticated';

interface Preferences {
  uiTheme?: string;
  terminalTheme?: string;
  fontSize?: number;
  fontFamily?: string;
}

function App() {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [preferences, setPreferences] = useState<Preferences | undefined>();

  useEffect(() => {
    Promise.all([
      fetch('/api/setup/status').then(r => r.json()).then(d => d.needsSetup),
      fetch('/api/auth/me').then(r => r.ok ? r.json() : null),
    ]).then(([setup, meData]) => {
      setNeedsSetup(setup);
      if (meData) {
        setAuthState('authenticated');
        setPreferences(meData.preferences);
      } else {
        setAuthState('unauthenticated');
      }
    }).catch(() => {
      setNeedsSetup(false);
      setAuthState('unauthenticated');
    });
  }, []);

  // Handle 401 from API calls (session expired)
  useEffect(() => {
    const handler = () => setAuthState('unauthenticated');
    window.addEventListener('rttys:unauthorized', handler);
    return () => window.removeEventListener('rttys:unauthorized', handler);
  }, []);

  // Loading
  if (needsSetup === null || authState === 'loading') {
    return (
      <div style={loadingStyle}>
        <span style={{ color: '#8C8580', fontSize: 20 }}>{'\u25cf'}</span> Loading...
      </div>
    );
  }

  // First-time setup
  if (needsSetup) {
    return <SetupPage onSetupComplete={() => { setNeedsSetup(false); setAuthState('authenticated'); }} />;
  }

  if (authState !== 'authenticated') {
    return <LoginPage onLogin={() => {
      // Re-fetch preferences after login
      fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(data => {
        if (data) setPreferences(data.preferences);
      }).catch(() => {});
      setAuthState('authenticated');
    }} />;
  }

  return <ThemedApp preferences={preferences} onLogout={async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setAuthState('unauthenticated');
    setPreferences(undefined);
  }} />;
}

function ThemedApp({ preferences, onLogout }: { preferences?: Preferences; onLogout: () => void }) {
  const themeValue = useThemeProvider(preferences);

  return (
    <ThemeContext.Provider value={themeValue}>
      <MainApp onLogout={onLogout} />
    </ThemeContext.Provider>
  );
}

interface FingerprintWarningState {
  agentId: string;
  agentName: string;
  identityKey: string;
  storedFingerprint: string;
  currentFingerprint: string;
}

function MainApp({ onLogout }: { onLogout: () => void }) {
  const { ui } = useTheme();
  const { connected, send, subscribe } = useWebSocket();
  const { agents, selectedAgent, selectedAgentId, selectAgent, deleteAgent, fetchAgents } = useAgentStore(subscribe);
  const [view, setView] = useState<AppView>('terminal');
  const [fingerprintWarning, setFingerprintWarning] = useState<FingerprintWarningState | null>(null);
  // Track which agent IDs we've already checked to avoid re-checking on every render
  const checkedAgentsRef = useRef<Set<string>>(new Set());

  // TOFU: check agent identity when agent.online is received with identityKey
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unsub = subscribe('agent.online', async (msg: any) => {
      if (!msg.identityKey) return;
      // Only check once per agentId+identityKey combination
      const checkKey = `${msg.agentId}:${msg.identityKey}`;
      if (checkedAgentsRef.current.has(checkKey)) return;
      checkedAgentsRef.current.add(checkKey);

      const result: TOFUResult = await checkAgentIdentity(msg.agentId, msg.identityKey);
      if (result.status === 'mismatch') {
        setFingerprintWarning({
          agentId: msg.agentId,
          agentName: msg.name,
          identityKey: msg.identityKey,
          storedFingerprint: result.storedFingerprint,
          currentFingerprint: result.currentFingerprint,
        });
      }
    });
    return unsub;
  }, [subscribe]);

  const handleAcceptFingerprint = useCallback(() => {
    if (!fingerprintWarning) return;
    acceptNewIdentity(
      fingerprintWarning.agentId,
      fingerprintWarning.identityKey,
      fingerprintWarning.currentFingerprint,
    );
    setFingerprintWarning(null);
  }, [fingerprintWarning]);

  const handleRejectFingerprint = useCallback(() => {
    setFingerprintWarning(null);
  }, []);

  if (!connected && view !== 'settings') {
    return (
      <div style={{ ...statusStyle, background: ui.bg, color: ui.textPrimary }}>
        <span style={{ color: ui.textSecondary, fontSize: 20 }}>{'\u25cf'}</span> Connecting to relay...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', background: ui.bg }}>
      <Sidebar
        agents={agents}
        selectedAgentId={selectedAgentId}
        onSelectAgent={(id) => { selectAgent(id); setView('terminal'); }}
        currentView={view}
        onViewChange={setView}
        onLogout={onLogout}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {view === 'settings' ? (
          <SettingsPage onAgentDeleted={fetchAgents} />
        ) : agents.length === 0 ? (
          <div style={{ ...statusStyle, background: ui.bg, color: ui.textPrimary, flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 32, color: ui.textMuted }}>&#x1F5A5;</div>
            <div>No agents registered</div>
            <div style={{ fontSize: 13, color: ui.textSecondary, maxWidth: 320, textAlign: 'center', lineHeight: 1.5 }}>
              Create a token in Settings to connect your first agent.
            </div>
            <button
              onClick={() => setView('settings')}
              style={{ marginTop: 8, padding: '8px 20px', borderRadius: 6, border: 'none', background: ui.textPrimary, color: ui.bg, fontSize: 13, fontFamily: UI_FONT, cursor: 'pointer', fontWeight: 500 }}
            >
              Go to Settings
            </button>
          </div>
        ) : !selectedAgent ? (
          <div style={{ ...statusStyle, background: ui.bg, color: ui.textPrimary }}>
            <span style={{ color: ui.warning, fontSize: 20 }}>{'\u25cf'}</span> Waiting for agent to connect...
          </div>
        ) : !selectedAgent.online ? (
          <div style={{ ...statusStyle, background: ui.bg, color: ui.textPrimary, flexDirection: 'column', gap: 12 }}>
            <span style={{ color: ui.textMuted, fontSize: 32 }}>{'\u25cf'}</span>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{selectedAgent.name}</div>
            <div style={{ fontSize: 13, color: ui.textSecondary }}>
              This agent is offline
              {selectedAgent.lastSeen && (
                <span> &middot; Last seen {new Date(selectedAgent.lastSeen).toLocaleString()}</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                onClick={() => deleteAgent(selectedAgent.id)}
                style={{ padding: '6px 16px', borderRadius: 6, border: `1px solid ${ui.border}`, background: 'transparent', color: ui.error, fontSize: 13, fontFamily: UI_FONT, cursor: 'pointer' }}
              >
                Delete Agent
              </button>
              <button
                onClick={() => setView('settings')}
                style={{ padding: '6px 16px', borderRadius: 6, border: `1px solid ${ui.border}`, background: 'transparent', color: ui.textSecondary, fontSize: 13, fontFamily: UI_FONT, cursor: 'pointer' }}
              >
                Go to Settings
              </button>
            </div>
          </div>
        ) : null}
        {selectedAgent && (
          <div style={{ flex: 1, display: view === 'terminal' && selectedAgent.online ? 'flex' : 'none', flexDirection: 'column' }}>
            <TerminalTabs
              key={selectedAgent.id}
              agentId={selectedAgent.id}
              agentName={selectedAgent.name}
              identityKey={selectedAgent.identityKey}
              existingSessions={selectedAgent.sessions}
              send={send}
              subscribe={subscribe}
            />
          </div>
        )}
      </div>
      {fingerprintWarning && (
        <FingerprintWarning
          agentName={fingerprintWarning.agentName}
          storedFingerprint={fingerprintWarning.storedFingerprint}
          currentFingerprint={fingerprintWarning.currentFingerprint}
          onAccept={handleAcceptFingerprint}
          onReject={handleRejectFingerprint}
        />
      )}
    </div>
  );
}

const loadingStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 1,
  height: '100vh',
  background: '#FAF7F2',
  color: '#2D2B28',
  fontFamily: UI_FONT,
  fontSize: 16,
  gap: 8,
};

const statusStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 1,
  height: '100vh',
  fontFamily: UI_FONT,
  fontSize: 16,
  gap: 8,
};

export default App;
