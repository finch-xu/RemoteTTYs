import { useState, useEffect, useCallback, useRef } from 'react';
import { UserPlus, Key, Trash2, RefreshCw } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useTheme } from '../hooks/useTheme';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { UI_FONT } from '../lib/theme';

interface UserStats {
  username: string;
  role: string;
  tokenCount: number;
  agentCount: number;
  onlineAgentCount: number;
  created_at: string;
}

function getInputStyle(ui: ReturnType<typeof useTheme>['ui']): React.CSSProperties {
  return {
    display: 'block', width: '100%', background: ui.surfaceAlt, border: `1px solid ${ui.border}`,
    borderRadius: 6, color: ui.textPrimary, padding: '8px 10px', fontSize: 13, marginTop: 4,
    fontFamily: 'inherit', boxSizing: 'border-box',
  };
}

export function UserManagementPage() {
  const { ui } = useTheme();
  const [users, setUsers] = useState<UserStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [resetPasswordTarget, setResetPasswordTarget] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/stats');
      if (res.ok) setUsers(await res.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsers();
    const interval = setInterval(fetchUsers, 10_000);
    return () => clearInterval(interval);
  }, [fetchUsers]);

  const handleDelete = async (username: string) => {
    if (!confirm(`Delete user "${username}"? This will also delete all their tokens and disconnect their agents.`)) return;
    const res = await apiFetch(`/api/users/${encodeURIComponent(username)}`, { method: 'DELETE' });
    if (res.ok) fetchUsers();
  };

  const cellStyle: React.CSSProperties = {
    padding: '10px 14px', textAlign: 'left', borderBottom: `1px solid ${ui.border}`,
    fontSize: 13, color: ui.textPrimary,
  };

  const headerCellStyle: React.CSSProperties = {
    ...cellStyle, color: ui.textSecondary, fontWeight: 600, fontSize: 12,
    textTransform: 'uppercase', letterSpacing: '0.3px',
  };

  return (
    <div style={{ flex: 1, padding: 'clamp(14px, 4vw, 28px)', overflow: 'auto', fontFamily: UI_FONT }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ margin: 0, color: ui.textPrimary, fontSize: 20, fontWeight: 600 }}>User Management</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={fetchUsers}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: `1px solid ${ui.border}`, borderRadius: 6, color: ui.textSecondary, padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontFamily: UI_FONT }}
          >
            <RefreshCw size={14} strokeWidth={1.75} /> Refresh
          </button>
          <button
            onClick={() => setShowCreateDialog(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: ui.accent, border: 'none', borderRadius: 6, color: ui.accentText, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontFamily: UI_FONT, fontWeight: 500 }}
          >
            <UserPlus size={14} strokeWidth={1.75} /> Create User
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ color: ui.textMuted, padding: 20 }}>Loading...</div>
      ) : users.length === 0 ? (
        <div style={{ color: ui.textMuted, padding: 20 }}>No users found.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ background: ui.surface, border: `1px solid ${ui.border}`, borderRadius: 10, overflow: 'hidden', minWidth: 560 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={headerCellStyle}>Username</th>
                <th style={headerCellStyle}>Role</th>
                <th style={headerCellStyle}>Tokens</th>
                <th style={headerCellStyle}>Agents</th>
                <th style={headerCellStyle}>Created</th>
                <th style={{ ...headerCellStyle, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.username}>
                  <td style={cellStyle}>
                    <span style={{ fontWeight: 500 }}>{user.username}</span>
                  </td>
                  <td style={cellStyle}>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                      background: user.role === 'admin' ? ui.accent + '20' : ui.surfaceAlt,
                      color: user.role === 'admin' ? ui.accent : ui.textSecondary,
                    }}>
                      {user.role}
                    </span>
                  </td>
                  <td style={cellStyle}>{user.tokenCount}</td>
                  <td style={cellStyle}>
                    {user.agentCount}
                    {user.onlineAgentCount > 0 && (
                      <span style={{ color: ui.online, marginLeft: 6, fontSize: 12 }}>
                        ({user.onlineAgentCount} online)
                      </span>
                    )}
                  </td>
                  <td style={{ ...cellStyle, color: ui.textSecondary, fontSize: 12 }}>
                    {new Date(user.created_at + 'Z').toLocaleDateString()}
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => setResetPasswordTarget(user.username)}
                        title="Reset Password"
                        style={{ background: 'none', border: `1px solid ${ui.border}`, borderRadius: 5, color: ui.textSecondary, padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
                      >
                        <Key size={13} strokeWidth={1.75} /> Password
                      </button>
                      <button
                        onClick={() => handleDelete(user.username)}
                        title="Delete User"
                        style={{ background: 'none', border: `1px solid ${ui.border}`, borderRadius: 5, color: ui.error, padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
                      >
                        <Trash2 size={13} strokeWidth={1.75} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {showCreateDialog && (
        <CreateUserDialog
          onCreated={() => { setShowCreateDialog(false); fetchUsers(); }}
          onCancel={() => setShowCreateDialog(false)}
        />
      )}

      {resetPasswordTarget && (
        <ResetPasswordDialog
          username={resetPasswordTarget}
          onDone={() => { setResetPasswordTarget(null); }}
          onCancel={() => setResetPasswordTarget(null)}
        />
      )}
    </div>
  );
}

function CreateUserDialog({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const { ui } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, onCancel);

  const inputStyle = getInputStyle(ui);

  const handleCreate = async () => {
    if (!username.trim() || !password) { setError('Username and password required'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (!res.ok) { const data = await res.json(); setError(data.error || 'Failed'); return; }
      onCreated();
    } catch { setError('Connection failed'); } finally { setLoading(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: ui.overlay, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={onCancel}>
      <div ref={dialogRef} className="modal-content" style={{ background: ui.surface, border: `1px solid ${ui.border}`, borderRadius: 12, padding: 20, width: 380, maxWidth: 'calc(100vw - 32px)', boxSizing: 'border-box', fontFamily: UI_FONT }} onClick={e => e.stopPropagation()} role="dialog" aria-label="Create User">
        <h3 style={{ margin: '0 0 14px', color: ui.textPrimary, fontSize: 16, fontWeight: 600 }}>Create User</h3>
        <label style={{ display: 'block', color: ui.textSecondary, fontSize: 13, marginBottom: 10 }}>
          Username
          <input style={inputStyle} value={username} onChange={e => setUsername(e.target.value)} autoFocus />
        </label>
        <label style={{ display: 'block', color: ui.textSecondary, fontSize: 13, marginBottom: 10 }}>
          Password
          <input style={inputStyle} type="password" value={password} onChange={e => setPassword(e.target.value)} />
        </label>
        {error && <div style={{ color: ui.error, fontSize: 13, marginBottom: 8 }}>{error}</div>}
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

function ResetPasswordDialog({ username, onDone, onCancel }: { username: string; onDone: () => void; onCancel: () => void }) {
  const { ui } = useTheme();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, onCancel);

  const inputStyle = getInputStyle(ui);

  const handleReset = async () => {
    if (!password) { setError('Password required'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`/api/users/${encodeURIComponent(username)}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) { const data = await res.json(); setError(data.error || 'Failed'); return; }
      onDone();
    } catch { setError('Connection failed'); } finally { setLoading(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: ui.overlay, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={onCancel}>
      <div ref={dialogRef} className="modal-content" style={{ background: ui.surface, border: `1px solid ${ui.border}`, borderRadius: 12, padding: 20, width: 380, maxWidth: 'calc(100vw - 32px)', boxSizing: 'border-box', fontFamily: UI_FONT }} onClick={e => e.stopPropagation()} role="dialog" aria-label="Reset Password">
        <h3 style={{ margin: '0 0 14px', color: ui.textPrimary, fontSize: 16, fontWeight: 600 }}>Reset Password</h3>
        <p style={{ color: ui.textSecondary, fontSize: 13, margin: '0 0 12px' }}>
          Set a new password for <strong style={{ color: ui.textPrimary }}>{username}</strong>
        </p>
        <label style={{ display: 'block', color: ui.textSecondary, fontSize: 13, marginBottom: 10 }}>
          New Password
          <input style={inputStyle} type="password" value={password} onChange={e => setPassword(e.target.value)} autoFocus />
        </label>
        {error && <div style={{ color: ui.error, fontSize: 13, marginBottom: 8 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button style={{ background: 'none', border: `1px solid ${ui.border}`, borderRadius: 6, color: ui.textSecondary, padding: '7px 18px', cursor: 'pointer', fontSize: 13 }} onClick={onCancel}>Cancel</button>
          <button style={{ background: ui.accent, border: 'none', borderRadius: 6, color: ui.accentText, padding: '7px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 500 }} onClick={handleReset} disabled={loading}>
            {loading ? 'Saving...' : 'Reset Password'}
          </button>
        </div>
      </div>
    </div>
  );
}
