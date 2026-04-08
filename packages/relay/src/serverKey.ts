import { generateKeyPairSync, createPrivateKey, createPublicKey, sign, KeyObject } from 'crypto';
import fs from 'fs';
import path from 'path';

let privateKey: KeyObject;
let publicKeyBase64: string;

/**
 * Initialize the server Ed25519 key pair.
 * Loads from disk if available, otherwise generates a new pair.
 * The private key is stored in PKCS8 DER format at `<dataDir>/server_ed25519`.
 */
export function initServerKey(dataDir: string): void {
  const keyPath = path.join(dataDir, 'server_ed25519');

  if (fs.existsSync(keyPath)) {
    const der = fs.readFileSync(keyPath);
    privateKey = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
  } else {
    fs.mkdirSync(dataDir, { recursive: true });
    const pair = generateKeyPairSync('ed25519');
    privateKey = pair.privateKey;
    const der = privateKey.export({ type: 'pkcs8', format: 'der' });
    fs.writeFileSync(keyPath, der, { mode: 0o600 });
    console.log(`Generated new server Ed25519 key at ${keyPath}`);
  }

  const pubKey = createPublicKey(privateKey);
  const spki = pubKey.export({ type: 'spki', format: 'der' });
  // Ed25519 SPKI DER is 44 bytes: 12-byte ASN.1 header + 32-byte raw key
  if (spki.length !== 44) {
    throw new Error(`Unexpected Ed25519 SPKI length: ${spki.length} (expected 44)`);
  }
  const rawPub = spki.subarray(12);
  publicKeyBase64 = rawPub.toString('base64');

  console.log(`Server public key: ${publicKeyBase64}`);
}

/**
 * Sign a challenge (the agent's token) with the server's Ed25519 private key.
 * Returns the signature as a base64 string.
 */
export function signChallenge(data: string): string {
  const sig = sign(null, Buffer.from(data), privateKey);
  return sig.toString('base64');
}

/**
 * Get the server's public key as a base64 string (raw 32 bytes).
 */
export function getServerPublicKey(): string {
  return publicKeyBase64;
}
