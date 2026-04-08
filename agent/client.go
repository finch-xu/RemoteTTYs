package main

import (
	"crypto/ed25519"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
)

type Client struct {
	config      *Config
	conn        *websocket.Conn
	mu          sync.Mutex
	sessions    map[string]*Session
	sendCh      chan []byte
	done        chan struct{}
	wg          sync.WaitGroup
	serverPubKey ed25519.PublicKey
	fingerprint string
}

func NewClient(config *Config) *Client {
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
		config:      config,
		sessions:    make(map[string]*Session),
		sendCh:      make(chan []byte, 256),
		serverPubKey: ed25519.PublicKey(pubKeyBytes),
		fingerprint: fp,
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

func (c *Client) Run() {
	backoff := time.Second
	const maxBackoff = 30 * time.Second

	for {
		if err := c.Connect(); err != nil {
			log.Printf("connect failed: %v, retrying in %s...", err, backoff)
			time.Sleep(backoff)
			backoff = min(backoff*2, maxBackoff)
			continue
		}

		// Reset backoff on successful connection
		backoff = time.Second

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

		log.Printf("disconnected, reconnecting in %s...", backoff)
		time.Sleep(backoff)
		backoff = min(backoff*2, maxBackoff)
	}
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
		if sess.Cmd.Process != nil {
			sess.Cmd.Process.Signal(syscall.SIGHUP)
		}
	}
	c.mu.Unlock()
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
