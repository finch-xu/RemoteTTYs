//go:build windows

package main

import (
	"os"
	"os/exec"
)

const defaultFallbackCwd = `C:\`

// detectDefaultShell returns the default shell for Windows.
// Priority: pwsh (PowerShell 7) > powershell (5.1) > ComSpec > cmd.exe
func detectDefaultShell() string {
	if path, err := exec.LookPath("pwsh.exe"); err == nil {
		return path
	}
	if path, err := exec.LookPath("powershell.exe"); err == nil {
		return path
	}
	if cs := os.Getenv("ComSpec"); cs != "" {
		return cs
	}
	return `C:\Windows\System32\cmd.exe`
}
