package main

import (
	"bufio"
	"flag"
	"fmt"
	"log"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"

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

	log.Printf("rttys-agent starting (name=%s, relay=%s, shell=%s)", config.Name, config.Relay, config.Shell)

	// Write PID file
	writePIDFile()
	defer removePIDFile()

	client := NewClient(config)

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		log.Printf("shutting down...")
		client.Shutdown()
		removePIDFile()
		os.Exit(0)
	}()

	client.Run()
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
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}

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

	if err := proc.Signal(syscall.SIGTERM); err != nil {
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
	if err != nil || proc.Signal(syscall.Signal(0)) != nil {
		fmt.Println("Status: not running (stale PID file)")
		removePIDFile()
		return
	}

	config := LoadConfig()
	fmt.Printf("Status: running (pid=%d)\n", pid)
	fmt.Printf("Relay:  %s\n", config.Relay)
	fmt.Printf("Name:   %s\n", config.Name)
	fmt.Printf("Shell:  %s\n", config.Shell)
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
