import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  handleAgentConnection,
  setAgentMessageHandler,
  setAgentDisconnectHandler,
  getAllAgents,
  disconnectAgentsByToken,
} from './agentHub.js';
import {
  handleBrowserConnection,
  setBrowserMessageHandler,
  setBrowserDisconnectHandler,
} from './browserHub.js';
import {
  handleAgentMessage,
  handleBrowserMessage,
  handleAgentDisconnect,
  handleBrowserDisconnect,
} from './router.js';
import { getConfig } from './config.js';
import { verifyJWT, verifyLogin, generateJWT, verifyAgentToken } from './auth.js';
import { randomBytes } from 'crypto';
import {
  initDB,
  listUsers,
  createUser,
  deleteUser,
  updatePassword,
  listAgentTokens,
  createAgentToken,
  deleteAgentToken,
  getAgentTokenById,
  setAgentTokenEnabled,
  hasUsers,
  getAuditLogs,
  audit,
  listAgentsFromDB,
  deleteAgentFromDB,
  resetAllAgentsOffline,
  hashToken,
  getUserPreferences,
  setUserPreferences,
  clearAgentFingerprint,
} from './db.js';
import { initServerKey, getServerPublicKey, signChallenge } from './serverKey.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize database and server key
initDB();
resetAllAgentsOffline();

const dataDir = path.join(__dirname, '..', 'data');
initServerKey(dataDir);

const app = express();
// Trust first proxy (e.g., nginx, cloud LB) so req.ip reflects the real client IP
app.set('trust proxy', 1);
app.use(express.json({ limit: '10kb' }));

// Security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' wss: ws:; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

const server = createServer(app);

const agentWss = new WebSocketServer({ noServer: true });
const browserWss = new WebSocketServer({ noServer: true });

setAgentMessageHandler(handleAgentMessage);
setAgentDisconnectHandler(handleAgentDisconnect);
setBrowserMessageHandler(handleBrowserMessage);
setBrowserDisconnectHandler(handleBrowserDisconnect);

// Handle WebSocket upgrade by path
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '/', `http://${request.headers.host}`);

  if (url.pathname === '/ws/agent') {
    const token = request.headers['x-token'] as string | undefined;
    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    const tokenResult = verifyAgentToken(token);
    if (!tokenResult.valid || !tokenResult.hash) {
      audit('agent_reject', undefined, 'reason=invalid token (HTTP)');
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    const challengeSignature = signChallenge(token);
    agentWss.handleUpgrade(request, socket, head, (ws) => {
      handleAgentConnection(ws, { tokenHash: tokenResult.hash!, challengeSignature, label: tokenResult.label });
    });
  } else if (url.pathname === '/ws/terminal') {
    // Validate Origin to prevent Cross-Site WebSocket Hijacking
    const origin = request.headers.origin;
    if (origin) {
      const host = request.headers.host;
      try {
        const originHost = new URL(origin).host;
        if (originHost !== host) {
          socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
          socket.destroy();
          return;
        }
      } catch {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }
    }
    const sessionCookie = parseCookie(request.headers.cookie, 'rttys-session');
    if (!sessionCookie || !verifyJWT(sessionCookie)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    browserWss.handleUpgrade(request, socket, head, (ws) => {
      handleBrowserConnection(ws);
    });
  } else {
    socket.destroy();
  }
});

// --- Cookie helpers ---

function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function setAuthCookies(res: express.Response, jwt: string, csrfToken: string) {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('rttys-session', jwt, {
    httpOnly: true, secure: isProduction, sameSite: 'lax', path: '/', maxAge: 86400000,
  });
  res.cookie('rttys-csrf', csrfToken, {
    httpOnly: false, secure: isProduction, sameSite: 'lax', path: '/', maxAge: 86400000,
  });
}

function clearAuthCookies(res: express.Response) {
  res.clearCookie('rttys-session', { path: '/' });
  res.clearCookie('rttys-csrf', { path: '/' });
}

// Auth middleware
interface AuthRequest extends express.Request {
  username: string;
}

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = parseCookie(req.headers.cookie, 'rttys-session');
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const result = verifyJWT(token);
  if (!result) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }
  (req as AuthRequest).username = result.username;
  next();
}

// CSRF middleware (double-submit cookie)
function requireCSRF(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }
  const cookieToken = parseCookie(req.headers.cookie, 'rttys-csrf');
  const headerToken = req.headers['x-csrf-token'] as string | undefined;
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    res.status(403).json({ error: 'CSRF validation failed' });
    return;
  }
  next();
}

// --- Input validation ---

const MIN_PASSWORD_LENGTH = 8;

function validatePassword(password: string): string | null {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}

// --- Setup (first-time initialization) ---

app.get('/api/setup/status', (_req, res) => {
  res.json({ needsSetup: !hasUsers() });
});

app.post('/api/setup/init', (req, res) => {
  if (hasUsers()) {
    res.status(403).json({ error: 'Setup already completed' });
    return;
  }
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' });
    return;
  }
  const pwError = validatePassword(password);
  if (pwError) {
    res.status(400).json({ error: pwError });
    return;
  }
  createUser(username, password);
  audit('setup', username, 'Initial admin account created');
  setAuthCookies(res, generateJWT(username), randomBytes(32).toString('hex'));
  res.json({ ok: true });
});

// --- Auth ---

// Simple in-memory rate limiter for login attempts
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkLoginRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= LOGIN_MAX_ATTEMPTS;
}

// Clean up expired rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of loginAttempts.entries()) {
    if (now > entry.resetAt) loginAttempts.delete(key);
  }
}, 5 * 60 * 1000);

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const ip = req.ip || req.socket.remoteAddress || '';

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' });
    return;
  }

  // Rate limit by IP and by username
  if (!checkLoginRateLimit(`ip:${ip}`) || !checkLoginRateLimit(`user:${username}`)) {
    audit('login_rate_limited', username, `ip=${ip}`);
    res.status(429).json({ error: 'Too many login attempts. Try again later.' });
    return;
  }

  if (!verifyLogin(username, password)) {
    audit('login_fail', username, `ip=${ip}`);
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  audit('login', username, `ip=${ip}`);
  setAuthCookies(res, generateJWT(username), randomBytes(32).toString('hex'));
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const token = parseCookie(req.headers.cookie, 'rttys-session');
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const result = verifyJWT(token);
  if (!result) {
    clearAuthCookies(res);
    res.status(401).json({ error: 'Session expired' });
    return;
  }
  res.json({ username: result.username, preferences: getUserPreferences(result.username) });
});

app.post('/api/auth/logout', (_req, res) => {
  clearAuthCookies(res);
  res.json({ ok: true });
});

app.put('/api/preferences', requireAuth, requireCSRF, (req, res) => {
  const { uiTheme, terminalTheme } = req.body;
  const prefs: Record<string, unknown> = {};
  if (typeof uiTheme === 'string') prefs.uiTheme = uiTheme;
  if (typeof terminalTheme === 'string') prefs.terminalTheme = terminalTheme;
  setUserPreferences((req as AuthRequest).username, prefs);
  res.json({ ok: true });
});

// --- Agents ---

app.get('/api/agents', requireAuth, (_req, res) => {
  const dbAgents = listAgentsFromDB();
  const onlineAgents = getAllAgents();
  const sessionMap = new Map<string, string[]>();
  for (const a of onlineAgents) {
    sessionMap.set(a.id, Array.from(a.sessions));
  }
  const agents = dbAgents.map((a) => ({
    id: a.id,
    name: a.name,
    os: a.os,
    online: !!a.online,
    sessions: sessionMap.get(a.id) ?? [],
    fingerprint: a.fingerprint,
    lastSeen: a.last_seen,
    createdAt: a.created_at,
  }));
  res.json(agents);
});

app.delete('/api/agents/:id', requireAuth, requireCSRF, (req, res) => {
  const id = req.params.id as string;
  if (deleteAgentFromDB(id)) {
    audit('agent_delete', (req as AuthRequest).username, `agentId=${id}`);
    res.json({ ok: true });
  } else {
    res.status(404).json({ error: 'Agent not found' });
  }
});

app.delete('/api/agents/:id/fingerprint', requireAuth, requireCSRF, (req, res) => {
  const id = req.params.id as string;
  if (clearAgentFingerprint(id)) {
    audit('agent_fingerprint_reset', (req as AuthRequest).username, `agentId=${id}`);
    res.json({ ok: true });
  } else {
    res.status(404).json({ error: 'Agent not found' });
  }
});

// --- Server Key ---

app.get('/api/server-key', requireAuth, (_req, res) => {
  res.json({ publicKey: getServerPublicKey() });
});

// --- User Management ---

app.get('/api/users', requireAuth, (_req, res) => {
  res.json(listUsers());
});

app.post('/api/users', requireAuth, requireCSRF, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' });
    return;
  }
  const pwError = validatePassword(password);
  if (pwError) {
    res.status(400).json({ error: pwError });
    return;
  }
  try {
    createUser(username, password);
    audit('user_create', (req as AuthRequest).username, `target=${username}`);
    res.json({ ok: true });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      res.status(409).json({ error: 'Username already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create user' });
    }
  }
});

app.delete('/api/users/:username', requireAuth, requireCSRF, (req, res) => {
  const target = req.params.username as string;
  if (target === (req as AuthRequest).username) {
    res.status(400).json({ error: 'Cannot delete yourself' });
    return;
  }
  if (deleteUser(target)) {
    audit('user_delete', (req as AuthRequest).username, `target=${target}`);
    res.json({ ok: true });
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

app.put('/api/users/:username/password', requireAuth, requireCSRF, (req, res) => {
  const target = req.params.username as string;
  // Users can only change their own password
  if (target !== (req as AuthRequest).username) {
    res.status(403).json({ error: 'Can only change your own password' });
    return;
  }
  const { password } = req.body;
  if (!password) {
    res.status(400).json({ error: 'Password required' });
    return;
  }
  const pwError = validatePassword(password);
  if (pwError) {
    res.status(400).json({ error: pwError });
    return;
  }
  if (updatePassword(target, password)) {
    audit('password_change', (req as AuthRequest).username);
    res.json({ ok: true });
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

// --- Agent Token Management ---

app.get('/api/tokens', requireAuth, (_req, res) => {
  const tokens = listAgentTokens();
  const onlineAgents = getAllAgents();
  const tokenOnlineMap = new Map<string, string[]>();
  for (const agent of onlineAgents) {
    if (!tokenOnlineMap.has(agent.token)) {
      tokenOnlineMap.set(agent.token, []);
    }
    tokenOnlineMap.get(agent.token)!.push(agent.name);
  }
  const enriched = tokens.map((t) => ({
    ...t,
    enabled: !!t.enabled,
    onlineAgents: tokenOnlineMap.get(t.token) ?? [],
  }));
  res.json(enriched);
});

app.post('/api/tokens', requireAuth, requireCSRF, (req, res) => {
  const { label, notes } = req.body;
  if (!label) {
    res.status(400).json({ error: 'Label is required' });
    return;
  }
  const token = randomBytes(32).toString('hex');
  try {
    createAgentToken(hashToken(token), label, notes ?? '');
    audit('token_create', (req as AuthRequest).username, `label=${label}`);
    res.json({ ok: true, token });  // Return raw token once; DB stores hash
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create token' });
  }
});

app.put('/api/tokens/:id/enabled', requireAuth, requireCSRF, (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    res.status(400).json({ error: 'enabled (boolean) required' });
    return;
  }
  const tokenRow = getAgentTokenById(id);
  if (!tokenRow) {
    res.status(404).json({ error: 'Token not found' });
    return;
  }
  setAgentTokenEnabled(id, enabled);
  audit('token_toggle', (req as AuthRequest).username, `id=${id}, label=${tokenRow.label}, enabled=${enabled}`);
  if (!enabled) {
    disconnectAgentsByToken(tokenRow.token);
  }
  res.json({ ok: true });
});

app.delete('/api/tokens/:token', requireAuth, requireCSRF, (req, res) => {
  const token = req.params.token as string;
  disconnectAgentsByToken(token);
  if (deleteAgentToken(token)) {
    audit('token_delete', (req as AuthRequest).username, `token=${token.slice(0, 8)}...`);
    res.json({ ok: true });
  } else {
    res.status(404).json({ error: 'Token not found' });
  }
});

// --- Audit Log ---

app.get('/api/audit', requireAuth, (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 100, 1), 1000);
  res.json(getAuditLogs(limit));
});

// --- Static Files ---

const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Start server
const config = getConfig();
server.listen(config.port, () => {
  console.log(`rttys-relay listening on port ${config.port}`);
});
