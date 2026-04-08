import { useState, useEffect } from 'react';
import { TerminalView } from './TerminalView';
import { NewTerminalDialog } from './NewTerminalDialog';
import { useTheme } from '../hooks/useTheme';
import { MONO_FONT } from '../lib/theme';
import type { PtyCreated, PtyExited } from '../lib/protocol';

interface SessionInfo {
  sessionId: string;
  label: string;
  exited: boolean;
  isExisting: boolean;
}

interface TerminalTabsProps {
  agentId: string;
  agentName: string;
  existingSessions: string[];
  send: (msg: object) => void;
  subscribe: (type: string, handler: (msg: any) => void) => () => void;
}

export function TerminalTabs({ agentId, agentName, existingSessions, send, subscribe }: TerminalTabsProps) {
  const { ui } = useTheme();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [pendingCreate, setPendingCreate] = useState(false);

  useEffect(() => {
    if (existingSessions.length > 0) {
      const existing = existingSessions.map((sid, i) => ({
        sessionId: sid, label: `Terminal ${i + 1}`, exited: false, isExisting: true,
      }));
      setSessions(existing);
      setActiveSessionId(existing[0].sessionId);
    } else {
      setPendingCreate(true);
      send({ type: 'pty.create', agentId, shell: '', cwd: '~' });
    }
  }, []);

  useEffect(() => {
    const unsub = subscribe('pty.created', (msg: PtyCreated) => {
      if (msg.agentId !== agentId) return;
      setSessions(prev => {
        if (prev.some(s => s.sessionId === msg.sessionId)) return prev;
        return [...prev, { sessionId: msg.sessionId, label: `Terminal ${prev.length + 1}`, exited: false, isExisting: false }];
      });
      setActiveSessionId(prev => prev ?? msg.sessionId);
      setPendingCreate(false);
    });
    return unsub;
  }, [subscribe, agentId]);

  useEffect(() => {
    const unsub = subscribe('pty.exited', (msg: PtyExited) => {
      if (msg.agentId !== agentId) return;
      setSessions(prev => prev.map(s => s.sessionId === msg.sessionId ? { ...s, exited: true } : s));
    });
    return unsub;
  }, [subscribe, agentId]);

  const handleCloseTab = (sessionId: string) => {
    const session = sessions.find(s => s.sessionId === sessionId);
    if (session && !session.exited) {
      send({ type: 'pty.close', agentId, sessionId });
    }
    const remaining = sessions.filter(s => s.sessionId !== sessionId);
    setSessions(remaining);
    if (activeSessionId === sessionId) {
      setActiveSessionId(remaining.length > 0 ? remaining[0].sessionId : null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: ui.surface, borderBottom: `1px solid ${ui.border}`, height: 38, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, overflow: 'auto', padding: '0 4px' }}>
          {sessions.map(s => (
            <div
              key={s.sessionId}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '5px 14px', cursor: 'pointer',
                fontSize: 13, fontFamily: MONO_FONT, whiteSpace: 'nowrap', userSelect: 'none', borderRadius: '6px 6px 0 0',
                background: s.sessionId === activeSessionId ? ui.bg : 'transparent',
                color: s.exited ? ui.textMuted : ui.textPrimary,
                borderBottom: s.sessionId === activeSessionId ? `2px solid ${ui.accent}` : '2px solid transparent',
              }}
              onClick={() => setActiveSessionId(s.sessionId)}
            >
              <span>{s.label}</span>
              {s.exited && <span style={{ color: ui.textMuted, fontSize: 10, marginLeft: 4 }}>exited</span>}
              <button
                style={{ background: 'none', border: 'none', color: ui.textSecondary, cursor: 'pointer', fontSize: 12, padding: '0 2px', marginLeft: 4, lineHeight: 1 }}
                onClick={(e) => { e.stopPropagation(); handleCloseTab(s.sessionId); }}
                title="Close terminal"
              >
                x
              </button>
            </div>
          ))}
          <button
            style={{ background: 'none', border: 'none', color: ui.textSecondary, cursor: 'pointer', fontSize: 18, padding: '2px 10px', lineHeight: 1 }}
            onClick={() => setShowNewDialog(true)}
            title="New terminal"
          >
            +
          </button>
        </div>
        <div style={{ color: ui.textSecondary, fontSize: 12, paddingRight: 10, fontFamily: MONO_FONT }}>
          {agentName}
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative' }}>
        {sessions.map(s => (
          <div key={s.sessionId} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: s.sessionId === activeSessionId ? 'block' : 'none' }}>
            <TerminalView agentId={agentId} sessionId={s.sessionId} isExisting={s.isExisting} send={send} subscribe={subscribe} />
          </div>
        ))}
      </div>

      {showNewDialog && (
        <NewTerminalDialog
          onSubmit={(shell, cwd) => { send({ type: 'pty.create', agentId, shell, cwd }); setShowNewDialog(false); }}
          onCancel={() => setShowNewDialog(false)}
        />
      )}
    </div>
  );
}
