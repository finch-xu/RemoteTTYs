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
	"sync/atomic"
	"time"
)

// allowedShells is a whitelist of shell basenames permitted for PTY sessions.
// On Windows, the ".exe" suffix is stripped before lookup.
var allowedShells = map[string]bool{
	"bash": true, "sh": true, "zsh": true, "fish": true,
	"dash": true, "ksh": true, "csh": true, "tcsh": true,
	"pwsh": true, "nu": true, "elvish": true,
	"powershell": true, "cmd": true,
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
	// Check basename against whitelist (strip .exe suffix for Windows compatibility)
	base := filepath.Base(shell)
	base = strings.TrimSuffix(base, ".exe")
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
	ID               string
	pty              *PTYHandle
	Scrollback       *RingBuffer
	Keys             *SessionKeys
	SendCounter      uint64
	RecvCounter      uint64
	CreatedAt        time.Time
	PendingTransfers map[string]*PendingTransfer
}

// sendCounterNext atomically increments SendCounter and returns the pre-increment value.
// Atomic is required because readPTY (separate goroutine) also increments SendCounter.
func (s *Session) sendCounterNext() uint64 {
	v := atomic.AddUint64(&s.SendCounter, 1) - 1
	return v
}

func (c *Client) handlePtyCreate(msg IncomingMessage) {
	// --- E2E key exchange ---
	if msg.PublicKey == "" {
		c.Send(PtyErrorMsg{
			Type:      "pty.error",
			SessionID: msg.SessionID,
			Error:     "encryption required: missing publicKey",
		})
		return
	}

	browserPubRaw, err := base64.StdEncoding.DecodeString(msg.PublicKey)
	if err != nil {
		log.Printf("session %s: invalid browser publicKey base64: %v", msg.SessionID, err)
		c.Send(PtyErrorMsg{
			Type:      "pty.error",
			SessionID: msg.SessionID,
			Error:     "invalid publicKey encoding",
		})
		return
	}

	browserPub, err := ParseECDHPublicKey(browserPubRaw)
	if err != nil {
		log.Printf("session %s: invalid browser ECDH key: %v", msg.SessionID, err)
		c.Send(PtyErrorMsg{
			Type:      "pty.error",
			SessionID: msg.SessionID,
			Error:     "invalid publicKey",
		})
		return
	}

	agentPriv, agentPub, err := GenerateECDHKeyPair()
	if err != nil {
		log.Printf("session %s: ECDH key generation failed: %v", msg.SessionID, err)
		return
	}
	agentPubRaw := agentPub.Bytes()

	sharedSecret, err := ComputeSharedSecret(agentPriv, browserPub)
	if err != nil {
		log.Printf("session %s: ECDH shared secret failed: %v", msg.SessionID, err)
		return
	}

	keys, err := DeriveSessionKeys(sharedSecret, browserPubRaw, agentPubRaw)
	if err != nil {
		log.Printf("session %s: key derivation failed: %v", msg.SessionID, err)
		return
	}

	signData := BuildKeyExchangeSignData(agentPubRaw, browserPubRaw, msg.SessionID)
	signature := c.identity.Sign(signData)

	// --- Shell validation and PTY creation ---
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
			validCwd = defaultFallbackCwd
		}
	}

	env := append(os.Environ(), "TERM=xterm-256color")

	ptyHandle, err := startPTY(resolvedShell, validCwd, env)
	if err != nil {
		log.Printf("failed to start pty for session %s: %v", msg.SessionID, err)
		return
	}
	ptyReady := false
	defer func() {
		if !ptyReady {
			ptyHandle.Kill()
			ptyHandle.Close()
		}
	}()

	sess := &Session{
		ID:               msg.SessionID,
		pty:              ptyHandle,
		Scrollback:       NewRingBuffer(maxScrollbackBytes),
		Keys:             keys,
		CreatedAt:        time.Now(),
		PendingTransfers: make(map[string]*PendingTransfer),
	}

	c.mu.Lock()
	c.sessions[msg.SessionID] = sess
	c.mu.Unlock()
	c.writeStatusFile()

	c.Send(PtyCreatedMsg{
		Type:      "pty.created",
		SessionID: msg.SessionID,
		PID:       ptyHandle.Pid(),
		PublicKey: base64.StdEncoding.EncodeToString(agentPubRaw),
		Signature: base64.StdEncoding.EncodeToString(signature),
	})

	log.Printf("session %s created (pid=%d, shell=%s, e2e=on)", msg.SessionID, ptyHandle.Pid(), shell)

	ptyReady = true
	c.sessionWg.Add(1)
	go c.readPTY(sess)
}

func (c *Client) readPTY(s *Session) {
	defer c.sessionWg.Done()
	buf := make([]byte, 32*1024)
	for {
		n, err := s.pty.Read(buf)
		if n > 0 {
			s.Scrollback.Write(buf[:n])

			counter := atomic.AddUint64(&s.SendCounter, 1) - 1
			encrypted := Encrypt(s.Keys.GCMA2B, buf[:n], DirectionA2B, counter)
			encoded := base64.StdEncoding.EncodeToString(encrypted)
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

	exitCode, waitErr := s.pty.Wait()
	if waitErr != nil {
		log.Printf("session %s: wait error: %v", s.ID, waitErr)
	}

	c.Send(PtyExitedMsg{
		Type:      "pty.exited",
		SessionID: s.ID,
		ExitCode:  exitCode,
	})

	c.mu.Lock()
	delete(c.sessions, s.ID)
	c.mu.Unlock()
	c.writeStatusFile()

	zeroKeys(s.Keys)
	s.pty.Close()
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

	encrypted, err := base64.StdEncoding.DecodeString(msg.Payload)
	if err != nil {
		log.Printf("session %s: base64 decode error: %v", msg.SessionID, err)
		return
	}

	data, err := Decrypt(sess.Keys.GCMB2A, encrypted, DirectionB2A, sess.RecvCounter)
	if err != nil {
		log.Printf("session %s: decrypt error: %v", msg.SessionID, err)
		return
	}
	sess.RecvCounter++

	if _, err := sess.pty.Write(data); err != nil {
		log.Printf("session %s: pty write error: %v", msg.SessionID, err)
	}
}

func (c *Client) handlePtyResize(msg IncomingMessage) {
	sess := c.getSession(msg.SessionID)
	if sess == nil {
		return
	}

	if !verifyControlHMAC(sess, msg.Hmac, buildResizeHMACData(msg.SessionID, msg.Cols, msg.Rows), "resize") {
		return
	}

	// Validate resize dimensions to prevent overflow or nonsensical values
	if msg.Rows <= 0 || msg.Rows > 500 || msg.Cols <= 0 || msg.Cols > 500 {
		log.Printf("session %s: invalid resize dimensions rows=%d cols=%d", msg.SessionID, msg.Rows, msg.Cols)
		return
	}

	if err := sess.pty.Resize(uint16(msg.Rows), uint16(msg.Cols)); err != nil {
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

	counter := atomic.AddUint64(&sess.SendCounter, 1) - 1
	encrypted := Encrypt(sess.Keys.GCMA2B, data, DirectionA2B, counter)

	c.Send(PtyReplayMsg{
		Type:      "pty.replay",
		SessionID: sess.ID,
		Payload:   base64.StdEncoding.EncodeToString(encrypted),
	})
}

func (c *Client) handlePtyClose(msg IncomingMessage) {
	sess := c.getSession(msg.SessionID)
	if sess == nil {
		return
	}

	if !verifyControlHMAC(sess, msg.Hmac, buildCloseHMACData(msg.SessionID), "close") {
		return
	}

	sess.pty.Kill()
}

// verifyControlHMAC verifies the HMAC on a control message. Returns true if valid or absent.
func verifyControlHMAC(sess *Session, hmacField string, hmacData []byte, label string) bool {
	if hmacField == "" {
		return true
	}
	macBytes, err := base64.StdEncoding.DecodeString(hmacField)
	if err != nil {
		log.Printf("session %s: invalid %s HMAC encoding: %v", sess.ID, label, err)
		return false
	}
	if !VerifyHMAC(sess.Keys.HMACKey, hmacData, macBytes) {
		log.Printf("session %s: %s HMAC verification failed", sess.ID, label)
		return false
	}
	return true
}

func zeroKeys(keys *SessionKeys) {
	if keys == nil {
		return
	}
	for i := range keys.KeyB2A {
		keys.KeyB2A[i] = 0
	}
	for i := range keys.KeyA2B {
		keys.KeyA2B[i] = 0
	}
	for i := range keys.HMACKey {
		keys.HMACKey[i] = 0
	}
}
