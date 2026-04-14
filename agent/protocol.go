package main

// IncomingMessage is a single struct for all messages from relay.
// Dispatch by the Type field.
type IncomingMessage struct {
	Type      string  `json:"type"`
	SessionID string  `json:"sessionId,omitempty"`
	Payload   string  `json:"payload,omitempty"`
	Shell     string  `json:"shell,omitempty"`
	Cwd       string  `json:"cwd,omitempty"`
	Cols      int     `json:"cols,omitempty"`
	Rows      int     `json:"rows,omitempty"`
	PublicKey string  `json:"publicKey,omitempty"` // ECDH P-256 public key (base64)
	Hmac      string  `json:"hmac,omitempty"`      // HMAC-SHA256 for control messages
	PingID    string  `json:"id,omitempty"`         // ping/pong correlation ID
	Timestamp float64 `json:"timestamp,omitempty"`  // relay timestamp for RTT measurement
}

// Outgoing messages — each has its own struct for clean JSON marshaling.

type AgentHelloMsg struct {
	Type        string `json:"type"`
	Name        string `json:"name"`
	OS          string `json:"os"`
	Fingerprint string `json:"fingerprint"`
	IdentityKey string `json:"identityKey"` // Ed25519 public key (base64)
}

type ServerChallengeMsg struct {
	Type      string `json:"type"`
	Signature string `json:"signature"`
}

type PtyCreatedMsg struct {
	Type      string `json:"type"`
	SessionID string `json:"sessionId"`
	PID       int    `json:"pid"`
	PublicKey string `json:"publicKey"` // ECDH P-256 public key (base64)
	Signature string `json:"signature"` // Ed25519 signature (base64)
}

type PtyErrorMsg struct {
	Type      string `json:"type"`
	SessionID string `json:"sessionId"`
	Error     string `json:"error"`
}

type PtyDataMsg struct {
	Type      string `json:"type"`
	SessionID string `json:"sessionId"`
	Payload   string `json:"payload"`
}

type PtyExitedMsg struct {
	Type      string `json:"type"`
	SessionID string `json:"sessionId"`
	ExitCode  int    `json:"exitCode"`
}

type PtyReplayMsg struct {
	Type      string `json:"type"`
	SessionID string `json:"sessionId"`
	Payload   string `json:"payload"`
}

type HeartbeatMsg struct {
	Type string `json:"type"`
}

type AgentPongMsg struct {
	Type      string  `json:"type"`
	ID        string  `json:"id"`
	Timestamp float64 `json:"timestamp"`
}
