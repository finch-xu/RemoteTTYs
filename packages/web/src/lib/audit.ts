import type { UITheme } from './theme';

export const ACTION_LABELS: Record<string, string> = {
  login: 'Login',
  login_fail: 'Login Failed',
  login_rate_limited: 'Rate Limited',
  password_change: 'Password Changed',
  setup: 'Initial Setup',
  user_create: 'User Created',
  user_delete: 'User Deleted',
  agent_connect: 'Agent Connected',
  agent_disconnect: 'Agent Disconnected',
  agent_reject: 'Agent Rejected',
  agent_delete: 'Agent Deleted',
  agent_fingerprint_reset: 'Fingerprint Reset',
  token_create: 'Token Created',
  token_delete: 'Token Deleted',
  token_toggle: 'Token Toggled',
  session_create: 'Session Created',
  session_close: 'Session Closed',
};

export type ActionCategory = 'auth' | 'user' | 'agent' | 'token' | 'session';

export const ACTION_CATEGORIES: Record<string, ActionCategory> = {
  login: 'auth', login_fail: 'auth', login_rate_limited: 'auth', password_change: 'auth',
  setup: 'user', user_create: 'user', user_delete: 'user',
  agent_connect: 'agent', agent_disconnect: 'agent', agent_reject: 'agent',
  agent_delete: 'agent', agent_fingerprint_reset: 'agent',
  token_create: 'token', token_delete: 'token', token_toggle: 'token',
  session_create: 'session', session_close: 'session',
};

export function getCategoryColors(ui: UITheme): Record<ActionCategory, { bg: string; text: string }> {
  return {
    auth: { bg: `${ui.accent}20`, text: ui.accent },
    user: { bg: `${ui.warning}20`, text: ui.warning },
    agent: { bg: `${ui.online}20`, text: ui.online },
    token: { bg: `${ui.textSecondary}18`, text: ui.textSecondary },
    session: { bg: `${ui.accent}12`, text: ui.textMuted },
  };
}

export const CATEGORY_LABELS: Record<ActionCategory, string> = {
  auth: 'Auth',
  user: 'User',
  agent: 'Agent',
  token: 'Token',
  session: 'Session',
};

export const ACTIONS_BY_CATEGORY: Record<ActionCategory, string[]> = {
  auth: ['login', 'login_fail', 'login_rate_limited', 'password_change'],
  user: ['setup', 'user_create', 'user_delete'],
  agent: ['agent_connect', 'agent_disconnect', 'agent_reject', 'agent_delete', 'agent_fingerprint_reset'],
  token: ['token_create', 'token_delete', 'token_toggle'],
  session: ['session_create', 'session_close'],
};

export function relativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate + 'Z').getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
