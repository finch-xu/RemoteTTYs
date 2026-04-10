package main

import (
	"crypto/ed25519"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadOrCreateIdentity_CreatesNewKey(t *testing.T) {
	dir := t.TempDir()

	id, err := LoadOrCreateIdentityIn(dir)
	if err != nil {
		t.Fatalf("LoadOrCreateIdentityIn failed: %v", err)
	}

	// Verify key lengths
	if len(id.PrivateKey) != ed25519.PrivateKeySize {
		t.Errorf("PrivateKey length = %d, want %d", len(id.PrivateKey), ed25519.PrivateKeySize)
	}
	if len(id.PublicKey) != ed25519.PublicKeySize {
		t.Errorf("PublicKey length = %d, want %d", len(id.PublicKey), ed25519.PublicKeySize)
	}

	// Verify files were created
	privPath := filepath.Join(dir, "identity_ed25519")
	pubPath := filepath.Join(dir, "identity_ed25519.pub")

	if _, err := os.Stat(privPath); os.IsNotExist(err) {
		t.Errorf("private key file not created: %s", privPath)
	}
	if _, err := os.Stat(pubPath); os.IsNotExist(err) {
		t.Errorf("public key file not created: %s", pubPath)
	}

	// Verify file permissions
	privInfo, err := os.Stat(privPath)
	if err != nil {
		t.Fatalf("failed to stat private key file: %v", err)
	}
	if privInfo.Mode().Perm() != 0600 {
		t.Errorf("private key file mode = %o, want 0600", privInfo.Mode().Perm())
	}

	pubInfo, err := os.Stat(pubPath)
	if err != nil {
		t.Fatalf("failed to stat public key file: %v", err)
	}
	if pubInfo.Mode().Perm() != 0644 {
		t.Errorf("public key file mode = %o, want 0644", pubInfo.Mode().Perm())
	}
}

func TestLoadOrCreateIdentity_LoadsExistingKey(t *testing.T) {
	dir := t.TempDir()

	// First call — creates the key
	id1, err := LoadOrCreateIdentityIn(dir)
	if err != nil {
		t.Fatalf("first LoadOrCreateIdentityIn failed: %v", err)
	}

	// Second call — should load the same key
	id2, err := LoadOrCreateIdentityIn(dir)
	if err != nil {
		t.Fatalf("second LoadOrCreateIdentityIn failed: %v", err)
	}

	if string(id1.PrivateKey) != string(id2.PrivateKey) {
		t.Error("PrivateKey differs between first and second call")
	}
	if string(id1.PublicKey) != string(id2.PublicKey) {
		t.Error("PublicKey differs between first and second call")
	}
}

func TestIdentity_SignAndVerify(t *testing.T) {
	dir := t.TempDir()

	id, err := LoadOrCreateIdentityIn(dir)
	if err != nil {
		t.Fatalf("LoadOrCreateIdentityIn failed: %v", err)
	}

	message := []byte("hello, RemoteTTYs")
	sig := id.Sign(message)

	if len(sig) != ed25519.SignatureSize {
		t.Errorf("signature length = %d, want %d", len(sig), ed25519.SignatureSize)
	}

	if !ed25519.Verify(id.PublicKey, message, sig) {
		t.Error("signature verification failed")
	}

	// Tampered message should not verify
	tampered := []byte("hello, RemoteTTYs!")
	if ed25519.Verify(id.PublicKey, tampered, sig) {
		t.Error("signature should not verify for tampered message")
	}
}

func TestIdentity_Fingerprint(t *testing.T) {
	dir := t.TempDir()

	id, err := LoadOrCreateIdentityIn(dir)
	if err != nil {
		t.Fatalf("LoadOrCreateIdentityIn failed: %v", err)
	}

	fp := id.Fingerprint()

	// Non-empty
	if fp == "" {
		t.Error("Fingerprint returned empty string")
	}

	// Must start with "SHA256:"
	if !strings.HasPrefix(fp, "SHA256:") {
		t.Errorf("Fingerprint %q does not start with 'SHA256:'", fp)
	}

	// Must be deterministic
	fp2 := id.Fingerprint()
	if fp != fp2 {
		t.Errorf("Fingerprint is not deterministic: %q vs %q", fp, fp2)
	}

	// Same key loaded again must produce same fingerprint
	id2, err := LoadOrCreateIdentityIn(dir)
	if err != nil {
		t.Fatalf("second LoadOrCreateIdentityIn failed: %v", err)
	}
	fp3 := id2.Fingerprint()
	if fp != fp3 {
		t.Errorf("Fingerprint differs after reload: %q vs %q", fp, fp3)
	}
}
