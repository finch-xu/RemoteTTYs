import { useState } from 'react';
import { useTheme } from '../hooks/useTheme';
import { UI_FONT } from '../lib/theme';

interface LoginPageProps {
  onLogin: () => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { ui: t } = useTheme();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        setError('Invalid username or password');
        return;
      }

      onLogin();
    } catch {
      setError('Connection failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100vw', height: '100vh', background: t.bg }}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 320, fontFamily: UI_FONT }}>
        <h2 style={{ color: t.textPrimary, margin: '0 0 4px', fontSize: 22, fontWeight: 600 }}>
          RemoteTTYs
        </h2>
        <p style={{ color: t.textSecondary, fontSize: 13, margin: '0 0 12px' }}>
          Sign in to your account
        </p>
        <input
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="Username"
          style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, color: t.textPrimary, padding: '10px 14px', fontSize: 14, fontFamily: 'inherit' }}
          autoFocus
        />
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Password"
          style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, color: t.textPrimary, padding: '10px 14px', fontSize: 14, fontFamily: 'inherit' }}
        />
        {error && <div style={{ color: t.error, fontSize: 13 }}>{error}</div>}
        <button type="submit" style={{ background: t.accent, border: 'none', borderRadius: 8, color: t.accentText, padding: '10px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', marginTop: 4, fontWeight: 500 }} disabled={loading}>
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
