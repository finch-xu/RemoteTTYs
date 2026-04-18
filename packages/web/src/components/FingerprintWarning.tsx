import { useState, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { UI_FONT, MONO_FONT } from '../lib/theme';

interface FingerprintWarningProps {
  agentName: string;
  storedFingerprint: string;
  currentFingerprint: string;
  onAccept: () => void;
  onReject: () => void;
}

export function FingerprintWarning({
  agentName,
  storedFingerprint,
  currentFingerprint,
  onAccept,
  onReject,
}: FingerprintWarningProps) {
  const [confirming, setConfirming] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, onReject);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--overlay)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: 20,
      }}
    >
      <div
        ref={dialogRef}
        className="modal-content"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          width: 540,
          maxWidth: '100%',
          maxHeight: 'calc(100vh - 40px)',
          overflow: 'auto',
          fontFamily: UI_FONT,
          boxShadow: 'var(--shadow-lg)',
          position: 'relative',
        }}
        role="alertdialog"
        aria-label="Host identity changed"
      >
        {/* Red accent bar */}
        <div
          style={{
            height: 3,
            background: 'var(--error)',
            borderTopLeftRadius: 14,
            borderTopRightRadius: 14,
          }}
        />

        <div style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <AlertTriangle size={22} strokeWidth={1.75} color="var(--error)" />
            <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 16, fontWeight: 600 }}>
              Host identity changed
            </h3>
          </div>

          <p
            style={{
              margin: '0 0 10px',
              color: 'var(--text-primary)',
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            Agent <strong>"{agentName}"</strong> is presenting a different identity key than stored.
          </p>
          <p
            style={{
              margin: '0 0 18px',
              color: 'var(--text-secondary)',
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            This could mean the agent was reinstalled or reconfigured. It may also indicate a
            man-in-the-middle attack. Do not continue unless you are certain this key is legitimate.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: 6,
                }}
              >
                Stored
              </div>
              <div
                style={{
                  background: 'var(--surface-alt)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '8px 10px',
                  fontFamily: MONO_FONT,
                  fontSize: 11.5,
                  color: 'var(--text-muted)',
                  wordBreak: 'break-all',
                  textDecoration: 'line-through',
                  lineHeight: 1.5,
                }}
              >
                {storedFingerprint}
              </div>
            </div>
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--error)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: 6,
                }}
              >
                Current
              </div>
              <div
                style={{
                  background: 'var(--error-soft)',
                  border: '1px solid var(--error)',
                  borderRadius: 8,
                  padding: '8px 10px',
                  fontFamily: MONO_FONT,
                  fontSize: 11.5,
                  color: 'var(--error)',
                  wordBreak: 'break-all',
                  lineHeight: 1.5,
                }}
              >
                {currentFingerprint}
              </div>
            </div>
          </div>

          <p
            style={{
              margin: '0 0 18px',
              color: 'var(--text-secondary)',
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            To verify, run{' '}
            <span
              style={{
                fontFamily: MONO_FONT,
                background: 'var(--surface-alt)',
                padding: '1px 6px',
                borderRadius: 4,
                fontSize: 12,
              }}
            >
              rttys-agent status
            </span>{' '}
            on the remote machine and compare the fingerprint shown.
          </p>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text-primary)',
                padding: '8px 18px',
                cursor: 'pointer',
                fontSize: 13,
                fontFamily: UI_FONT,
                fontWeight: 500,
              }}
              onClick={onReject}
            >
              Disconnect
            </button>
            {confirming ? (
              <button
                style={{
                  background: 'var(--error)',
                  border: 'none',
                  borderRadius: 8,
                  color: 'var(--accent-text)',
                  padding: '8px 18px',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontFamily: UI_FONT,
                  fontWeight: 500,
                }}
                onClick={onAccept}
              >
                Confirm — trust this key
              </button>
            ) : (
              <button
                style={{
                  background: 'var(--surface-alt)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  color: 'var(--text-primary)',
                  padding: '8px 18px',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontFamily: UI_FONT,
                  fontWeight: 500,
                }}
                onClick={() => setConfirming(true)}
              >
                Trust new identity
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
