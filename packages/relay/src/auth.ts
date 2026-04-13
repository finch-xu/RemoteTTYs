import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getConfig } from './config.js';
import { getUser, getAgentToken, hasAgentTokens, hashToken } from './db.js';

export function verifyAgentToken(token: string): { valid: boolean; hash?: string; label?: string } {
  // No tokens configured → reject all agents
  if (!hasAgentTokens()) return { valid: false };
  const hash = hashToken(token);
  const row = getAgentToken(hash);
  if (!row) return { valid: false };
  if (!row.enabled) return { valid: false };
  return { valid: true, hash, label: row.label };
}

export function verifyLogin(username: string, password: string): boolean {
  const user = getUser(username);
  if (!user) return false;
  return bcrypt.compareSync(password, user.password);
}

export function generateJWT(username: string): string {
  const config = getConfig();
  const user = getUser(username);
  const tokenVersion = user?.token_version ?? 0;
  const role = user?.role ?? 'admin';
  return jwt.sign({ username, role, tv: tokenVersion }, config.jwtSecret, {
    expiresIn: '24h',
    algorithm: 'HS256',
  });
}

export function verifyJWT(token: string): { username: string; role: string } | null {
  const config = getConfig();
  try {
    const payload = jwt.verify(token, config.jwtSecret, {
      algorithms: ['HS256'],
    }) as { username: string; role?: string; tv?: number };
    // Check that user still exists and token version matches
    const user = getUser(payload.username);
    if (!user) return null; // User deleted
    if (payload.tv !== undefined && payload.tv !== user.token_version) return null; // Password changed
    // Always read role from DB to reflect real-time permission changes
    return { username: payload.username, role: user.role ?? 'admin' };
  } catch {
    return null;
  }
}
