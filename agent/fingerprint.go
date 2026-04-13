package main

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
)

// GetFingerprint returns a stable machine fingerprint.
// It first checks the cached fingerprint at ~/.rttys/fingerprint.
// If not cached, generates from machine-id (Linux) or IOPlatformUUID (macOS),
// hashes with SHA-256, caches, and returns the first 32 hex chars.
func GetFingerprint() (string, error) {
	cachePath := filepath.Join(rttysDir(), "fingerprint")

	// Try to read cached fingerprint
	if data, err := os.ReadFile(cachePath); err == nil {
		fp := strings.TrimSpace(string(data))
		if len(fp) == 32 {
			return fp, nil
		}
	}

	// Generate from machine identity
	raw, err := getMachineID()
	if err != nil {
		return "", err
	}

	hash := sha256.Sum256([]byte(raw))
	fp := hex.EncodeToString(hash[:16]) // 16 bytes = 32 hex chars

	// Cache it
	if err := os.MkdirAll(rttysDir(), 0700); err == nil {
		os.WriteFile(cachePath, []byte(fp), 0600)
	}

	return fp, nil
}

