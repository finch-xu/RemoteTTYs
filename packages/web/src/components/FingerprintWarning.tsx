import { useState } from 'react';
import { useTheme } from '../hooks/useTheme';
import { UI_FONT, MONO_FONT } from '../lib/theme';

interface FingerprintWarningProps {
  agentName: string;
  storedFingerprint: string;
  currentFingerprint: string;
  onAccept: () => void;
  onReject: () => void;
}

export function FingerprintWarning({ agentName, storedFingerprint, currentFingerprint, onAccept, onReject }: FingerprintWarningProps) {
  const { ui } = useTheme();
  const [confirming, setConfirming] = useState(false);

  const monoBlockStyle: React.CSSProperties = {
    background: ui.surfaceAlt,
    border: `1px solid ${ui.border}`,
    borderRadius: 6,
    padding: '8px 10px',
    fontFamily: MONO_FONT,
    fontSize: 12,
    color: ui.textPrimary,
    wordBreak: 'break-all',
    marginTop: 4,
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: ui.overlay, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: ui.surface, border: `1px solid ${ui.border}`, borderRadius: 12, padding: 24, width: 480, maxWidth: 'calc(100vw - 32px)', fontFamily: UI_FONT }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 22 }}>&#9888;</span>
          <h3 style={{ margin: 0, color: ui.error, fontSize: 17, fontWeight: 600 }}>
            Identity Key Changed
          </h3>
        </div>

        <p style={{ margin: '0 0 10px', color: ui.textPrimary, fontSize: 14, lineHeight: 1.5 }}>
          Agent <strong>"{agentName}"</strong> is presenting a different identity key than expected.
        </p>
        <p style={{ margin: '0 0 16px', color: ui.textSecondary, fontSize: 13, lineHeight: 1.5 }}>
          This could mean the agent was reinstalled or reconfigured. It may also indicate a man-in-the-middle attack. Do not continue unless you are certain this key is legitimate.
        </p>

        <div style={{ marginBottom: 16 }}>
          <div style={{ color: ui.textSecondary, fontSize: 12, marginBottom: 2 }}>Stored fingerprint</div>
          <div style={monoBlockStyle}>{storedFingerprint}</div>
          <div style={{ color: ui.textSecondary, fontSize: 12, marginTop: 10, marginBottom: 2 }}>Current fingerprint</div>
          <div style={{ ...monoBlockStyle, border: `1px solid ${ui.error}`, color: ui.error }}>{currentFingerprint}</div>
        </div>

        <p style={{ margin: '0 0 16px', color: ui.textSecondary, fontSize: 13, lineHeight: 1.5 }}>
          To verify the current key, run <span style={{ fontFamily: MONO_FONT, background: ui.surfaceAlt, padding: '1px 5px', borderRadius: 4, fontSize: 12 }}>rttys-agent status</span> on the remote machine and compare the fingerprint shown.
        </p>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            style={{ background: 'none', border: `1px solid ${ui.border}`, borderRadius: 6, color: ui.textSecondary, padding: '7px 18px', cursor: 'pointer', fontSize: 13, fontFamily: UI_FONT }}
            onClick={onReject}
          >
            Disconnect
          </button>
          {confirming ? (
            <button
              style={{ background: ui.error, border: 'none', borderRadius: 6, color: '#FFFFFF', padding: '7px 18px', cursor: 'pointer', fontSize: 13, fontFamily: UI_FONT, fontWeight: 500 }}
              onClick={onAccept}
            >
              Confirm — I trust this key
            </button>
          ) : (
            <button
              style={{ background: ui.surfaceAlt, border: `1px solid ${ui.border}`, borderRadius: 6, color: ui.textPrimary, padding: '7px 18px', cursor: 'pointer', fontSize: 13, fontFamily: UI_FONT }}
              onClick={() => setConfirming(true)}
            >
              Ignore and Continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
