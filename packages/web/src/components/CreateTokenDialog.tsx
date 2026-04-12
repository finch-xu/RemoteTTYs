import { useState, useRef, useCallback, useEffect } from 'react';
import { Check } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useTheme } from '../hooks/useTheme';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { UI_FONT, MONO_FONT } from '../lib/theme';

interface CreateTokenDialogProps {
  onCreated: () => void;
  onCancel: () => void;
}

export function CreateTokenDialog({ onCreated, onCancel }: CreateTokenDialogProps) {
  const { ui } = useTheme();
  const [label, setLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dialogRef = useRef<HTMLDivElement>(null);
  const handleEscape = useCallback(() => {
    createdToken ? onCreated() : onCancel();
  }, [createdToken, onCreated, onCancel]);
  useFocusTrap(dialogRef, handleEscape);

  const inputStyle: React.CSSProperties = {
    display: 'block', width: '100%', background: ui.surfaceAlt, border: `1px solid ${ui.border}`,
    borderRadius: 6, color: ui.textPrimary, padding: '8px 10px', fontSize: 13, marginTop: 4,
    fontFamily: 'inherit', boxSizing: 'border-box',
  };

  const handleCreate = async () => {
    if (!label.trim()) { setError('Label is required'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim(), notes: notes.trim() }),
      });
      if (!res.ok) { const data = await res.json(); setError(data.error || 'Failed to create token'); return; }
      const data = await res.json();
      setCreatedToken(data.token);
    } catch { setError('Connection failed'); } finally { setLoading(false); }
  };

  useEffect(() => () => clearTimeout(copyTimerRef.current), []);

  const handleCopy = async () => {
    if (createdToken) {
      await navigator.clipboard.writeText(createdToken);
      setCopied(true);
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    }
  };

  if (createdToken) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: ui.overlay, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={onCreated}>
        <div ref={dialogRef} className="modal-content" style={{ background: ui.surface, border: `1px solid ${ui.border}`, borderRadius: 12, padding: 20, width: 440, fontFamily: UI_FONT }} onClick={e => e.stopPropagation()} role="dialog" aria-label="Token Created">
          <h3 style={{ margin: '0 0 12px', color: ui.textPrimary, fontSize: 16, fontWeight: 600 }}>Token Created</h3>
          <p style={{ color: ui.warning, fontSize: 13, margin: '0 0 12px' }}>
            Copy this token now. It will only be shown in the settings page.
          </p>
          <div style={{ background: ui.surfaceAlt, padding: '12px 14px', borderRadius: 8, fontFamily: MONO_FONT, fontSize: 12, wordBreak: 'break-all', color: ui.accent, border: `1px solid ${ui.border}`, userSelect: 'all' }}>
            {createdToken}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
            <button style={{ background: ui.surfaceAlt, border: `1px solid ${ui.border}`, borderRadius: 6, color: ui.textPrimary, padding: '7px 18px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }} onClick={handleCopy}>
              {copied ? <><Check size={14} strokeWidth={2} color={ui.online} /> Copied!</> : 'Copy to Clipboard'}
            </button>
            <button style={{ background: ui.accent, border: 'none', borderRadius: 6, color: ui.accentText, padding: '7px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 500 }} onClick={onCreated}>Done</button>
          </div>
          <p style={{ fontSize: 12, color: ui.textMuted, margin: '12px 0 0' }}>
            Paste this into your agent's config.yaml as the "token" field.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: ui.overlay, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={onCancel}>
      <div ref={dialogRef} className="modal-content" style={{ background: ui.surface, border: `1px solid ${ui.border}`, borderRadius: 12, padding: 20, width: 440, fontFamily: UI_FONT }} onClick={e => e.stopPropagation()} role="dialog" aria-label="New Agent Token">
        <h3 style={{ margin: '0 0 14px', color: ui.textPrimary, fontSize: 16, fontWeight: 600 }}>New Agent Token</h3>
        <label style={{ display: 'block', color: ui.textSecondary, fontSize: 13, marginBottom: 10 }}>
          Label
          <input style={inputStyle} value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. production-server" autoFocus />
        </label>
        <label style={{ display: 'block', color: ui.textSecondary, fontSize: 13, marginBottom: 10 }}>
          Notes
          <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional description..." />
        </label>
        {error && <div style={{ color: ui.error, fontSize: 13 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button style={{ background: 'none', border: `1px solid ${ui.border}`, borderRadius: 6, color: ui.textSecondary, padding: '7px 18px', cursor: 'pointer', fontSize: 13 }} onClick={onCancel}>Cancel</button>
          <button style={{ background: ui.accent, border: 'none', borderRadius: 6, color: ui.accentText, padding: '7px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 500 }} onClick={handleCreate} disabled={loading}>
            {loading ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
