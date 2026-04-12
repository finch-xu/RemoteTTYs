import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Plus } from 'lucide-react';
import { TerminalView } from './TerminalView';
import { NewTerminalDialog } from './NewTerminalDialog';
import { useTheme } from '../hooks/useTheme';
import { MONO_FONT } from '../lib/theme';
import { generateECDHKeyPair, exportPublicKeyRaw, uint8ToBase64, computeCloseHMAC } from '../lib/e2e';
import type { E2EKeyPairData } from '../lib/e2e';
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
  identityKey: string | null;
  existingSessions: string[];
  send: (msg: object) => void;
  subscribe: (type: string, handler: (msg: any) => void) => () => void;
}

export function TerminalTabs({ agentId, agentName, identityKey, existingSessions, send, subscribe }: TerminalTabsProps) {
  const { ui } = useTheme();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [, setPendingCreate] = useState(false);

  // E2E: queue of pending ECDH key pairs for pty.create requests not yet matched to a sessionId.
  // When pty.created arrives, the first pending key pair is dequeued and stored per-session.
  const pendingKeyPairsRef = useRef<E2EKeyPairData[]>([]);
  // Map sessionId → E2EKeyPairData for sessions with established key pairs
  const sessionKeyPairsRef = useRef<Map<string, E2EKeyPairData>>(new Map());
  // Map sessionId → agent's key exchange response (publicKey + signature from pty.created)
  const agentKeyExchangeRef = useRef<Map<string, { publicKey: string; signature: string }>>(new Map());
  // Map sessionId → CryptoKey (HMAC key) for close messages
  const sessionHmacKeysRef = useRef<Map<string, CryptoKey>>(new Map());

  const handleE2EEstablished = useCallback((sid: string, hmacKey: CryptoKey) => {
    sessionHmacKeysRef.current.set(sid, hmacKey);
  }, []);

  const createSession = useCallback(async (shell: string, cwd: string) => {
    const keyPair = await generateECDHKeyPair();
    const publicKeyRaw = await exportPublicKeyRaw(keyPair.publicKey);
    pendingKeyPairsRef.current.push({ keyPair, publicKeyRaw });
    send({ type: 'pty.create', agentId, shell, cwd, publicKey: uint8ToBase64(publicKeyRaw) });
  }, [agentId, send]);

  useEffect(() => {
    if (existingSessions.length > 0) {
      const existing = existingSessions.map((sid, i) => ({
        sessionId: sid, label: `Terminal ${i + 1}`, exited: false, isExisting: true,
      }));
      setSessions(existing);
      setActiveSessionId(existing[0].sessionId);
    } else {
      setPendingCreate(true);
      createSession('', '~');
    }
  }, []);

  useEffect(() => {
    const unsub = subscribe('pty.created', (msg: PtyCreated) => {
      if (msg.agentId !== agentId) return;
      // Associate the pending key pair with this session
      const pendingKP = pendingKeyPairsRef.current.shift();
      if (pendingKP) {
        sessionKeyPairsRef.current.set(msg.sessionId, pendingKP);
      }
      // Store agent's key exchange response so TerminalView can perform E2E inline
      if (msg.publicKey && msg.signature) {
        agentKeyExchangeRef.current.set(msg.sessionId, { publicKey: msg.publicKey, signature: msg.signature });
      }
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
    // Clean up key material
    sessionKeyPairsRef.current.delete(sid);
    agentKeyExchangeRef.current.delete(sid);
    sessionHmacKeysRef.current.delete(sid);

    const remaining = sessions.filter(s => s.sessionId !== sid);
    setSessions(remaining);
    if (activeSessionId === sid) {
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
                style={{ background: 'none', border: 'none', color: ui.textSecondary, cursor: 'pointer', padding: '0 2px', marginLeft: 4, lineHeight: 1, display: 'flex', alignItems: 'center' }}
                onClick={(e) => { e.stopPropagation(); handleCloseTab(s.sessionId); }}
                title="Close terminal"
                aria-label="Close terminal"
              >
                <X size={14} strokeWidth={1.75} />
              </button>
            </div>
          ))}
          <button
            style={{ background: 'none', border: 'none', color: ui.textSecondary, cursor: 'pointer', padding: '2px 10px', lineHeight: 1, display: 'flex', alignItems: 'center' }}
            onClick={() => setShowNewDialog(true)}
            title="New terminal"
            aria-label="New terminal"
          >
            <Plus size={18} strokeWidth={1.75} />
          </button>
        </div>
        <div style={{ color: ui.textSecondary, fontSize: 12, paddingRight: 10, fontFamily: MONO_FONT }}>
          {agentName}
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative' }}>
        {sessions.map(s => (
          <div key={s.sessionId} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: s.sessionId === activeSessionId ? 'block' : 'none' }}>
            <TerminalView agentId={agentId} sessionId={s.sessionId} isExisting={s.isExisting} identityKey={identityKey} ecdhKeyPair={sessionKeyPairsRef.current.get(s.sessionId) ?? null} agentPublicKey={agentKeyExchangeRef.current.get(s.sessionId)?.publicKey ?? null} agentSignature={agentKeyExchangeRef.current.get(s.sessionId)?.signature ?? null} send={send} subscribe={subscribe} onE2EEstablished={handleE2EEstablished} />
          </div>
        ))}
      </div>

      {showNewDialog && (
        <NewTerminalDialog
          onSubmit={(shell, cwd) => { createSession(shell, cwd); setShowNewDialog(false); }}
          onCancel={() => setShowNewDialog(false)}
        />
      )}
    </div>
  );
}
