package main

// IncomingMessage is a single struct for all messages from relay.
// Dispatch by the Type field.
type IncomingMessage struct {
	Type      string `json:"type"`
	SessionID string `json:"sessionId,omitempty"`
	Payload   string `json:"payload,omitempty"`
	Shell     string `json:"shell,omitempty"`
	Cwd       string `json:"cwd,omitempty"`
	Cols      int    `json:"cols,omitempty"`
	Rows      int    `json:"rows,omitempty"`
}

// Outgoing messages — each has its own struct for clean JSON marshaling.

type AgentHelloMsg struct {
	Type        string `json:"type"`
	Name        string `json:"name"`
	OS          string `json:"os"`
	Fingerprint string `json:"fingerprint"`
}

type ServerChallengeMsg struct {
	Type      string `json:"type"`
	Signature string `json:"signature"`
}

type PtyCreatedMsg struct {
	Type      string `json:"type"`
	SessionID string `json:"sessionId"`
	PID       int    `json:"pid"`
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
