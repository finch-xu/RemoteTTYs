import { useState, useRef, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Button, CopyButton, Kbd } from './primitives';
import * as Icons from '../lib/icons';

interface OnboardWizardProps {
  open: boolean;
  onClose: () => void;
  onTokenCreated?: () => void;
}

interface CreatedToken {
  token: string;
  label: string;
}

export function OnboardWizard({ open, onClose, onTokenCreated }: OnboardWizardProps) {
  const [step, setStep] = useState(1);
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<CreatedToken | null>(null);
  const [serverKey, setServerKey] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(dialogRef, onClose);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setLabel('');
    setError('');
    setCreated(null);
    apiFetch('/api/server-key')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setServerKey(data.publicKey))
      .catch(() => {});
  }, [open]);

  if (!open) return null;

  const handleCreate = async () => {
    const trimmed = label.trim();
    if (!trimmed) {
      setError('Please enter a machine name');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: trimmed, notes: '' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to create token');
        return;
      }
      const data = await res.json();
      setCreated({ token: data.token, label: trimmed });
      setStep(2);
      onTokenCreated?.();
    } catch {
      setError('Connection failed');
    } finally {
      setLoading(false);
    }
  };

  const configYaml = created
    ? `# ~/.rttys/config.json
{
  "relay": "wss://your-relay.example.com/ws/agent",
  "name": "${created.label}",
  "token": "${created.token}"${serverKey ? `,\n  "server_key": "${serverKey.replace(/\n/g, '\\n')}"` : ''}
}`
    : '';

  const startCommand = `rttys-agent -d`;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--overlay)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 20,
      }}
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        className="modal-content"
        style={{
          width: 520,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 40px)',
          overflow: 'auto',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          boxShadow: 'var(--shadow-lg)',
          padding: 24,
          fontFamily: 'inherit',
        }}
        role="dialog"
        aria-label="Onboard new agent"
      >
        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          {[1, 2, 3].map((n) => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  fontSize: 11,
                  fontWeight: 600,
                  display: 'grid',
                  placeItems: 'center',
                  background: n <= step ? 'var(--accent)' : 'var(--surface-alt)',
                  color: n <= step ? 'var(--accent-text)' : 'var(--text-muted)',
                }}
              >
                {n < step ? '✓' : n}
              </div>
              {n < 3 && (
                <div
                  style={{
                    flex: 1,
                    height: 1,
                    background: n < step ? 'var(--accent)' : 'var(--border)',
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Name */}
        {step === 1 && (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              What machine is this?
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6, marginBottom: 16 }}>
              This name shows up in the sidebar. You can rename it later.
            </p>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. production-mac"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && !loading && handleCreate()}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 14,
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface-alt)',
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {error && (
              <div
                style={{
                  marginTop: 10,
                  padding: '8px 12px',
                  background: 'var(--error-soft)',
                  color: 'var(--error)',
                  fontSize: 12.5,
                  borderRadius: 6,
                }}
              >
                {error}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleCreate} disabled={loading}>
                {loading ? 'Creating…' : 'Continue'}
              </Button>
            </div>
          </>
        )}

        {/* Step 2: Install */}
        {step === 2 && created && (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Install the agent
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6, marginBottom: 16 }}>
              Copy the config below to <code style={{ fontFamily: '"JetBrains Mono Variable", monospace', fontSize: 12 }}>~/.rttys/config.json</code> on your machine, then run the command.
            </p>

            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  config.json
                </span>
                <CopyButton text={configYaml} />
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: '12px 16px',
                  background: 'var(--term-bg, #1C1917)',
                  color: 'var(--term-fg, #E7E5E4)',
                  fontFamily: '"JetBrains Mono Variable", monospace',
                  fontSize: 11.5,
                  borderRadius: 10,
                  overflow: 'auto',
                  lineHeight: 1.6,
                }}
              >
                {configYaml}
              </pre>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Start command
                </span>
                <CopyButton text={startCommand} />
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: '12px 16px',
                  background: 'var(--term-bg, #1C1917)',
                  color: 'var(--term-fg, #E7E5E4)',
                  fontFamily: '"JetBrains Mono Variable", monospace',
                  fontSize: 12.5,
                  borderRadius: 10,
                }}
              >
                {startCommand}
              </pre>
            </div>

            <div
              style={{
                padding: '10px 12px',
                background: 'var(--warning-soft)',
                color: 'var(--warning)',
                fontSize: 12,
                borderRadius: 8,
                marginTop: 4,
              }}
            >
              Copy the token now — it will appear masked from this point on.
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <Button variant="secondary" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button variant="primary" onClick={() => setStep(3)}>
                I've installed it
              </Button>
            </div>
          </>
        )}

        {/* Step 3: Waiting (guidance, since we can't easily attach to this token's fingerprint) */}
        {step === 3 && (
          <>
            <div style={{ textAlign: 'center', padding: '12px 0 20px' }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  margin: '0 auto 14px',
                  borderRadius: '50%',
                  background: 'var(--online-soft)',
                  display: 'grid',
                  placeItems: 'center',
                  color: 'var(--online)',
                }}
              >
                <Icons.Check size={30} strokeWidth={2} />
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                Ready for connection
              </h2>
              <p
                style={{
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                  marginTop: 8,
                  maxWidth: 380,
                  marginInline: 'auto',
                  lineHeight: 1.5,
                }}
              >
                Once the agent starts, it will appear in the Machines list. Open the command palette with <Kbd>⌘</Kbd>
                <Kbd>K</Kbd> to jump to it.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="primary" onClick={onClose}>
                Done
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
