import { useState, useEffect, useRef, useCallback } from 'react';
import { Monitor } from 'lucide-react';
import { useWebSocket } from './hooks/useWebSocket';
import { useAgentStore } from './hooks/useAgentStore';
import { ThemeContext, useTheme, useThemeProvider } from './hooks/useTheme';
import { Sidebar } from './components/Sidebar';
import { TerminalTabs } from './components/TerminalTabs';
import { LoginPage } from './components/LoginPage';
import { SetupPage } from './components/SetupPage';
import { SettingsPage } from './components/SettingsPage';
import { AuditLogPage } from './components/AuditLogPage';
import { UserManagementPage } from './components/UserManagementPage';
import { FingerprintWarning } from './components/FingerprintWarning';
import { checkAgentIdentity, acceptNewIdentity } from './lib/knownAgents';
import type { TOFUResult } from './lib/knownAgents';
import { UI_FONT } from './lib/theme';

type AppView = 'terminal' | 'settings' | 'audit' | 'users';
type AuthState = 'loading' | 'authenticated' | 'unauthenticated';

interface Preferences {
  uiTheme?: string;
  terminalTheme?: string;
  fontSize?: number;
  fontFamily?: string;
}

interface UserInfo {
  username: string;
  role: string;
}

function parseUserInfo(meData: { username?: string; role?: string }): UserInfo {
  return { username: meData.username ?? '', role: meData.role ?? 'user' };
}

function App() {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [preferences, setPreferences] = useState<Preferences | undefined>();
  const [userInfo, setUserInfo] = useState<UserInfo | undefined>();
  const themeValue = useThemeProvider(preferences);

  useEffect(() => {
    Promise.all([
      fetch('/api/setup/status').then(r => r.json()).then(d => d.needsSetup),
      fetch('/api/auth/me').then(r => r.ok ? r.json() : null),
    ]).then(([setup, meData]) => {
      setNeedsSetup(setup);
      if (meData) {
        setAuthState('authenticated');
        setPreferences(meData.preferences);
        setUserInfo(parseUserInfo(meData));
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

  return (
    <ThemeContext.Provider value={themeValue}>
      <AppContent
        authState={authState}
        needsSetup={needsSetup}
        userInfo={userInfo}
        setAuthState={setAuthState}
        setNeedsSetup={setNeedsSetup}
        setPreferences={setPreferences}
        setUserInfo={setUserInfo}
      />
    </ThemeContext.Provider>
  );
}

function AppContent({ authState, needsSetup, userInfo, setAuthState, setNeedsSetup, setPreferences, setUserInfo }: {
  authState: AuthState;
  needsSetup: boolean | null;
  userInfo: UserInfo | undefined;
  setAuthState: (s: AuthState) => void;
  setNeedsSetup: (s: boolean) => void;
  setPreferences: (p: Preferences | undefined) => void;
  setUserInfo: (u: UserInfo | undefined) => void;
}) {
  const { ui } = useTheme();

  // Loading
  if (needsSetup === null || authState === 'loading') {
    return (
      <div style={{ ...loadingStyle, background: ui.bg, color: ui.textPrimary }}>
        <div className="spinner" /> Loading...
      </div>
    );
  }

  // First-time setup
  if (needsSetup) {
    return <SetupPage onSetupComplete={() => { setNeedsSetup(false); setAuthState('authenticated'); }} />;
  }

  if (authState !== 'authenticated') {
    return <LoginPage onLogin={() => {
      // Re-fetch preferences and user info after login
      fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(data => {
        if (data) {
          setPreferences(data.preferences);
          setUserInfo(parseUserInfo(data));
        }
      }).catch(() => {});
      setAuthState('authenticated');
    }} />;
  }

  return <MainApp userInfo={userInfo} onLogout={async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setAuthState('unauthenticated');
    setPreferences(undefined);
    setUserInfo(undefined);
  }} />;
}

interface FingerprintWarningState {
  agentId: string;
  agentName: string;
  identityKey: string;
  storedFingerprint: string;
  currentFingerprint: string;
}

function MainApp({ userInfo, onLogout }: { userInfo: UserInfo | undefined; onLogout: () => void }) {
  const { ui } = useTheme();
  const { connected, relayLatencyMs, send, subscribe } = useWebSocket();
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

  if (!connected && view !== 'settings' && view !== 'audit' && view !== 'users') {
    return (
      <div style={{ ...statusStyle, background: ui.bg, color: ui.textPrimary }}>
        <div className="spinner" /> Connecting to relay...
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
        userRole={userInfo?.role ?? 'user'}
        relayLatencyMs={relayLatencyMs}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {view === 'settings' ? (
          <SettingsPage onAgentDeleted={fetchAgents} userRole={userInfo?.role ?? 'user'} />
        ) : view === 'users' ? (
          <UserManagementPage />
        ) : view === 'audit' ? (
          <AuditLogPage userRole={userInfo?.role ?? 'user'} />
        ) : agents.length === 0 ? (
          <div style={{ ...statusStyle, background: ui.bg, color: ui.textPrimary, flexDirection: 'column', gap: 16 }}>
            <Monitor size={36} strokeWidth={1.5} color={ui.textMuted} />
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
              clipboardAvailable={selectedAgent.capabilities.includes('clipboard')}
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
