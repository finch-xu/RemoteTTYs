//go:build !windows

package main

import (
	"os"
	"os/exec"
	"syscall"

	"github.com/creack/pty"
)

// PTYHandle wraps a Unix PTY (creack/pty) and its child process.
type PTYHandle struct {
	file *os.File
	cmd  *exec.Cmd
}

// startPTY spawns a shell in a new PTY and returns a handle.
func startPTY(shell string, dir string, env []string) (*PTYHandle, error) {
	cmd := exec.Command(shell)
	cmd.Dir = dir
	cmd.Env = env

	ptmx, err := pty.Start(cmd)
	if err != nil {
		return nil, err
	}

	return &PTYHandle{file: ptmx, cmd: cmd}, nil
}

func (h *PTYHandle) Read(p []byte) (int, error) {
	return h.file.Read(p)
}

func (h *PTYHandle) Write(p []byte) (int, error) {
	return h.file.Write(p)
}

func (h *PTYHandle) Close() error {
	return h.file.Close()
}

// Resize sets the PTY window size. Note: rows=lines, cols=columns.
func (h *PTYHandle) Resize(rows, cols uint16) error {
	return pty.Setsize(h.file, &pty.Winsize{Rows: rows, Cols: cols})
}

func (h *PTYHandle) Pid() int {
	return h.cmd.Process.Pid
}

// Wait blocks until the child process exits and returns its exit code.
func (h *PTYHandle) Wait() (int, error) {
	err := h.cmd.Wait()
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			return exitErr.ExitCode(), nil
		}
		return -1, err
	}
	return 0, nil
}

// Kill sends SIGHUP to the child process.
func (h *PTYHandle) Kill() error {
	if h.cmd.Process != nil {
		return h.cmd.Process.Signal(syscall.SIGHUP)
	}
	return nil
}
