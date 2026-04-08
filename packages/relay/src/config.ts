import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface RelayConfig {
  port: number;
  jwtSecret: string;
}

let config: RelayConfig = {
  port: 8080,
  jwtSecret: '',
};

// Load from relay-config.json if it exists, env vars override
const configPaths = [
  path.join(__dirname, '..', 'relay-config.json'),
  path.join(__dirname, '..', '..', '..', 'relay-config.json'),
];

for (const configPath of configPaths) {
  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const fileConfig = JSON.parse(raw);
      config = { ...config, ...fileConfig };
      console.log(`Loaded config from ${configPath}`);
    } catch (err) {
      console.error(`Failed to load config from ${configPath}:`, err);
    }
    break;
  }
}

// Environment variable overrides
if (process.env.PORT) config.port = parseInt(process.env.PORT, 10);
if (process.env.JWT_SECRET) config.jwtSecret = process.env.JWT_SECRET;

// JWT secret: auto-generate and persist if not explicitly configured
if (!config.jwtSecret) {
  // Try to load persisted secret from data directory
  const dataDir = process.env.RTTYS_DB ? path.dirname(process.env.RTTYS_DB) : path.join(__dirname, '..', 'data');
  const secretPath = path.join(dataDir, '.jwt-secret');
  try {
    config.jwtSecret = fs.readFileSync(secretPath, 'utf-8').trim();
  } catch {
    // Generate new secret and persist it
    config.jwtSecret = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(secretPath, config.jwtSecret, { mode: 0o600 });
    console.log('Generated and saved JWT secret.');
  }
} else if (config.jwtSecret.length < 32) {
  console.warn('WARNING: JWT_SECRET is shorter than 32 characters. Consider using a stronger secret.');
}

export function getConfig(): RelayConfig {
  return config;
}
