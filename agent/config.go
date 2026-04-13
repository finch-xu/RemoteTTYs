package main

import (
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Relay      string `yaml:"relay"`
	Token      string `yaml:"token"`
	Name       string `yaml:"name"`
	Shell      string `yaml:"shell"`
	ServerKey  string `yaml:"server_key"`
	Insecure   bool   `yaml:"insecure,omitempty"`
	MaxRetries int    `yaml:"max_retries,omitempty"`
}

const configFileName = "config.yaml"

// configSearchPaths returns the ordered list of directories to search for config.yaml:
// 1. Same directory as the executable
// 2. ~/.rttys/
func configSearchPaths() []string {
	var paths []string

	if exe, err := os.Executable(); err == nil {
		if real, err := filepath.EvalSymlinks(exe); err == nil {
			paths = append(paths, filepath.Dir(real))
		}
	}

	if home, err := os.UserHomeDir(); err == nil {
		paths = append(paths, filepath.Join(home, ".rttys"))
	}

	return paths
}

// findConfigFile returns the path to the first config.yaml found, or empty string.
func findConfigFile() string {
	for _, dir := range configSearchPaths() {
		p := filepath.Join(dir, configFileName)
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

func LoadConfig() *Config {
	cfg := &Config{
		Relay:      "ws://localhost:8080/ws/agent",
		Shell:      detectDefaultShell(),
		MaxRetries: 10,
	}

	if name, err := os.Hostname(); err == nil {
		cfg.Name = name
	}

	configPath := findConfigFile()
	if configPath == "" {
		return cfg
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		return cfg
	}

	var fileCfg Config
	if err := yaml.Unmarshal(data, &fileCfg); err != nil {
		return cfg
	}

	if fileCfg.Relay != "" {
		cfg.Relay = fileCfg.Relay
	}
	if fileCfg.Token != "" {
		cfg.Token = fileCfg.Token
	}
	if fileCfg.Name != "" {
		cfg.Name = fileCfg.Name
	}
	if fileCfg.Shell != "" {
		cfg.Shell = fileCfg.Shell
	}
	if fileCfg.ServerKey != "" {
		cfg.ServerKey = fileCfg.ServerKey
	}
	if fileCfg.MaxRetries != 0 {
		cfg.MaxRetries = fileCfg.MaxRetries
	}

	return cfg
}
