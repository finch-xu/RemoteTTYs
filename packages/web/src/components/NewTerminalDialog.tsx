import { useState } from 'react';
import { useTheme } from '../hooks/useTheme';
import { UI_FONT, MONO_FONT } from '../lib/theme';

interface NewTerminalDialogProps {
  onSubmit: (shell: string, cwd: string) => void;
  onCancel: () => void;
}

const presets = [
  { label: 'Default Shell', shell: '', cwd: '~' },
  { label: 'zsh', shell: '/bin/zsh', cwd: '~' },
  { label: 'bash', shell: '/bin/bash', cwd: '~' },
  { label: 'claude', shell: 'claude', cwd: '~' },
];

export function NewTerminalDialog({ onSubmit, onCancel }: NewTerminalDialogProps) {
  const { ui } = useTheme();
  const [shell, setShell] = useState('');
  const [cwd, setCwd] = useState('~');

  const inputStyle: React.CSSProperties = {
    display: 'block', width: '100%', background: ui.surfaceAlt, border: `1px solid ${ui.border}`,
    borderRadius: 6, color: ui.textPrimary, padding: '8px 10px', fontSize: 13, marginTop: 4,
    fontFamily: MONO_FONT, boxSizing: 'border-box', outline: 'none',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: ui.overlay, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={onCancel}>
      <div style={{ background: ui.surface, border: `1px solid ${ui.border}`, borderRadius: 12, padding: 20, width: 380, fontFamily: UI_FONT }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 14px', color: ui.textPrimary, fontSize: 16, fontWeight: 600 }}>New Terminal</h3>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {presets.map(p => (
            <button key={p.label} style={{ background: ui.surfaceAlt, border: `1px solid ${ui.border}`, borderRadius: 6, color: ui.textPrimary, padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontFamily: MONO_FONT }} onClick={() => onSubmit(p.shell, p.cwd)}>
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ borderTop: `1px solid ${ui.border}`, paddingTop: 14 }}>
          <label style={{ display: 'block', color: ui.textSecondary, fontSize: 13, marginBottom: 10 }}>
            Shell
            <input style={inputStyle} value={shell} onChange={e => setShell(e.target.value)} placeholder="leave empty for default" />
          </label>
          <label style={{ display: 'block', color: ui.textSecondary, fontSize: 13, marginBottom: 10 }}>
            Working Directory
            <input style={inputStyle} value={cwd} onChange={e => setCwd(e.target.value)} placeholder="~" />
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button style={{ background: 'none', border: `1px solid ${ui.border}`, borderRadius: 6, color: ui.textSecondary, padding: '7px 18px', cursor: 'pointer', fontSize: 13 }} onClick={onCancel}>Cancel</button>
            <button style={{ background: ui.accent, border: 'none', borderRadius: 6, color: ui.accentText, padding: '7px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 500 }} onClick={() => onSubmit(shell, cwd)}>Create</button>
          </div>
        </div>
      </div>
    </div>
  );
}
