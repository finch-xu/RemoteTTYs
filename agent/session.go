package main

import (
	"encoding/base64"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"

	"github.com/creack/pty"
)

// allowedShells is a whitelist of shell basenames permitted for PTY sessions.
var allowedShells = map[string]bool{
	"bash": true, "sh": true, "zsh": true, "fish": true,
	"dash": true, "ksh": true, "csh": true, "tcsh": true,
	"pwsh": true, "nu": true, "elvish": true,
}

// validateShell checks that a shell path is safe to execute.
func validateShell(shell string) (string, error) {
	if shell == "" {
		return "", fmt.Errorf("empty shell")
	}
	// Reject shells with arguments or special characters
	if strings.ContainsAny(shell, " \t\n;|&$`\\\"'(){}[]<>!#~") {
		return "", fmt.Errorf("shell path contains invalid characters: %s", shell)
	}
	// Check basename against whitelist
	base := filepath.Base(shell)
	if !allowedShells[base] {
		return "", fmt.Errorf("shell not in whitelist: %s", base)
	}
	// Verify the shell exists on the system
	resolved, err := exec.LookPath(shell)
	if err != nil {
		return "", fmt.Errorf("shell not found: %s", shell)
	}
	return resolved, nil
}

// validateCwd resolves cwd to a canonical absolute directory path.
// Rejects null bytes and symlink tricks to prevent path injection from untrusted pty.create messages.
func validateCwd(cwd string) (string, error) {
	if cwd == "" {
		return "", fmt.Errorf("empty cwd")
	}
	if strings.ContainsRune(cwd, 0) {
		return "", fmt.Errorf("cwd contains null byte")
	}
	abs, err := filepath.Abs(cwd)
	if err != nil {
		return "", fmt.Errorf("invalid cwd path: %s", cwd)
	}
	resolved, err := filepath.EvalSymlinks(filepath.Clean(abs))
	if err != nil {
		return "", fmt.Errorf("cwd does not exist: %s", cwd)
	}
	info, err := os.Stat(resolved)
	if err != nil {
		return "", fmt.Errorf("cwd does not exist: %s", resolved)
	}
	if !info.IsDir() {
		return "", fmt.Errorf("cwd is not a directory: %s", resolved)
	}
	return resolved, nil
}

type Session struct {
	ID         string
	PTY        *os.File
	Cmd        *exec.Cmd
	Scrollback *RingBuffer
}

func (c *Client) handlePtyCreate(msg IncomingMessage) {
	shell := c.config.Shell
	if msg.Shell != "" {
		shell = msg.Shell
	}

	// Validate shell against whitelist
	resolvedShell, err := validateShell(shell)
	if err != nil {
		log.Printf("session %s: rejected shell: %v", msg.SessionID, err)
		return
	}
	cmd := exec.Command(resolvedShell)

	// Resolve and validate working directory
	cwd := msg.Cwd
	if cwd == "" || cwd == "~" {
		if home, err := os.UserHomeDir(); err == nil {
			cwd = home
		}
	} else if strings.HasPrefix(cwd, "~/") {
		if home, err := os.UserHomeDir(); err == nil {
			cwd = filepath.Join(home, cwd[2:])
		}
	}
	validCwd, err := validateCwd(cwd)
	if err != nil {
		log.Printf("session %s: rejected cwd: %v", msg.SessionID, err)
		// Fall back to home directory
		if home, err := os.UserHomeDir(); err == nil {
			validCwd = home
		} else {
			validCwd = "/"
		}
	}
	cmd.Dir = validCwd

	cmd.Env = append(os.Environ(), "TERM=xterm-256color")

	ptmx, err := pty.Start(cmd)
	if err != nil {
		log.Printf("failed to start pty for session %s: %v", msg.SessionID, err)
		return
	}

	sess := &Session{
		ID:         msg.SessionID,
		PTY:        ptmx,
		Cmd:        cmd,
		Scrollback: NewRingBuffer(maxScrollbackBytes),
	}

	c.mu.Lock()
	c.sessions[msg.SessionID] = sess
	c.mu.Unlock()

	c.Send(PtyCreatedMsg{
		Type:      "pty.created",
		SessionID: msg.SessionID,
		PID:       cmd.Process.Pid,
	})

	log.Printf("session %s created (pid=%d, shell=%s)", msg.SessionID, cmd.Process.Pid, shell)

	go c.readPTY(sess)
}

func (c *Client) readPTY(s *Session) {
	buf := make([]byte, 32*1024)
	for {
		n, err := s.PTY.Read(buf)
		if n > 0 {
			s.Scrollback.Write(buf[:n])
			encoded := base64.StdEncoding.EncodeToString(buf[:n])
			c.Send(PtyDataMsg{
				Type:      "pty.data",
				SessionID: s.ID,
				Payload:   encoded,
			})
		}
		if err != nil {
			if err != io.EOF {
				log.Printf("session %s pty read error: %v", s.ID, err)
			}
			break
		}
	}

	exitCode := 0
	if err := s.Cmd.Wait(); err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		}
	}

	c.Send(PtyExitedMsg{
		Type:      "pty.exited",
		SessionID: s.ID,
		ExitCode:  exitCode,
	})

	c.mu.Lock()
	delete(c.sessions, s.ID)
	c.mu.Unlock()

	s.PTY.Close()
	log.Printf("session %s exited (code=%d)", s.ID, exitCode)
}

func (c *Client) getSession(id string) *Session {
	c.mu.Lock()
	sess := c.sessions[id]
	c.mu.Unlock()
	return sess
}

const maxPtyPayloadBytes = 128 * 1024 // 128KB max decoded PTY input

func (c *Client) handlePtyData(msg IncomingMessage) {
	sess := c.getSession(msg.SessionID)
	if sess == nil {
		return
	}

	if len(msg.Payload) > maxPtyPayloadBytes*2 { // base64 is ~4/3 ratio, but check generously
		log.Printf("session %s: payload too large (%d bytes)", msg.SessionID, len(msg.Payload))
		return
	}

	data, err := base64.StdEncoding.DecodeString(msg.Payload)
	if err != nil {
		log.Printf("session %s: base64 decode error: %v", msg.SessionID, err)
		return
	}

	if _, err := sess.PTY.Write(data); err != nil {
		log.Printf("session %s: pty write error: %v", msg.SessionID, err)
	}
}

func (c *Client) handlePtyResize(msg IncomingMessage) {
	sess := c.getSession(msg.SessionID)
	if sess == nil {
		return
	}

	// Validate resize dimensions to prevent overflow or nonsensical values
	if msg.Rows <= 0 || msg.Rows > 500 || msg.Cols <= 0 || msg.Cols > 500 {
		log.Printf("session %s: invalid resize dimensions rows=%d cols=%d", msg.SessionID, msg.Rows, msg.Cols)
		return
	}

	if err := pty.Setsize(sess.PTY, &pty.Winsize{
		Rows: uint16(msg.Rows),
		Cols: uint16(msg.Cols),
	}); err != nil {
		log.Printf("session %s: resize error: %v", msg.SessionID, err)
	}
}

func (c *Client) handlePtyReplayRequest(msg IncomingMessage) {
	sess := c.getSession(msg.SessionID)
	if sess == nil {
		return
	}

	data := sess.Scrollback.Contents()
	if len(data) == 0 {
		return
	}

	c.Send(PtyReplayMsg{
		Type:      "pty.replay",
		SessionID: sess.ID,
		Payload:   base64.StdEncoding.EncodeToString(data),
	})
}

func (c *Client) handlePtyClose(msg IncomingMessage) {
	sess := c.getSession(msg.SessionID)
	if sess == nil {
		return
	}

	if sess.Cmd.Process != nil {
		sess.Cmd.Process.Signal(syscall.SIGHUP)
	}
}
