package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"io"

	"golang.org/x/crypto/hkdf"
)

// Direction constants for nonce construction.
const (
	DirectionB2A byte = 0x00 // Browser → Agent
	DirectionA2B byte = 0x01 // Agent → Browser
)

// SessionKeys holds the three 32-byte keys and cached AEAD ciphers.
type SessionKeys struct {
	KeyB2A  []byte      // 32 bytes — AES-GCM key for Browser→Agent direction
	KeyA2B  []byte      // 32 bytes — AES-GCM key for Agent→Browser direction
	HMACKey []byte      // 32 bytes — HMAC key for control-message signing
	GCMB2A  cipher.AEAD // cached AES-GCM cipher for B2A
	GCMA2B  cipher.AEAD // cached AES-GCM cipher for A2B
}

// GenerateECDHKeyPair creates an ephemeral P-256 key pair.
func GenerateECDHKeyPair() (*ecdh.PrivateKey, *ecdh.PublicKey, error) {
	curve := ecdh.P256()
	priv, err := curve.GenerateKey(rand.Reader)
	if err != nil {
		return nil, nil, err
	}
	return priv, priv.PublicKey(), nil
}

// ParseECDHPublicKey parses a 65-byte uncompressed P-256 public key (0x04 prefix).
func ParseECDHPublicKey(raw []byte) (*ecdh.PublicKey, error) {
	curve := ecdh.P256()
	return curve.NewPublicKey(raw)
}

// ComputeSharedSecret performs ECDH and returns the raw shared secret bytes.
func ComputeSharedSecret(priv *ecdh.PrivateKey, peerPub *ecdh.PublicKey) ([]byte, error) {
	return priv.ECDH(peerPub)
}

// DeriveSessionKeys derives three 32-byte session keys from the ECDH shared
// secret using HKDF-SHA256.
//
// Salt = SHA-256("browser:" || browserPubRaw || "agent:" || agentPubRaw)
// Info = "rttys-e2e-v1"
// Output = 96 bytes split into KeyB2A | KeyA2B | HMACKey.
func DeriveSessionKeys(sharedSecret, browserPubRaw, agentPubRaw []byte) (*SessionKeys, error) {
	// Build deterministic salt
	h := sha256.New()
	h.Write([]byte("browser:"))
	h.Write(browserPubRaw)
	h.Write([]byte("agent:"))
	h.Write(agentPubRaw)
	salt := h.Sum(nil)

	info := []byte("rttys-e2e-v1")
	kdf := hkdf.New(sha256.New, sharedSecret, salt, info)

	out := make([]byte, 96)
	if _, err := io.ReadFull(kdf, out); err != nil {
		return nil, err
	}

	gcmB2A, err := newGCM(out[0:32])
	if err != nil {
		return nil, err
	}
	gcmA2B, err := newGCM(out[32:64])
	if err != nil {
		return nil, err
	}

	return &SessionKeys{
		KeyB2A:  out[0:32],
		KeyA2B:  out[32:64],
		HMACKey: out[64:96],
		GCMB2A:  gcmB2A,
		GCMA2B:  gcmA2B,
	}, nil
}

func newGCM(key []byte) (cipher.AEAD, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

// buildNonce constructs the 12-byte AES-GCM nonce:
//
//	direction(1) || counter(8 BE) || padding(3 zeros)
func buildNonce(direction byte, counter uint64) []byte {
	nonce := make([]byte, 12)
	nonce[0] = direction
	binary.BigEndian.PutUint64(nonce[1:9], counter)
	// nonce[9:12] remain zero (padding)
	return nonce
}

// Encrypt encrypts plaintext with a cached AES-256-GCM cipher.
// Returns nonce(12) || ciphertext || tag(16).
func Encrypt(gcm cipher.AEAD, plaintext []byte, direction byte, counter uint64) []byte {
	nonce := buildNonce(direction, counter)
	return gcm.Seal(nonce, nonce, plaintext, nil)
}

// Decrypt decrypts data produced by Encrypt using a cached AES-256-GCM cipher.
// Verifies the nonce matches the expected direction+counter.
func Decrypt(gcm cipher.AEAD, data []byte, direction byte, counter uint64) ([]byte, error) {
	if len(data) < 12 {
		return nil, errors.New("crypto: ciphertext too short")
	}

	expected := buildNonce(direction, counter)
	if !hmac.Equal(data[:12], expected) {
		return nil, errors.New("crypto: nonce mismatch")
	}

	return gcm.Open(nil, data[:12], data[12:], nil)
}

// ComputeHMAC returns HMAC-SHA256(key, data).
func ComputeHMAC(key, data []byte) []byte {
	mac := hmac.New(sha256.New, key)
	mac.Write(data)
	return mac.Sum(nil)
}

// VerifyHMAC performs a constant-time comparison of ComputeHMAC(key, data)
// against expected.
func VerifyHMAC(key, data, expected []byte) bool {
	computed := ComputeHMAC(key, data)
	return hmac.Equal(computed, expected)
}

// BuildKeyExchangeSignData builds the byte slice that is signed/verified
// during the ECDH key-exchange handshake:
//
//	"rttys-e2e-keyex:" || agentPubRaw || browserPubRaw || sessionID(UTF-8)
func BuildKeyExchangeSignData(agentPubRaw, browserPubRaw []byte, sessionID string) []byte {
	prefix := []byte("rttys-e2e-keyex:")
	sid := []byte(sessionID)
	out := make([]byte, len(prefix)+len(agentPubRaw)+len(browserPubRaw)+len(sid))
	n := copy(out, prefix)
	n += copy(out[n:], agentPubRaw)
	n += copy(out[n:], browserPubRaw)
	copy(out[n:], sid)
	return out
}

// buildResizeHMACData builds the HMAC input for a pty.resize control message:
//
//	"pty.resize" || sessionID || cols_be32 || rows_be32
func buildResizeHMACData(sessionID string, cols, rows int) []byte {
	prefix := []byte("pty.resize")
	sid := []byte(sessionID)
	out := make([]byte, len(prefix)+len(sid)+4+4)
	n := copy(out, prefix)
	n += copy(out[n:], sid)
	binary.BigEndian.PutUint32(out[n:], uint32(cols))
	binary.BigEndian.PutUint32(out[n+4:], uint32(rows))
	return out
}

// buildCloseHMACData builds the HMAC input for a pty.close control message:
//
//	"pty.close" || sessionID
func buildCloseHMACData(sessionID string) []byte {
	prefix := []byte("pty.close")
	sid := []byte(sessionID)
	out := make([]byte, len(prefix)+len(sid))
	n := copy(out, prefix)
	copy(out[n:], sid)
	return out
}
