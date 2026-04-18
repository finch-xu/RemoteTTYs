import { useState } from 'react';
import { UI_FONT } from '../lib/theme';
import { Button, PasswordStrength, scorePassword } from './primitives';

interface SetupPageProps {
  onSetupComplete: () => void;
}

export function SetupPage({ onSetupComplete }: SetupPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const inputStyle: React.CSSProperties = {
    background: 'var(--surface-alt)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text-primary)',
    padding: '10px 12px',
    fontSize: 14,
    fontFamily: 'inherit',
    outline: 'none',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username.trim()) {
      setError('Username is required');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (scorePassword(password) < 2) {
      setError('Please choose a stronger password (mix case, numbers, and symbols)');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/setup/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Setup failed');
        return;
      }
      onSetupComplete();
    } catch {
      setError('Connection failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100vw',
        height: '100vh',
        background: 'var(--bg)',
        fontFamily: UI_FONT,
        padding: 20,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          width: 380,
          maxWidth: '100%',
          padding: 32,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          boxShadow: 'var(--shadow-lg)',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              background: 'var(--accent)',
              color: 'var(--accent-text)',
              display: 'grid',
              placeItems: 'center',
              fontFamily: '"JetBrains Mono Variable", monospace',
              fontSize: 12,
              fontWeight: 700,
              boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.15)',
            }}
          >
            ›_
          </div>
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
              Welcome to RemoteTTYs
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Create your admin account</div>
          </div>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--text-secondary)' }}>
          Username
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} style={inputStyle} autoFocus />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--text-secondary)' }}>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
          <PasswordStrength password={password} />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--text-secondary)' }}>
          Confirm password
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={inputStyle}
          />
        </label>

        {error && (
          <div
            style={{
              padding: '8px 12px',
              background: 'var(--error-soft)',
              color: 'var(--error)',
              fontSize: 12.5,
              fontWeight: 500,
              borderRadius: 6,
            }}
          >
            {error}
          </div>
        )}

        <Button
          variant="primary"
          size="lg"
          type="submit"
          disabled={loading}
          style={{ justifyContent: 'center', marginTop: 4 }}
        >
          {loading ? 'Creating…' : 'Create admin account'}
        </Button>
      </form>
    </div>
  );
}
