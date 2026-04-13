//go:build !windows

package main

import "os"

const defaultFallbackCwd = "/"

// detectDefaultShell returns the default shell for Unix systems.
func detectDefaultShell() string {
	if sh := os.Getenv("SHELL"); sh != "" {
		return sh
	}
	return "/bin/sh"
}
