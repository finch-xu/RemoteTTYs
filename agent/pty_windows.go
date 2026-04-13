//go:build windows

package main

import (
	"fmt"
	"syscall"

	"github.com/charmbracelet/x/conpty"
	"golang.org/x/sys/windows"
)

// PTYHandle wraps a Windows ConPTY and its spawned process.
type PTYHandle struct {
	cpty   *conpty.ConPty
	pid    int
	handle windows.Handle
}

// startPTY creates a ConPTY and spawns the shell inside it.
func startPTY(shell string, dir string, env []string) (*PTYHandle, error) {
	// Create pseudo-console with default 80x25 dimensions;
	// the browser sends a resize immediately after session creation.
	cpty, err := conpty.New(80, 25, 0)
	if err != nil {
		return nil, fmt.Errorf("conpty.New: %w", err)
	}

	attr := &syscall.ProcAttr{
		Dir: dir,
		Env: env,
	}

	pid, handle, err := cpty.Spawn(shell, []string{shell}, attr)
	if err != nil {
		cpty.Close()
		return nil, fmt.Errorf("conpty.Spawn: %w", err)
	}

	return &PTYHandle{
		cpty:   cpty,
		pid:    pid,
		handle: windows.Handle(handle),
	}, nil
}

func (h *PTYHandle) Read(p []byte) (int, error) {
	return h.cpty.Read(p)
}

func (h *PTYHandle) Write(p []byte) (int, error) {
	return h.cpty.Write(p)
}

func (h *PTYHandle) Close() error {
	// Close ConPTY first (closes pipes, signals process EOF),
	// then release the process handle.
	err := h.cpty.Close()
	windows.CloseHandle(h.handle)
	return err
}

// Resize resizes the ConPTY. Note: conpty takes (width, height), we receive (rows, cols).
func (h *PTYHandle) Resize(rows, cols uint16) error {
	return h.cpty.Resize(int(cols), int(rows))
}

func (h *PTYHandle) Pid() int {
	return h.pid
}

// Wait blocks until the spawned process exits and returns its exit code.
func (h *PTYHandle) Wait() (int, error) {
	_, err := windows.WaitForSingleObject(h.handle, windows.INFINITE)
	if err != nil {
		return -1, fmt.Errorf("WaitForSingleObject: %w", err)
	}

	var exitCode uint32
	if err := windows.GetExitCodeProcess(h.handle, &exitCode); err != nil {
		return -1, fmt.Errorf("GetExitCodeProcess: %w", err)
	}

	return int(exitCode), nil
}

// Kill terminates the spawned process.
func (h *PTYHandle) Kill() error {
	return windows.TerminateProcess(h.handle, 1)
}
