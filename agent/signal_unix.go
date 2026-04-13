//go:build !windows

package main

import (
	"os"
	"os/signal"
	"syscall"
)

func notifyShutdownSignals(ch chan<- os.Signal) {
	signal.Notify(ch, syscall.SIGINT, syscall.SIGTERM)
}

func terminateProcess(p *os.Process) error {
	return p.Signal(syscall.SIGTERM)
}

func isProcessAlive(p *os.Process) bool {
	return p.Signal(syscall.Signal(0)) == nil
}
