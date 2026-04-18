import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../lib/api';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { UI_FONT } from '../lib/theme';
import { Page, Card, Button, Chip, PasswordStrength } from './primitives';
import * as Icons from '../lib/icons';

interface UserStats {
  username: string;
  role: string;
  tokenCount: number;
  agentCount: number;
  onlineAgentCount: number;
  created_at: string;
}

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  background: 'var(--surface-alt)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text-primary)',
  padding: '10px 12px',
  fontSize: 14,
  marginTop: 4,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  outline: 'none',
};

export function UserManagementPage() {
  const [users, setUsers] = useState<UserStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [resetPasswordTarget, setResetPasswordTarget] = useState<string | null>(null);
  const prevHashRef = useRef('');

  const fetchUsers = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/stats');
      if (res.ok) {
        const data = await res.json();
        const hash = JSON.stringify(data);
        if (hash !== prevHashRef.current) {
          prevHashRef.current = hash;
          setUsers(data);
        }
      }
    } catch {
      // network errors leave previous state in place
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsers();
    const interval = setInterval(fetchUsers, 10_000);
    return () => clearInterval(interval);
  }, [fetchUsers]);

  const handleDelete = async (username: string) => {
    if (!confirm(`Delete user "${username}"? All their tokens and agents will be removed.`)) return;
    const res = await apiFetch(`/api/users/${encodeURIComponent(username)}`, { method: 'DELETE' });
    if (res.ok) fetchUsers();
  };

  return (
    <>
      <Page
        title="Users"
        subtitle="Accounts that can log into RemoteTTYs"
        actions={
          <>
            <Button variant="ghost" size="sm" icon={Icons.RefreshCw} onClick={fetchUsers}>
              Refresh
            </Button>
            <Button variant="primary" icon={Icons.UserPlus} onClick={() => setShowCreateDialog(true)}>
              Invite user
            </Button>
          </>
        }
      >
        <Card padding={0}>
          {loading ? (
            <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
          ) : users.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No users found.
            </div>
          ) : (
            users.map((u, i) => (
              <div
                key={u.username}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.4fr 0.7fr 1fr 1fr auto',
                  alignItems: 'center',
                  gap: 14,
                  padding: '14px 18px',
                  borderBottom: i < users.length - 1 ? '1px solid var(--border)' : 'none',
                  fontSize: 13,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {u.username}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                    Joined {new Date(u.created_at + 'Z').toLocaleDateString()}
                  </div>
                </div>
                <Chip tone={u.role === 'admin' ? 'accent' : 'neutral'} size="sm">
                  {u.role}
                </Chip>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                  {u.tokenCount} token{u.tokenCount === 1 ? '' : 's'}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                  {u.agentCount} agent{u.agentCount === 1 ? '' : 's'}
                  {u.onlineAgentCount > 0 && (
                    <span style={{ color: 'var(--online)', marginLeft: 6 }}>
                      · {u.onlineAgentCount} online
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Icons.Key}
                    onClick={() => setResetPasswordTarget(u.username)}
                  >
                    Password
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    icon={Icons.Trash2}
                    onClick={() => handleDelete(u.username)}
                  />
                </div>
              </div>
            ))
          )}
        </Card>
      </Page>

      {showCreateDialog && (
        <CreateUserDialog
          onCreated={() => {
            setShowCreateDialog(false);
            fetchUsers();
          }}
          onCancel={() => setShowCreateDialog(false)}
        />
      )}

      {resetPasswordTarget && (
        <ResetPasswordDialog
          username={resetPasswordTarget}
          onDone={() => setResetPasswordTarget(null)}
          onCancel={() => setResetPasswordTarget(null)}
        />
      )}
    </>
  );
}

function dialogShell(): React.CSSProperties {
  return {
    position: 'fixed',
    inset: 0,
    background: 'var(--overlay)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: 20,
  };
}

function dialogCard(): React.CSSProperties {
  return {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: 24,
    width: 420,
    maxWidth: 'calc(100vw - 32px)',
    boxSizing: 'border-box',
    fontFamily: UI_FONT,
    boxShadow: 'var(--shadow-lg)',
  };
}

function CreateUserDialog({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, onCancel);

  const handleCreate = async () => {
    if (!username.trim() || !password) {
      setError('Username and password required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed');
        return;
      }
      onCreated();
    } catch {
      setError('Connection failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={dialogShell()} onClick={onCancel}>
      <div
        ref={dialogRef}
        className="modal-content"
        style={dialogCard()}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Invite user"
      >
        <h3 style={{ margin: '0 0 14px', color: 'var(--text-primary)', fontSize: 17, fontWeight: 600 }}>
          Invite user
        </h3>
        <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 12.5, marginBottom: 10 }}>
          Username
          <input
            style={inputStyle}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
        </label>
        <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 12.5, marginBottom: 10 }}>
          Password
          <input
            style={inputStyle}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <PasswordStrength password={password} />
        </label>
        {error && (
          <div
            style={{
              padding: '8px 12px',
              background: 'var(--error-soft)',
              color: 'var(--error)',
              fontSize: 12.5,
              borderRadius: 6,
              marginBottom: 10,
            }}
          >
            {error}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleCreate} disabled={loading}>
            {loading ? 'Creating…' : 'Create user'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ResetPasswordDialog({
  username,
  onDone,
  onCancel,
}: {
  username: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, onCancel);

  const handleReset = async () => {
    if (!password) {
      setError('Password required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`/api/users/${encodeURIComponent(username)}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed');
        return;
      }
      onDone();
    } catch {
      setError('Connection failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={dialogShell()} onClick={onCancel}>
      <div
        ref={dialogRef}
        className="modal-content"
        style={dialogCard()}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Reset password"
      >
        <h3 style={{ margin: '0 0 10px', color: 'var(--text-primary)', fontSize: 17, fontWeight: 600 }}>
          Reset password
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 14px', lineHeight: 1.5 }}>
          Set a new password for <strong style={{ color: 'var(--text-primary)' }}>{username}</strong>.
        </p>
        <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 12.5, marginBottom: 10 }}>
          New password
          <input
            style={inputStyle}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          <PasswordStrength password={password} />
        </label>
        {error && (
          <div
            style={{
              padding: '8px 12px',
              background: 'var(--error-soft)',
              color: 'var(--error)',
              fontSize: 12.5,
              borderRadius: 6,
              marginBottom: 10,
            }}
          >
            {error}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleReset} disabled={loading}>
            {loading ? 'Saving…' : 'Reset password'}
          </Button>
        </div>
      </div>
    </div>
  );
}
