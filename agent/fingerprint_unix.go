//go:build !windows

package main

import (
	"os"
	"os/exec"
	"regexp"
	"runtime"
	"strings"
)

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
		name, err := os.Hostname()
		if err != nil {
			return "", err
		}
		return name, nil
	}
}
