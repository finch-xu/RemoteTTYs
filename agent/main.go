package main

import (
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

func main() {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "init":
			runInit()
			return
		case "stop":
			runStop()
			return
		case "status":
			runStatus()
			return
		}
	}

	relayFlag := flag.String("relay", "", "relay WebSocket URL")
	nameFlag := flag.String("name", "", "agent display name")
	shellFlag := flag.String("shell", "", "shell to spawn for new sessions")
	insecureFlag := flag.Bool("insecure", false, "skip TLS certificate verification (dev only)")
	maxRetriesFlag := flag.Int("max-retries", 0, "max consecutive reconnection attempts (0 = use config default)")
	daemonFlag := flag.Bool("d", false, "run as background daemon")
	flag.Parse()

	config := LoadConfig()

	if *relayFlag != "" {
		config.Relay = *relayFlag
	}
	if *nameFlag != "" {
		config.Name = *nameFlag
	}
	if *shellFlag != "" {
		config.Shell = *shellFlag
	}
	if *insecureFlag {
		config.Insecure = true
	}
	if *maxRetriesFlag != 0 {
		config.MaxRetries = *maxRetriesFlag
	}

	if *daemonFlag {
		runDaemon()
		return
	}

	runForeground(config)
}

func runForeground(config *Config) {
	if config.ServerKey == "" {
		log.Fatal("FATAL: server_key is required. Get it from the server via GET /api/server-key and add to config.yaml")
	}

	identity, err := LoadOrCreateIdentity()
	if err != nil {
		log.Fatalf("failed to load agent identity: %v", err)
	}
	log.Printf("Agent identity fingerprint: %s", identity.Fingerprint())

	log.Printf("rttys-agent starting (name=%s, relay=%s, shell=%s)", config.Name, config.Relay, config.Shell)

	// Write PID file
	writePIDFile()
	defer removePIDFile()
	defer removeStatusFile()

	client := NewClient(config, identity)
	client.writeStatusFile()

	sigCh := make(chan os.Signal, 1)
	notifyShutdownSignals(sigCh)
	go func() {
		<-sigCh
		log.Printf("shutting down...")
		client.Shutdown()
		removeStatusFile()
		removePIDFile()
		os.Exit(0)
	}()

	if err := client.Run(); err != nil {
		log.Printf("agent exited: %v", err)
		removeStatusFile()
		removePIDFile()
		os.Exit(1)
	}
}

func runDaemon() {
	exe, err := os.Executable()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	// Build args without -d flag
	args := []string{}
	for _, arg := range os.Args[1:] {
		if arg != "-d" {
			args = append(args, arg)
		}
	}

	logFile := rttysPath("agent.log")
	f, err := os.OpenFile(logFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to open log file: %v\n", err)
		os.Exit(1)
	}

	cmd := exec.Command(exe, args...)
	cmd.Stdout = f
	cmd.Stderr = f
	setDaemonAttrs(cmd)

	if err := cmd.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to start daemon: %v\n", err)
		os.Exit(1)
	}

	f.Close() // child inherits the fd; parent can release it

	fmt.Printf("rttys-agent started (pid=%d, log=%s)\n", cmd.Process.Pid, logFile)
}

func runStop() {
	pid, err := readPIDFile()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Agent is not running (no PID file)\n")
		os.Exit(1)
	}

	proc, err := os.FindProcess(pid)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Process %d not found\n", pid)
		removePIDFile()
		os.Exit(1)
	}

	if err := terminateProcess(proc); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to stop agent (pid=%d): %v\n", pid, err)
		os.Exit(1)
	}

	fmt.Printf("Stopped rttys-agent (pid=%d)\n", pid)
}

func runStatus() {
	pid, err := readPIDFile()
	if err != nil {
		fmt.Println("Status: not running")
		return
	}

	proc, err := os.FindProcess(pid)
	if err != nil || !isProcessAlive(proc) {
		fmt.Println("Status: not running (stale PID file)")
		removePIDFile()
		removeStatusFile()
		return
	}

	config := LoadConfig()
	fmt.Printf("Status:   running (pid=%d)\n", pid)
	fmt.Printf("Relay:    %s\n", config.Relay)
	fmt.Printf("Name:     %s\n", config.Name)
	fmt.Printf("Shell:    %s\n", config.Shell)
	if data, err := os.ReadFile(rttysPath("status.json")); err == nil {
		var status AgentStatus
		if err := json.Unmarshal(data, &status); err == nil {
			if len(status.Sessions) == 0 {
				fmt.Printf("Sessions: 0\n")
			} else {
				fmt.Printf("Sessions: %d active\n", len(status.Sessions))
				for _, s := range status.Sessions {
					dur := time.Since(s.CreatedAt).Truncate(time.Second)
					id := s.ID
					if len(id) > 8 {
						id = id[:8]
					}
					fmt.Printf("  %s  connected %s\n", id, formatDuration(dur))
				}
			}
		}
	}
	identity, err := LoadOrCreateIdentity()
	if err == nil {
		fmt.Printf("  Fingerprint: %s\n", identity.Fingerprint())
	}
}

func runInit() {
	reader := bufio.NewReader(os.Stdin)
	config := LoadConfig()

	fmt.Printf("Relay URL [%s]: ", config.Relay)
	if line, _ := reader.ReadString('\n'); strings.TrimSpace(line) != "" {
		config.Relay = strings.TrimSpace(line)
	}

	fmt.Printf("Agent token [%s]: ", maskToken(config.Token))
	if line, _ := reader.ReadString('\n'); strings.TrimSpace(line) != "" {
		config.Token = strings.TrimSpace(line)
	}

	fmt.Printf("Display name [%s]: ", config.Name)
	if line, _ := reader.ReadString('\n'); strings.TrimSpace(line) != "" {
		config.Name = strings.TrimSpace(line)
	}

	fmt.Printf("Server public key [%s]: ", maskToken(config.ServerKey))
	if line, _ := reader.ReadString('\n'); strings.TrimSpace(line) != "" {
		config.ServerKey = strings.TrimSpace(line)
	}

	fmt.Printf("Shell [%s]: ", config.Shell)
	if line, _ := reader.ReadString('\n'); strings.TrimSpace(line) != "" {
		config.Shell = strings.TrimSpace(line)
	}

	fmt.Printf("Max retries, 0=unlimited [%d]: ", config.MaxRetries)
	if line, _ := reader.ReadString('\n'); strings.TrimSpace(line) != "" {
		if n, err := strconv.Atoi(strings.TrimSpace(line)); err == nil {
			config.MaxRetries = n
		}
	}

	// Write config.yaml next to the executable
	configDir := exeDir()
	data, _ := yaml.Marshal(config)
	configPath := filepath.Join(configDir, configFileName)
	if err := os.WriteFile(configPath, data, 0600); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to write config: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Config saved to %s\n", configPath)
}

// exeDir returns the directory containing the current executable.
func exeDir() string {
	exe, err := os.Executable()
	if err != nil {
		// Fallback to current working directory
		dir, _ := os.Getwd()
		return dir
	}
	real, err := filepath.EvalSymlinks(exe)
	if err != nil {
		return filepath.Dir(exe)
	}
	return filepath.Dir(real)
}

// --- PID file helpers ---

func rttysDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".rttys")
}

func rttysPath(name string) string {
	return filepath.Join(rttysDir(), name)
}

func writePIDFile() {
	if err := os.MkdirAll(rttysDir(), 0700); err != nil {
		log.Printf("warning: failed to create rttys dir: %v", err)
		return
	}
	if err := os.WriteFile(rttysPath("agent.pid"), []byte(strconv.Itoa(os.Getpid())), 0600); err != nil {
		log.Printf("warning: failed to write PID file: %v", err)
	}
}

func removePIDFile() {
	os.Remove(rttysPath("agent.pid"))
}

func removeStatusFile() {
	os.Remove(rttysPath("status.json"))
	os.Remove(rttysPath("status.json.tmp"))
}

func formatDuration(d time.Duration) string {
	if d < time.Minute {
		return fmt.Sprintf("%ds", int(d.Seconds()))
	}
	if d < time.Hour {
		return fmt.Sprintf("%dm%ds", int(d.Minutes()), int(d.Seconds())%60)
	}
	return fmt.Sprintf("%dh%dm", int(d.Hours()), int(d.Minutes())%60)
}

func readPIDFile() (int, error) {
	data, err := os.ReadFile(rttysPath("agent.pid"))
	if err != nil {
		return 0, err
	}
	return strconv.Atoi(strings.TrimSpace(string(data)))
}

func maskToken(token string) string {
	if len(token) <= 4 {
		return token
	}
	return token[:4] + "****"
}
