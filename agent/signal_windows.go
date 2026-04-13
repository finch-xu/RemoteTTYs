//go:build windows

package main

import (
	"os"
	"os/signal"

	"golang.org/x/sys/windows"
)

func notifyShutdownSignals(ch chan<- os.Signal) {
	signal.Notify(ch, os.Interrupt)
}

func terminateProcess(p *os.Process) error {
	return p.Kill()
}

const stillActive = 259 // Windows STATUS_STILL_ACTIVE

func isProcessAlive(p *os.Process) bool {
	handle, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(p.Pid))
	if err != nil {
		return false
	}
	defer windows.CloseHandle(handle)

	var exitCode uint32
	if err := windows.GetExitCodeProcess(handle, &exitCode); err != nil {
		return false
	}
	return exitCode == stillActive
}
