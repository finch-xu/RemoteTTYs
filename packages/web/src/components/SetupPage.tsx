import { useState } from 'react';
import { useTheme } from '../hooks/useTheme';
import { UI_FONT } from '../lib/theme';

interface SetupPageProps {
  onSetupComplete: () => void;
}

export function SetupPage({ onSetupComplete }: SetupPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { ui: t } = useTheme();

  const inputStyle: React.CSSProperties = {
    background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8,
    color: t.textPrimary, padding: '10px 14px', fontSize: 14, fontFamily: 'inherit',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) { setError('Username is required'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/setup/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      if (!res.ok) {
        const data = await res.json();
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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100vw', height: '100vh', background: t.bg }}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 320, padding: '0 20px', boxSizing: 'border-box', fontFamily: UI_FONT }}>
        <h2 style={{ color: t.textPrimary, margin: '0 0 4px', fontSize: 22, fontWeight: 600 }}>
          Welcome to RemoteTTYs
        </h2>
        <p style={{ color: t.textSecondary, fontSize: 13, margin: '0 0 12px' }}>
          Create your admin account to get started.
        </p>
        <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" style={inputStyle} autoFocus />
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" style={inputStyle} />
        <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm Password" style={inputStyle} />
        {error && <div style={{ color: t.error, fontSize: 13 }}>{error}</div>}
        <button type="submit" style={{ background: t.accent, border: 'none', borderRadius: 8, color: t.accentText, padding: '10px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', marginTop: 4, fontWeight: 500 }} disabled={loading}>
          {loading ? 'Creating...' : 'Create Admin Account'}
        </button>
      </form>
    </div>
  );
}
