// Web Crypto API wrapper for E2E encryption (AES-256-GCM + ECDH P-256 + HKDF)

// Helper to ensure Uint8Array is backed by a plain ArrayBuffer (not SharedArrayBuffer),
// which is required by the Web Crypto API's BufferSource type in strict TS builds.
function toBuffer(arr: Uint8Array): ArrayBuffer {
  return arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength) as ArrayBuffer;
}

export const DIRECTION_B2A = 0x00; // Browser → Agent
export const DIRECTION_A2B = 0x01; // Agent → Browser

export interface E2ESessionKeys {
  keyB2A: CryptoKey;  // Browser → Agent AES key
  keyA2B: CryptoKey;  // Agent → Browser AES key
  hmacKey: CryptoKey; // Control message HMAC key
}

export interface E2EKeyPairData {
  keyPair: CryptoKeyPair;
  publicKeyRaw: Uint8Array;
}

export interface E2ESession {
  keys: E2ESessionKeys;
  sendCounter: number; // Browser → Agent counter
  recvCounter: number; // Agent → Browser counter
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Concatenate multiple Uint8Arrays into one. */
function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    out.set(arr, offset);
    offset += arr.length;
  }
  return out;
}

/** Chunked base64 encode — avoids call-stack overflow for large buffers. */
export function uint8ToBase64(bytes: Uint8Array): string {
  const chunkSize = 8192;
  let result = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    result += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(result);
}

/** Decode base64 string to Uint8Array. */
export function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// ECDH Key Exchange
// ---------------------------------------------------------------------------

/** Generate a P-256 ECDH key pair. Private key is non-extractable. */
export function generateECDHKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false, // private key not extractable
    ['deriveBits'],
  );
}

/** Export a P-256 public key as 65-byte raw (uncompressed) format. */
export async function exportPublicKeyRaw(key: CryptoKey): Promise<Uint8Array> {
  const buf = await crypto.subtle.exportKey('raw', key);
  return new Uint8Array(buf);
}

/** Import a P-256 public key from 65-byte raw bytes. Extractable, no usages. */
export function importPublicKeyRaw(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    toBuffer(raw),
    { name: 'ECDH', namedCurve: 'P-256' },
    true, // public key is extractable
    [],   // no key usages for peer public key
  );
}

// ---------------------------------------------------------------------------
// Key Derivation
// ---------------------------------------------------------------------------

/** Derive session keys from ECDH shared secret using HKDF. */
export async function deriveSessionKeys(
  privateKey: CryptoKey,
  peerPublicKey: CryptoKey,
  browserPubRaw: Uint8Array,
  agentPubRaw: Uint8Array,
): Promise<E2ESessionKeys> {
  // Step 1: Compute shared secret (256 bits = 32 bytes)
  const sharedSecretBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: peerPublicKey },
    privateKey,
    256,
  );

  // Step 2: Build salt = SHA-256("browser:" || browserPubRaw || "agent:" || agentPubRaw)
  const enc = new TextEncoder();
  const saltInput = concatBytes(
    enc.encode('browser:'),
    browserPubRaw,
    enc.encode('agent:'),
    agentPubRaw,
  );
  const saltBuf = await crypto.subtle.digest('SHA-256', toBuffer(saltInput));
  const salt = new Uint8Array(saltBuf);

  // Step 3: Import shared secret as HKDF key
  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    sharedSecretBits,
    { name: 'HKDF' },
    false,
    ['deriveBits'],
  );

  // Step 4: Derive 768 bits (96 bytes) via HKDF
  const keyMaterialBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: enc.encode('rttys-e2e-v1'),
    },
    hkdfKey,
    768,
  );
  const keyMaterial = new Uint8Array(keyMaterialBits);

  // Step 5: Split into 3 × 32-byte keys
  const rawB2A = keyMaterial.subarray(0, 32);
  const rawA2B = keyMaterial.subarray(32, 64);
  const rawHmac = keyMaterial.subarray(64, 96);

  // Step 6: Import each as the appropriate key type
  const [keyB2A, keyA2B, hmacKey] = await Promise.all([
    crypto.subtle.importKey('raw', rawB2A, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']),
    crypto.subtle.importKey('raw', rawA2B, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']),
    crypto.subtle.importKey(
      'raw',
      rawHmac,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    ),
  ]);

  return { keyB2A, keyA2B, hmacKey };
}

// ---------------------------------------------------------------------------
// AES-256-GCM Encrypt / Decrypt
// ---------------------------------------------------------------------------

/**
 * Build a 12-byte nonce: direction(1) || counter(8 bytes BE) || padding(3 zeros)
 * JS Number.MAX_SAFE_INTEGER = 2^53, so we split the counter across two 32-bit words.
 */
function buildNonce(direction: number, counter: number): Uint8Array {
  const nonce = new Uint8Array(12);
  const view = new DataView(nonce.buffer);
  nonce[0] = direction & 0xff;
  // Bytes 1-4: high 32 bits of counter
  view.setUint32(1, Math.floor(counter / 0x100000000), false);
  // Bytes 5-8: low 32 bits of counter
  view.setUint32(5, counter >>> 0, false);
  // Bytes 9-11 remain zero (padding)
  return nonce;
}

/** Encrypt plaintext. Returns nonce(12) || ciphertext+tag(len+16). */
export async function encrypt(
  key: CryptoKey,
  plaintext: Uint8Array,
  direction: number,
  counter: number,
): Promise<Uint8Array> {
  const nonce = buildNonce(direction, counter);
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toBuffer(nonce), tagLength: 128 },
    key,
    toBuffer(plaintext),
  );
  const out = new Uint8Array(12 + ciphertextBuf.byteLength);
  out.set(nonce, 0);
  out.set(new Uint8Array(ciphertextBuf), 12);
  return out;
}

/** Decrypt data (nonce(12) || ciphertext+tag). Verifies nonce before decrypting. */
export async function decrypt(
  key: CryptoKey,
  data: Uint8Array,
  direction: number,
  counter: number,
): Promise<Uint8Array> {
  const expectedNonce = buildNonce(direction, counter);

  // Verify nonce byte-by-byte
  for (let i = 0; i < 12; i++) {
    if (data[i] !== expectedNonce[i]) {
      throw new Error(`Nonce mismatch at byte ${i}: expected ${expectedNonce[i]}, got ${data[i]}`);
    }
  }

  const plaintextBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toBuffer(expectedNonce), tagLength: 128 },
    key,
    toBuffer(data.subarray(12)),
  );
  return new Uint8Array(plaintextBuf);
}

// ---------------------------------------------------------------------------
// Ed25519 Signature Verification
// ---------------------------------------------------------------------------

/**
 * Verify an Ed25519 signature over the key-exchange transcript.
 * signData = "rttys-e2e-keyex:" || agentPubRaw || browserPubRaw || sessionId(UTF-8)
 */
export async function verifyKeyExchangeSignature(
  identityKeyRaw: Uint8Array,
  agentPubRaw: Uint8Array,
  browserPubRaw: Uint8Array,
  sessionId: string,
  signatureRaw: Uint8Array,
): Promise<boolean> {
  const enc = new TextEncoder();

  const identityKey = await crypto.subtle.importKey(
    'raw',
    toBuffer(identityKeyRaw),
    { name: 'Ed25519' },
    true,
    ['verify'],
  );

  const signData = concatBytes(
    enc.encode('rttys-e2e-keyex:'),
    agentPubRaw,
    browserPubRaw,
    enc.encode(sessionId),
  );

  return crypto.subtle.verify('Ed25519', identityKey, toBuffer(signatureRaw), toBuffer(signData));
}

// ---------------------------------------------------------------------------
// HMAC for Control Messages
// ---------------------------------------------------------------------------

/**
 * Compute HMAC-SHA256 over resize data, return base64.
 * HMAC data: "pty.resize" || sessionId(UTF-8) || cols_be32 || rows_be32
 */
export async function computeResizeHMAC(
  hmacKey: CryptoKey,
  sessionId: string,
  cols: number,
  rows: number,
): Promise<string> {
  const enc = new TextEncoder();
  const colsRows = new Uint8Array(8);
  const view = new DataView(colsRows.buffer);
  view.setUint32(0, cols, false);
  view.setUint32(4, rows, false);

  const data = concatBytes(enc.encode('pty.resize'), enc.encode(sessionId), colsRows);

  const sigBuf = await crypto.subtle.sign('HMAC', hmacKey, toBuffer(data));
  return uint8ToBase64(new Uint8Array(sigBuf));
}

/**
 * Compute HMAC-SHA256 over close data, return base64.
 * HMAC data: "pty.close" || sessionId(UTF-8)
 */
export async function computeCloseHMAC(hmacKey: CryptoKey, sessionId: string): Promise<string> {
  const enc = new TextEncoder();
  const data = concatBytes(enc.encode('pty.close'), enc.encode(sessionId));

  const sigBuf = await crypto.subtle.sign('HMAC', hmacKey, toBuffer(data));
  return uint8ToBase64(new Uint8Array(sigBuf));
}
