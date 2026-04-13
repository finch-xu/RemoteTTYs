//go:build windows

package main

import (
	"os"

	"golang.org/x/sys/windows/registry"
)

func getMachineID() (string, error) {
	k, err := registry.OpenKey(registry.LOCAL_MACHINE,
		`SOFTWARE\Microsoft\Cryptography`, registry.QUERY_VALUE)
	if err != nil {
		// Fallback to hostname
		return os.Hostname()
	}
	defer k.Close()

	val, _, err := k.GetStringValue("MachineGuid")
	if err != nil {
		return os.Hostname()
	}
	return val, nil
}
