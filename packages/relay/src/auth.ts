import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getConfig } from './config.js';
import { getUser, getAgentToken, hasAgentTokens, hashToken, getTokenVersion } from './db.js';

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
  return jwt.sign({ username, role: 'admin', tv: tokenVersion }, config.jwtSecret, {
    expiresIn: '24h',
    algorithm: 'HS256',
  });
}

export function verifyJWT(token: string): { username: string } | null {
  const config = getConfig();
  try {
    const payload = jwt.verify(token, config.jwtSecret, {
      algorithms: ['HS256'],
    }) as { username: string; tv?: number };
    // Check that user still exists and token version matches
    const currentVersion = getTokenVersion(payload.username);
    if (currentVersion === undefined) return null; // User deleted
    if (payload.tv !== undefined && payload.tv !== currentVersion) return null; // Password changed
    return { username: payload.username };
  } catch {
    return null;
  }
}
