//go:build !windows

package main

import (
	"os/exec"
	"syscall"
)

func setDaemonAttrs(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
}
