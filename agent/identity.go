package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
)

// Identity holds the agent's Ed25519 key pair.
type Identity struct {
	PrivateKey ed25519.PrivateKey
	PublicKey  ed25519.PublicKey
}

// LoadOrCreateIdentity loads the identity from ~/.rttys/identity_ed25519,
// or generates a new key pair and saves it if none exists.
func LoadOrCreateIdentity() (*Identity, error) {
	return LoadOrCreateIdentityIn(rttysDir())
}

// LoadOrCreateIdentityIn is like LoadOrCreateIdentity but uses a configurable
// directory — primarily useful for tests.
func LoadOrCreateIdentityIn(dir string) (*Identity, error) {
	privPath := filepath.Join(dir, "identity_ed25519")
	pubPath := filepath.Join(dir, "identity_ed25519.pub")

	// Try to load an existing key pair.
	privData, privErr := os.ReadFile(privPath)
	pubData, pubErr := os.ReadFile(pubPath)

	if privErr == nil && pubErr == nil &&
		len(privData) == ed25519.PrivateKeySize &&
		len(pubData) == ed25519.PublicKeySize {
		return &Identity{
			PrivateKey: ed25519.PrivateKey(privData),
			PublicKey:  ed25519.PublicKey(pubData),
		}, nil
	}

	// Generate a new key pair.
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, fmt.Errorf("identity: key generation failed: %w", err)
	}

	// Ensure the directory exists.
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, fmt.Errorf("identity: mkdir failed: %w", err)
	}

	// Write private key (0600 — owner read/write only).
	if err := os.WriteFile(privPath, []byte(priv), 0600); err != nil {
		return nil, fmt.Errorf("identity: write private key failed: %w", err)
	}

	// Write public key (0644 — world-readable).
	if err := os.WriteFile(pubPath, []byte(pub), 0644); err != nil {
		return nil, fmt.Errorf("identity: write public key failed: %w", err)
	}

	return &Identity{
		PrivateKey: priv,
		PublicKey:  pub,
	}, nil
}

// Sign signs message with the identity's private key and returns the signature.
func (id *Identity) Sign(message []byte) []byte {
	return ed25519.Sign(id.PrivateKey, message)
}

// PublicKeyBase64 returns the base64 standard-encoded public key.
func (id *Identity) PublicKeyBase64() string {
	return base64.StdEncoding.EncodeToString(id.PublicKey)
}

// Fingerprint returns an SSH-style fingerprint of the public key:
// "SHA256:<base64-raw-unpadded>".
func (id *Identity) Fingerprint() string {
	sum := sha256.Sum256(id.PublicKey)
	encoded := base64.RawStdEncoding.EncodeToString(sum[:])
	return "SHA256:" + encoded
}
