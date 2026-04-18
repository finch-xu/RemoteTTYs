import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Plus, Columns2 } from 'lucide-react';
import { TerminalView } from './TerminalView';
import { NewTerminalDialog } from './NewTerminalDialog';
import { MONO_FONT } from '../lib/theme';
import { generateECDHKeyPair, exportPublicKeyRaw, uint8ToBase64, computeCloseHMAC } from '../lib/e2e';
import type { E2EKeyPairData } from '../lib/e2e';
import type { PtyCreated, PtyExited, PtyCreateError, AgentOffline } from '../lib/protocol';

interface SessionInfo {
  sessionId: string;
  label: string;
  exited: boolean;
  isExisting: boolean;
}

interface SplitState {
  rightSessionIds: Set<string>;
  leftActiveId: string;
  rightActiveId: string;
  ratio: number;
}

interface TerminalTabsProps {
  agentId: string;
  agentName: string;
  identityKey: string | null;
  existingSessions: string[];
  clipboardAvailable: boolean;
  send: (msg: object) => void;
  subscribe: (type: string, handler: (msg: any) => void) => () => void;
  compact?: boolean;
  agentLatencyMs: number | null;
  relayLatencyMs: number | null;
}

export function TerminalTabs({ agentId, agentName, identityKey, existingSessions, clipboardAvailable, send, subscribe, compact, agentLatencyMs, relayLatencyMs }: TerminalTabsProps) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [split, setSplit] = useState<SplitState | null>(null);
  const [focusedPane, setFocusedPane] = useState<'left' | 'right'>('left');
  const [createError, setCreateError] = useState<string | null>(null);

  const terminalAreaRef = useRef<HTMLDivElement>(null);
  const splitRef = useRef(split);
  splitRef.current = split;
  const focusedPaneRef = useRef(focusedPane);
  focusedPaneRef.current = focusedPane;
  const dragCleanupRef = useRef<(() => void) | null>(null);

  // Maps clientReqId → keyPair so pty.created can find the right keyPair regardless
  // of message ordering. Replaces the previous FIFO array, which silently corrupted
  // the keyPair↔sessionId binding whenever any in-flight pty.create error or race
  // shifted the queue out of sync (root cause of "second session E2E verify fails").
  const pendingKeyPairsRef = useRef<Map<string, E2EKeyPairData>>(new Map());
  const sessionKeyPairsRef = useRef<Map<string, E2EKeyPairData>>(new Map());
  const agentKeyExchangeRef = useRef<Map<string, { publicKey: string; signature: string }>>(new Map());
  const sessionHmacKeysRef = useRef<Map<string, CryptoKey>>(new Map());

  const handleE2EEstablished = useCallback((sid: string, hmacKey: CryptoKey) => {
    sessionHmacKeysRef.current.set(sid, hmacKey);
  }, []);

  const createSession = useCallback(async (shell: string, cwd: string) => {
    const keyPair = await generateECDHKeyPair();
    const publicKeyRaw = await exportPublicKeyRaw(keyPair.publicKey);
    const clientReqId = crypto.randomUUID();
    pendingKeyPairsRef.current.set(clientReqId, { keyPair, publicKeyRaw });
    // Bound memory: drop the entry if no pty.created/error response arrives in 30s.
    // Real round-trips are sub-second; 30s is generous slack.
    setTimeout(() => pendingKeyPairsRef.current.delete(clientReqId), 30_000);
    send({ type: 'pty.create', agentId, shell, cwd, publicKey: uint8ToBase64(publicKeyRaw), clientReqId });
  }, [agentId, send]);

  useEffect(() => {
    if (existingSessions.length > 0) {
      const existing = existingSessions.map((sid, i) => ({
        sessionId: sid, label: `Terminal ${i + 1}`, exited: false, isExisting: true,
      }));
      setSessions(existing);
      setActiveSessionId(existing[0].sessionId);
    } else {
      createSession('', '~');
    }
  }, []);

  useEffect(() => {
    const unsub = subscribe('pty.created', (msg: PtyCreated) => {
      if (msg.agentId !== agentId) return;
      // Match the keyPair by the clientReqId we generated in createSession. This
      // is robust against message reordering, retries, and StrictMode double-mounts —
      // the pre-fix FIFO shift assumed push-order == response-order, which broke
      // whenever any pty.create.error or other race consumed the queue head.
      const reqId = msg.clientReqId;
      const pendingKP = reqId ? pendingKeyPairsRef.current.get(reqId) : undefined;
      if (reqId && pendingKP) {
        pendingKeyPairsRef.current.delete(reqId);
        sessionKeyPairsRef.current.set(msg.sessionId, pendingKP);
      } else if (!reqId) {
        console.error('[E2E] pty.created missing clientReqId — agent/relay version mismatch?');
      }
      if (msg.publicKey && msg.signature) {
        agentKeyExchangeRef.current.set(msg.sessionId, { publicKey: msg.publicKey, signature: msg.signature });
      }
      setSessions(prev => {
        if (prev.some(s => s.sessionId === msg.sessionId)) return prev;
        return [...prev, { sessionId: msg.sessionId, label: `Terminal ${prev.length + 1}`, exited: false, isExisting: false }];
      });

      const currentSplit = splitRef.current;
      const currentFocused = focusedPaneRef.current;
      if (currentSplit) {
        if (currentFocused === 'right') {
          setSplit(prev => {
            if (!prev) return null;
            const newRightIds = new Set(prev.rightSessionIds);
            newRightIds.add(msg.sessionId);
            return { ...prev, rightSessionIds: newRightIds, rightActiveId: msg.sessionId };
          });
        } else {
          setSplit(prev => prev ? { ...prev, leftActiveId: msg.sessionId } : null);
        }
      } else {
        setActiveSessionId(prev => prev ?? msg.sessionId);
      }
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

  // When agent goes offline, mark all sessions as exited (relay destroys them)
  useEffect(() => {
    const unsub = subscribe('agent.offline', (msg: AgentOffline) => {
      if (msg.agentId !== agentId) return;
      setSessions(prev => prev.map(s => s.exited ? s : { ...s, exited: true }));
    });
    return unsub;
  }, [subscribe, agentId]);

  // Handle agent reconnect: pick up new sessions from existingSessions prop
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      return; // Skip first run — handled by mount effect
    }
    if (existingSessions.length === 0) return;
    setSessions(prev => {
      const currentIds = new Set(prev.map(s => s.sessionId));
      const newSessions = existingSessions.filter(sid => !currentIds.has(sid));
      if (newSessions.length === 0) return prev;
      return [
        ...prev,
        ...newSessions.map((sid, i) => ({
          sessionId: sid,
          label: `Terminal ${prev.length + i + 1}`,
          exited: false,
          isExisting: true,
        })),
      ];
    });
    if (!activeSessionId) {
      setActiveSessionId(existingSessions[0]);
    }
  }, [existingSessions]);

  // Handle pty.create failures: discard orphaned key pair and show error
  const createErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const unsub = subscribe('pty.create.error', (msg: PtyCreateError) => {
      if (msg.agentId !== agentId) return;
      // Drop the specific keyPair tied to this failed request. If no clientReqId
      // is present (legacy relay), the 30s timeout in createSession will eventually
      // GC the entry — we no longer fall back to FIFO shift, which was the bug.
      if (msg.clientReqId) {
        pendingKeyPairsRef.current.delete(msg.clientReqId);
      }
      setCreateError(msg.error);
      if (createErrorTimerRef.current) clearTimeout(createErrorTimerRef.current);
      createErrorTimerRef.current = setTimeout(() => setCreateError(null), 5000);
    });
    return () => {
      unsub();
      if (createErrorTimerRef.current) clearTimeout(createErrorTimerRef.current);
    };
  }, [subscribe, agentId]);

  // Clean up drag listeners on unmount
  useEffect(() => {
    return () => { dragCleanupRef.current?.(); };
  }, []);

  const handleCloseTab = async (sid: string) => {
    const session = sessions.find(s => s.sessionId === sid);
    if (session && !session.exited) {
      const hmacKey = sessionHmacKeysRef.current.get(sid);
      if (hmacKey) {
        const hmac = await computeCloseHMAC(hmacKey, sid);
        send({ type: 'pty.close', agentId, sessionId: sid, hmac });
      } else {
        send({ type: 'pty.close', agentId, sessionId: sid });
      }
    }
    sessionKeyPairsRef.current.delete(sid);
    agentKeyExchangeRef.current.delete(sid);
    sessionHmacKeysRef.current.delete(sid);

    // Functional updater: avoids stale closure after await
    let remaining: SessionInfo[] = [];
    setSessions(prev => {
      remaining = prev.filter(s => s.sessionId !== sid);
      return remaining;
    });

    // Read split from ref for freshness after await
    const currentSplit = splitRef.current;
    if (currentSplit) {
      const newRightIds = new Set(currentSplit.rightSessionIds);
      newRightIds.delete(sid);
      const newLeftSessions = remaining.filter(s => !newRightIds.has(s.sessionId));
      const newRightSessions = remaining.filter(s => newRightIds.has(s.sessionId));

      if (remaining.length <= 1 || newLeftSessions.length === 0 || newRightSessions.length === 0) {
        setSplit(null);
        setActiveSessionId(remaining.length > 0 ? remaining[0].sessionId : null);
        return;
      }

      let newLeftActive = currentSplit.leftActiveId;
      let newRightActive = currentSplit.rightActiveId;
      if (sid === currentSplit.leftActiveId) newLeftActive = newLeftSessions[0].sessionId;
      if (sid === currentSplit.rightActiveId) newRightActive = newRightSessions[0].sessionId;
      setSplit({ ...currentSplit, rightSessionIds: newRightIds, leftActiveId: newLeftActive, rightActiveId: newRightActive });
    } else {
      if (activeSessionId === sid) {
        setActiveSessionId(remaining.length > 0 ? remaining[0].sessionId : null);
      }
    }
  };

  const handleSplit = useCallback(() => {
    if (split) {
      setActiveSessionId(focusedPane === 'left' ? split.leftActiveId : split.rightActiveId);
      setSplit(null);
    } else {
      if (sessions.length < 2 || !activeSessionId) return;
      const rightSession = sessions.find(s => s.sessionId !== activeSessionId);
      if (!rightSession) return;
      setSplit({
        rightSessionIds: new Set([rightSession.sessionId]),
        leftActiveId: activeSessionId,
        rightActiveId: rightSession.sessionId,
        ratio: 0.5,
      });
    }
  }, [split, sessions, activeSessionId, focusedPane]);

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const container = terminalAreaRef.current;
    const currentSplit = splitRef.current;
    if (!container || !currentSplit) return;
    const startX = e.clientX;
    const startRatio = currentSplit.ratio;
    const containerWidth = container.getBoundingClientRect().width;

    const onMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const newRatio = Math.max(0.2, Math.min(0.8, startRatio + dx / containerWidth));
      setSplit(prev => prev ? { ...prev, ratio: newRatio } : null);
    };
    const cleanup = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      dragCleanupRef.current = null;
    };
    const onMouseUp = () => cleanup();

    dragCleanupRef.current = cleanup;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  const handleDividerDoubleClick = useCallback(() => {
    setSplit(prev => prev ? { ...prev, ratio: 0.5 } : null);
  }, []);

  const getTerminalStyle = (sessionId: string): React.CSSProperties => {
    if (!split) {
      return {
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        display: sessionId === activeSessionId ? 'block' : 'none',
      };
    }
    if (sessionId === split.leftActiveId) {
      return {
        position: 'absolute', top: 0, left: 0, bottom: 0,
        width: `calc(${split.ratio * 100}% - 3px)`,
        display: 'block',
      };
    }
    if (sessionId === split.rightActiveId) {
      return {
        position: 'absolute', top: 0, right: 0, bottom: 0,
        width: `calc(${(1 - split.ratio) * 100}% - 3px)`,
        display: 'block',
      };
    }
    return {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      display: 'none',
    };
  };

  const leftSessions = split ? sessions.filter(s => !split.rightSessionIds.has(s.sessionId)) : sessions;
  const rightSessions = split ? sessions.filter(s => split.rightSessionIds.has(s.sessionId)) : [];

  const renderTab = (s: SessionInfo, isActive: boolean, onActivate: () => void) => (
    <div
      key={s.sessionId}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: compact ? '12px 14px' : '11px 14px', cursor: 'pointer',
        fontSize: 13, fontFamily: MONO_FONT, whiteSpace: 'nowrap', userSelect: 'none',
        background: isActive ? 'var(--bg)' : 'transparent',
        color: s.exited ? 'var(--text-muted)' : isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
        borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
        transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease',
        fontWeight: isActive ? 500 : 400,
      }}
      onClick={onActivate}
      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--surface-alt)'; }}
      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
    >
      <span>{s.label}</span>
      {s.exited && <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: 4 }}>exited</span>}
      <button
        style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: compact ? '6px' : '4px', marginLeft: 2, lineHeight: 1, display: 'flex', alignItems: 'center', borderRadius: 4 }}
        onClick={(e) => { e.stopPropagation(); handleCloseTab(s.sessionId); }}
        title="Close terminal"
        aria-label="Close terminal"
      >
        <X size={compact ? 16 : 14} strokeWidth={1.75} />
      </button>
    </div>
  );

  const renderPaneGroup = (pane: 'left' | 'right', paneSessions: SessionInfo[], activeId: string) => (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 2, overflow: 'auto', padding: '0 4px',
        flex: 1, minWidth: 0,
        boxShadow: focusedPane === pane ? 'inset 0 -2px 0 0 var(--accent)' : 'none',
        transition: 'box-shadow 0.15s ease',
      }}
      onClick={() => setFocusedPane(pane)}
    >
      {paneSessions.map(s => renderTab(s, s.sessionId === activeId, () => {
        const key = pane === 'left' ? 'leftActiveId' as const : 'rightActiveId' as const;
        setSplit(prev => prev ? { ...prev, [key]: s.sessionId } : null);
        setFocusedPane(pane);
      }))}
      <button
        style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: compact ? '10px' : '6px 10px', lineHeight: 1, display: 'flex', alignItems: 'center', borderRadius: 4 }}
        onClick={() => { setFocusedPane(pane); setShowNewDialog(true); }}
        title="New terminal"
        aria-label={`New terminal (${pane} pane)`}
      >
        <Plus size={compact ? 20 : 18} strokeWidth={1.75} />
      </button>
    </div>
  );

  const canSplit = sessions.length >= 2 && !compact;
  const totalLatencyMs = agentLatencyMs !== null ? agentLatencyMs + (relayLatencyMs ?? 0) : null;
  const latencyColor = totalLatencyMs == null
    ? 'var(--text-muted)'
    : totalLatencyMs < 60
      ? 'var(--online)'
      : totalLatencyMs < 150
        ? 'var(--warning)'
        : 'var(--error)';

  const activeSession = split
    ? sessions.find(s => s.sessionId === (focusedPane === 'left' ? split.leftActiveId : split.rightActiveId))
    : sessions.find(s => s.sessionId === activeSessionId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      {/* Top: breadcrumb + tab strip (unified 44px) */}
      <div style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'space-between', background: 'var(--surface)', borderBottom: '1px solid var(--border)', height: 44, flexShrink: 0 }}>
        {split ? (
          <>
            {renderPaneGroup('left', leftSessions, split.leftActiveId)}
            <div style={{ width: 1, background: 'var(--border)', flexShrink: 0, alignSelf: 'stretch' }} />
            {renderPaneGroup('right', rightSessions, split.rightActiveId)}
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, overflow: 'auto', padding: '0 4px', flex: 1, minWidth: 0 }}>
            {sessions.map(s => renderTab(s, s.sessionId === activeSessionId, () => setActiveSessionId(s.sessionId)))}
            <button
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: compact ? '10px' : '6px 10px', lineHeight: 1, display: 'flex', alignItems: 'center', borderRadius: 4 }}
              onClick={() => setShowNewDialog(true)}
              title="New terminal"
              aria-label="New terminal"
            >
              <Plus size={compact ? 20 : 18} strokeWidth={1.75} />
            </button>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, paddingRight: 12 }}>
          {!compact && (
            <button
              style={{
                background: split ? 'var(--accent-soft)' : 'transparent',
                border: 'none', cursor: canSplit || split ? 'pointer' : 'default',
                color: split ? 'var(--accent)' : 'var(--text-secondary)',
                padding: '6px 8px', borderRadius: 6,
                display: 'flex', alignItems: 'center', opacity: canSplit || split ? 1 : 0.3,
              }}
              onClick={handleSplit}
              disabled={!canSplit && !split}
              title={split ? 'Exit split view' : 'Split view'}
              aria-label={split ? 'Exit split view' : 'Split view'}
            >
              <Columns2 size={16} strokeWidth={1.75} />
            </button>
          )}
          {!compact && (
            <span style={{ color: 'var(--text-secondary)', fontSize: 12, fontFamily: MONO_FONT }}>
              {agentName}
            </span>
          )}
        </div>
      </div>

      <div ref={terminalAreaRef} style={{ flex: 1, position: 'relative' }}>
        {createError && (
          <div style={{
            position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 20,
            padding: '6px 16px', borderRadius: 6, fontSize: 13, fontFamily: MONO_FONT,
            background: 'var(--error)', color: 'var(--accent-text)', whiteSpace: 'nowrap',
          }}>
            {createError}
          </div>
        )}
        {sessions.map(s => (
          <div
            key={s.sessionId}
            style={getTerminalStyle(s.sessionId)}
            onMouseDown={() => { if (split) setFocusedPane(split.rightSessionIds.has(s.sessionId) ? 'right' : 'left'); }}
          >
            <TerminalView
              agentId={agentId}
              sessionId={s.sessionId}
              isExisting={s.isExisting}
              identityKey={identityKey}
              ecdhKeyPair={sessionKeyPairsRef.current.get(s.sessionId) ?? null}
              agentPublicKey={agentKeyExchangeRef.current.get(s.sessionId)?.publicKey ?? null}
              agentSignature={agentKeyExchangeRef.current.get(s.sessionId)?.signature ?? null}
              clipboardAvailable={clipboardAvailable}
              send={send}
              subscribe={subscribe}
              onE2EEstablished={handleE2EEstablished}
            />
          </div>
        ))}
        {split && (
          <div
            style={{
              position: 'absolute', top: 0, bottom: 0, zIndex: 10,
              left: `calc(${split.ratio * 100}% - 3px)`, width: 6,
              cursor: 'col-resize', background: 'var(--border)',
            }}
            onMouseDown={handleDividerMouseDown}
            onDoubleClick={handleDividerDoubleClick}
          />
        )}
      </div>

      {/* Bottom status bar (28px) */}
      {!compact && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          height: 28, flexShrink: 0,
          padding: '0 14px',
          background: 'var(--surface)',
          borderTop: '1px solid var(--border)',
          fontSize: 11,
          fontFamily: MONO_FONT,
          color: 'var(--text-muted)',
        }}>
          {activeSession && (
            <span title={activeSession.sessionId}>
              {activeSession.sessionId.slice(0, 8)}
              {activeSession.exited && <span style={{ color: 'var(--warning)', marginLeft: 6 }}>· exited</span>}
            </span>
          )}
          <span>{sessions.length} session{sessions.length === 1 ? '' : 's'}</span>
          <div style={{ flex: 1 }} />
          {totalLatencyMs !== null && (
            <span
              title={`Web ↔ Relay: ${relayLatencyMs ?? '?'}ms · Relay ↔ Agent: ${agentLatencyMs}ms`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <span style={{ color: latencyColor, fontSize: 8 }}>●</span>
              <span style={{ color: latencyColor, fontWeight: 500 }}>{totalLatencyMs}ms</span>
              <span style={{ color: 'var(--text-muted)' }}>W:{relayLatencyMs ?? '?'} A:{agentLatencyMs}</span>
            </span>
          )}
        </div>
      )}

      {showNewDialog && (
        <NewTerminalDialog
          onSubmit={(shell, cwd) => { createSession(shell, cwd); setShowNewDialog(false); }}
          onCancel={() => setShowNewDialog(false)}
        />
      )}
    </div>
  );
}
