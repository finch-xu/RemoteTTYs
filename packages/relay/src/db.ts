import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

/** Hash a raw agent token with SHA-256 for secure storage/lookup */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db: Database.Database;

export function initDB() {
  const dbPath = process.env.RTTYS_DB || path.join(__dirname, '..', 'data', 'relay.db');
  const dbDir = path.dirname(dbPath);
  fs.mkdirSync(dbDir, { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT UNIQUE NOT NULL,
      password      TEXT NOT NULL,
      token_version INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agent_tokens (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      token      TEXT UNIQUE NOT NULL,
      label      TEXT NOT NULL,
      notes      TEXT DEFAULT '',
      enabled    INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agents (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      os         TEXT NOT NULL,
      token      TEXT NOT NULL DEFAULT '',
      online     INTEGER NOT NULL DEFAULT 0,
      last_seen  TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(token, name)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      ts         TEXT DEFAULT (datetime('now')),
      action     TEXT NOT NULL,
      user       TEXT,
      detail     TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
    CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user);
    CREATE INDEX IF NOT EXISTS idx_audit_log_ts ON audit_log(ts);
  `);

  // Migrations for existing databases
  try { db.exec("ALTER TABLE agent_tokens ADD COLUMN notes TEXT DEFAULT ''"); } catch {}
  try { db.exec("ALTER TABLE agent_tokens ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1"); } catch {}
  try { db.exec("ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE users ADD COLUMN preferences TEXT DEFAULT '{}'"); } catch {}
  try { db.exec("ALTER TABLE agents ADD COLUMN fingerprint TEXT"); } catch {}
  try { db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'"); } catch {}

  console.log(`Database: ${dbPath}`);
}

// --- Users ---

interface UserRow {
  id: number;
  username: string;
  password: string;
  role: string;
  token_version: number;
  created_at: string;
}

export function getUser(username: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
}

export function createUser(username: string, password: string, role: string = 'user') {
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(username, hash, role);
}

export function deleteUser(username: string): boolean {
  const result = db.prepare('DELETE FROM users WHERE username = ?').run(username);
  return result.changes > 0;
}

export function listUsers() {
  return db.prepare('SELECT id, username, role, created_at FROM users ORDER BY id').all();
}

export function updatePassword(username: string, newPassword: string): boolean {
  const hash = bcrypt.hashSync(newPassword, 10);
  const result = db.prepare('UPDATE users SET password = ?, token_version = token_version + 1 WHERE username = ?').run(hash, username);
  return result.changes > 0;
}

export function getTokenVersion(username: string): number | undefined {
  const row = db.prepare('SELECT token_version FROM users WHERE username = ?').get(username) as { token_version: number } | undefined;
  return row?.token_version;
}

export function getUserPreferences(username: string): Record<string, unknown> {
  const row = db.prepare('SELECT preferences FROM users WHERE username = ?').get(username) as { preferences: string } | undefined;
  try { return JSON.parse(row?.preferences ?? '{}'); } catch { return {}; }
}

export function setUserPreferences(username: string, prefs: Record<string, unknown>): boolean {
  const result = db.prepare('UPDATE users SET preferences = ? WHERE username = ?').run(JSON.stringify(prefs), username);
  return result.changes > 0;
}

// --- Agent Tokens ---

export interface TokenRow {
  id: number;
  token: string;
  label: string;
  notes: string;
  enabled: number;
  created_at: string;
}

export function getAgentToken(token: string): TokenRow | undefined {
  return db.prepare('SELECT * FROM agent_tokens WHERE token = ?').get(token) as TokenRow | undefined;
}

export function getAgentTokenById(id: number): TokenRow | undefined {
  return db.prepare('SELECT * FROM agent_tokens WHERE id = ?').get(id) as TokenRow | undefined;
}

export function createAgentToken(token: string, label: string, notes: string) {
  db.prepare('INSERT INTO agent_tokens (token, label, notes) VALUES (?, ?, ?)').run(token, label, notes);
}

export function deleteAgentToken(token: string): boolean {
  const result = db.prepare('DELETE FROM agent_tokens WHERE token = ?').run(token);
  return result.changes > 0;
}

export function listAgentTokens(): TokenRow[] {
  return db.prepare('SELECT id, token, label, notes, enabled, created_at FROM agent_tokens ORDER BY id').all() as TokenRow[];
}

export function hasAgentTokens(): boolean {
  const count = db.prepare('SELECT COUNT(*) as n FROM agent_tokens').get() as { n: number };
  return count.n > 0;
}

export function setAgentTokenEnabled(id: number, enabled: boolean): boolean {
  const result = db.prepare('UPDATE agent_tokens SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
  return result.changes > 0;
}

export function hasUsers(): boolean {
  const count = db.prepare('SELECT COUNT(*) as n FROM users').get() as { n: number };
  return count.n > 0;
}

// --- Agents ---

export interface AgentRow {
  id: string;
  name: string;
  os: string;
  token: string;
  fingerprint: string | null;
  online: number;
  last_seen: string | null;
  created_at: string;
}

export function findAgentByTokenAndName(token: string, name: string): AgentRow | undefined {
  return db.prepare('SELECT * FROM agents WHERE token = ? AND name = ?').get(token, name) as AgentRow | undefined;
}

export function upsertAgent(id: string, name: string, os: string, token: string): void {
  db.prepare(`
    INSERT INTO agents (id, name, os, token, online, last_seen)
    VALUES (?, ?, ?, ?, 1, datetime('now'))
    ON CONFLICT(token, name) DO UPDATE SET
      os = excluded.os,
      online = 1,
      last_seen = datetime('now')
  `).run(id, name, os, token);
}

export function setAgentOnline(id: string, online: boolean): void {
  db.prepare('UPDATE agents SET online = ?, last_seen = datetime(\'now\') WHERE id = ?').run(online ? 1 : 0, id);
}

export function listAgentsFromDB(): AgentRow[] {
  return db.prepare('SELECT * FROM agents ORDER BY online DESC, last_seen DESC').all() as AgentRow[];
}

export function deleteAgentFromDB(id: string): boolean {
  const result = db.prepare('DELETE FROM agents WHERE id = ?').run(id);
  return result.changes > 0;
}

export function resetAllAgentsOffline(): void {
  db.prepare('UPDATE agents SET online = 0').run();
}

export function setAgentFingerprint(id: string, fingerprint: string): void {
  db.prepare('UPDATE agents SET fingerprint = ? WHERE id = ?').run(fingerprint, id);
}

export function clearAgentFingerprint(id: string): boolean {
  const result = db.prepare('UPDATE agents SET fingerprint = NULL WHERE id = ?').run(id);
  return result.changes > 0;
}

// --- Audit Log ---

export function audit(action: string, user?: string, detail?: string) {
  db.prepare('INSERT INTO audit_log (action, user, detail) VALUES (?, ?, ?)').run(action, user ?? null, detail ?? null);
}

export function getAuditLogs(limit = 100) {
  return db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit);
}

export const AUDIT_ACTIONS = [
  'login', 'login_fail', 'login_rate_limited', 'password_change',
  'setup', 'user_create', 'user_delete',
  'agent_connect', 'agent_disconnect', 'agent_reject', 'agent_delete', 'agent_fingerprint_reset',
  'token_create', 'token_delete', 'token_toggle',
  'session_create', 'session_close',
] as const;

export interface AuditQuery {
  limit?: number;
  before?: number;
  after?: number;
  action?: string;
  user?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export interface AuditResult {
  logs: { id: number; ts: string; action: string; user: string | null; detail: string | null }[];
  hasMore: boolean;
  total: number;
}

export function queryAuditLogs(query: AuditQuery): AuditResult {
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
  const filterConditions: string[] = [];
  const filterParams: (string | number)[] = [];

  if (query.action) {
    filterConditions.push('action = ?');
    filterParams.push(query.action);
  }
  if (query.user) {
    filterConditions.push('user = ?');
    filterParams.push(query.user);
  }
  if (query.startDate) {
    filterConditions.push('ts >= ?');
    filterParams.push(query.startDate.length === 10 ? `${query.startDate} 00:00:00` : query.startDate);
  }
  if (query.endDate) {
    filterConditions.push('ts <= ?');
    filterParams.push(query.endDate.length === 10 ? `${query.endDate} 23:59:59` : query.endDate);
  }
  if (query.search) {
    // Escape LIKE wildcards so user input is treated as literal text
    const escaped = query.search.replace(/[%_]/g, c => `\\${c}`);
    filterConditions.push("detail LIKE ? ESCAPE '\\'");
    filterParams.push(`%${escaped}%`);
  }

  // Build cursor conditions separately so count query uses only filter params
  const dataConditions = [...filterConditions];
  const dataParams = [...filterParams];
  const isBackward = query.after !== undefined;

  if (query.before !== undefined) {
    dataConditions.push('id < ?');
    dataParams.push(query.before);
  } else if (query.after !== undefined) {
    dataConditions.push('id > ?');
    dataParams.push(query.after);
  }

  const dataWhere = dataConditions.length > 0 ? `WHERE ${dataConditions.join(' AND ')}` : '';
  const filterWhere = filterConditions.length > 0 ? `WHERE ${filterConditions.join(' AND ')}` : '';

  // Fetch limit+1 to determine hasMore
  const order = isBackward ? 'ASC' : 'DESC';
  const rows = db.prepare(
    `SELECT * FROM audit_log ${dataWhere} ORDER BY id ${order} LIMIT ?`
  ).all(...dataParams, limit + 1) as AuditResult['logs'];

  const hasMore = rows.length > limit;
  const logs = rows.slice(0, limit);
  if (isBackward) logs.reverse();

  // Total count only on initial/filter-change requests (no cursor)
  let total = 0;
  if (query.before === undefined && query.after === undefined) {
    const countResult = db.prepare(
      `SELECT COUNT(*) as n FROM audit_log ${filterWhere}`
    ).get(...filterParams) as { n: number };
    total = countResult.n;
  }

  return { logs, hasMore, total };
}
