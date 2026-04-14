package main

import (
	"crypto/ed25519"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type Client struct {
	config       *Config
	conn         *websocket.Conn
	mu           sync.Mutex
	sessions     map[string]*Session
	sendCh       chan []byte
	done         chan struct{}
	wg           sync.WaitGroup
	sessionWg    sync.WaitGroup // tracks readPTY goroutines for graceful shutdown
	serverPubKey ed25519.PublicKey
	fingerprint  string
	identity     *Identity
}

func NewClient(config *Config, identity *Identity) *Client {
	// Decode server public key once at startup
	pubKeyBytes, err := base64.StdEncoding.DecodeString(config.ServerKey)
	if err != nil {
		log.Fatalf("invalid server_key (not valid base64): %v", err)
	}
	if len(pubKeyBytes) != ed25519.PublicKeySize {
		log.Fatalf("invalid server_key: expected %d bytes, got %d", ed25519.PublicKeySize, len(pubKeyBytes))
	}

	// Generate machine fingerprint once at startup
	fp, err := GetFingerprint()
	if err != nil {
		log.Fatalf("failed to get machine fingerprint: %v", err)
	}

	return &Client{
		config:       config,
		sessions:     make(map[string]*Session),
		sendCh:       make(chan []byte, 256),
		serverPubKey: ed25519.PublicKey(pubKeyBytes),
		fingerprint:  fp,
		identity:     identity,
	}
}

func (c *Client) Connect() error {
	dialer := *websocket.DefaultDialer

	// TLS configuration: verify certificates by default for wss:// connections
	if strings.HasPrefix(c.config.Relay, "wss://") {
		if c.config.Insecure {
			log.Printf("WARNING: TLS certificate verification disabled (--insecure)")
			dialer.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
		}
		// Default TLS config verifies certificates using system CA pool
	}

	// Send token in HTTP header for upgrade-phase authentication
	header := http.Header{}
	header.Set("X-Token", c.config.Token)

	conn, _, err := dialer.Dial(c.config.Relay, header)
	if err != nil {
		return err
	}
	c.conn = conn

	// Limit incoming WebSocket messages to 512KB to prevent memory exhaustion
	c.conn.SetReadLimit(512 * 1024)

	// Wait for server.challenge and verify server identity
	if err := c.verifyServerChallenge(); err != nil {
		c.conn.Close()
		return fmt.Errorf("server verification failed: %w", err)
	}

	hello := AgentHelloMsg{
		Type:        "agent.hello",
		Name:        c.config.Name,
		OS:          runtime.GOOS,
		Fingerprint: c.fingerprint,
		IdentityKey: c.identity.PublicKeyBase64(),
	}
	c.Send(hello)

	log.Printf("connected to relay: %s (server verified)", c.config.Relay)
	return nil
}

func (c *Client) verifyServerChallenge() error {
	// Read the challenge message with a 10-second timeout
	c.conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	_, data, err := c.conn.ReadMessage()
	c.conn.SetReadDeadline(time.Time{}) // clear deadline
	if err != nil {
		return fmt.Errorf("failed to read server challenge: %w", err)
	}

	var challenge ServerChallengeMsg
	if err := json.Unmarshal(data, &challenge); err != nil {
		return fmt.Errorf("failed to parse server challenge: %w", err)
	}
	if challenge.Type != "server.challenge" {
		return fmt.Errorf("expected server.challenge, got %s", challenge.Type)
	}

	// Decode and verify the signature
	sig, err := base64.StdEncoding.DecodeString(challenge.Signature)
	if err != nil {
		return fmt.Errorf("invalid signature encoding: %w", err)
	}

	if !ed25519.Verify(c.serverPubKey, []byte(c.config.Token), sig) {
		return fmt.Errorf("server signature verification failed - check server_key")
	}

	return nil
}

func (c *Client) Run() error {
	backoff := time.Second
	const maxBackoff = 30 * time.Second
	retries := 0

	for {
		if err := c.Connect(); err != nil {
			retries++
			if c.config.MaxRetries > 0 && retries >= c.config.MaxRetries {
				return fmt.Errorf("max retries (%d) exceeded, last error: %v", c.config.MaxRetries, err)
			}
			log.Printf("connect failed: %v, retrying in %s... (attempt %d/%s)",
				err, backoff, retries, c.retriesLabel())
			time.Sleep(backoff)
			backoff = min(backoff*2, maxBackoff)
			continue
		}

		// Reset backoff and retry counter on successful connection
		backoff = time.Second
		retries = 0

		c.done = make(chan struct{})

		c.wg.Add(2)
		go c.writeLoop()
		go c.startHeartbeat()
		c.readLoop() // blocks until disconnect

		// Signal writeLoop and heartbeat to stop, then wait for them
		close(c.done)
		c.wg.Wait()

		c.conn.Close()

		// Drain any remaining messages in sendCh to prevent goroutine leaks
		for {
			select {
			case <-c.sendCh:
			default:
				goto drained
			}
		}
	drained:

		retries++
		if c.config.MaxRetries > 0 && retries >= c.config.MaxRetries {
			return fmt.Errorf("max retries (%d) exceeded after disconnection", c.config.MaxRetries)
		}
		log.Printf("disconnected, reconnecting in %s... (attempt %d/%s)",
			backoff, retries, c.retriesLabel())
		time.Sleep(backoff)
		backoff = min(backoff*2, maxBackoff)
	}
}

func (c *Client) retriesLabel() string {
	if c.config.MaxRetries > 0 {
		return strconv.Itoa(c.config.MaxRetries)
	}
	return "unlimited"
}

func (c *Client) readLoop() {
	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			log.Printf("read error: %v", err)
			return
		}

		var msg IncomingMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			log.Printf("unmarshal error: %v", err)
			continue
		}

		switch msg.Type {
		case "pty.create":
			c.handlePtyCreate(msg)
		case "pty.data":
			c.handlePtyData(msg)
		case "pty.resize":
			c.handlePtyResize(msg)
		case "pty.close":
			c.handlePtyClose(msg)
		case "pty.replay.request":
			c.handlePtyReplayRequest(msg)
		case "agent.ping":
			c.Send(AgentPongMsg{
				Type:      "agent.pong",
				ID:        msg.PingID,
				Timestamp: msg.Timestamp,
			})
		default:
			log.Printf("unknown message type: %s", msg.Type)
		}
	}
}

func (c *Client) writeLoop() {
	defer c.wg.Done()
	for {
		select {
		case data := <-c.sendCh:
			if err := c.conn.WriteMessage(websocket.TextMessage, data); err != nil {
				log.Printf("write error: %v", err)
				return
			}
		case <-c.done:
			return
		}
	}
}

func (c *Client) startHeartbeat() {
	defer c.wg.Done()
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			c.Send(HeartbeatMsg{Type: "agent.heartbeat"})
		case <-c.done:
			return
		}
	}
}

func (c *Client) Shutdown() {
	c.mu.Lock()
	for _, sess := range c.sessions {
		sess.pty.Kill()
	}
	c.mu.Unlock()
	c.sessionWg.Wait() // wait for all readPTY goroutines to finish cleanup
}

// --- Status file for `rttys-agent status` ---

type SessionInfo struct {
	ID        string    `json:"id"`
	CreatedAt time.Time `json:"created_at"`
}

type AgentStatus struct {
	Sessions  []SessionInfo `json:"sessions"`
	UpdatedAt time.Time     `json:"updated_at"`
}

// writeStatusFile atomically writes session status to ~/.rttys/status.json.
func (c *Client) writeStatusFile() {
	c.mu.Lock()
	infos := make([]SessionInfo, 0, len(c.sessions))
	for _, s := range c.sessions {
		infos = append(infos, SessionInfo{ID: s.ID, CreatedAt: s.CreatedAt})
	}
	c.mu.Unlock()

	status := AgentStatus{Sessions: infos, UpdatedAt: time.Now().UTC()}
	data, err := json.Marshal(status)
	if err != nil {
		log.Printf("warning: failed to marshal status: %v", err)
		return
	}
	tmp := rttysPath("status.json.tmp")
	final := rttysPath("status.json")
	if err := os.WriteFile(tmp, data, 0600); err != nil {
		log.Printf("warning: failed to write status file: %v", err)
		return
	}
	if err := os.Rename(tmp, final); err != nil {
		log.Printf("warning: failed to rename status file: %v", err)
	}
}

func (c *Client) Send(msg interface{}) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("marshal error: %v", err)
		return
	}

	select {
	case c.sendCh <- data:
	case <-time.After(5 * time.Second):
		log.Printf("send channel full for 5s, message dropped (type may be lost)")
	}
}
