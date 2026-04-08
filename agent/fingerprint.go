package main

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
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

func getMachineID() (string, error) {
	switch runtime.GOOS {
	case "linux":
		data, err := os.ReadFile("/etc/machine-id")
		if err != nil {
			// Fallback to /var/lib/dbus/machine-id
			data, err = os.ReadFile("/var/lib/dbus/machine-id")
			if err != nil {
				return "", err
			}
		}
		return strings.TrimSpace(string(data)), nil
	case "darwin":
		out, err := exec.Command("ioreg", "-rd1", "-c", "IOPlatformExpertDevice").Output()
		if err != nil {
			return "", err
		}
		re := regexp.MustCompile(`"IOPlatformUUID"\s*=\s*"([^"]+)"`)
		match := re.FindSubmatch(out)
		if match == nil {
			return "", os.ErrNotExist
		}
		return string(match[1]), nil
	default:
		// For other platforms, use hostname as fallback
		name, err := os.Hostname()
		if err != nil {
			return "", err
		}
		return name, nil
	}
}
