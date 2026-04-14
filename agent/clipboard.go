package main

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"runtime"
)

// DetectClipboard checks whether the system clipboard is available.
func DetectClipboard() bool {
	switch runtime.GOOS {
	case "darwin":
		_, err := exec.LookPath("pbcopy")
		return err == nil
	case "linux":
		// Need a clipboard tool AND a display server
		hasDisplay := os.Getenv("DISPLAY") != "" || os.Getenv("WAYLAND_DISPLAY") != ""
		if !hasDisplay {
			return false
		}
		_, errXclip := exec.LookPath("xclip")
		_, errXsel := exec.LookPath("xsel")
		return errXclip == nil || errXsel == nil
	case "windows":
		// clip.exe is always available on Windows
		return true
	default:
		return false
	}
}

// WriteImageToClipboard writes image data to the system clipboard.
func WriteImageToClipboard(data []byte, mimeType string) error {
	switch runtime.GOOS {
	case "darwin":
		return writeClipboardDarwin(data, mimeType)
	case "linux":
		return writeClipboardLinux(data, mimeType)
	default:
		return fmt.Errorf("clipboard not supported on %s", runtime.GOOS)
	}
}

func writeClipboardDarwin(data []byte, mimeType string) error {
	// osascript requires a file path — write to temp file, use it, then remove
	tmpFile, err := os.CreateTemp("", "rttys-clip-*"+extForMIME(mimeType))
	if err != nil {
		return fmt.Errorf("create temp file: %w", err)
	}
	defer os.Remove(tmpFile.Name())

	if _, err := tmpFile.Write(data); err != nil {
		tmpFile.Close()
		return fmt.Errorf("write temp file: %w", err)
	}
	tmpFile.Close()

	var script string
	switch mimeType {
	case "image/jpeg":
		script = fmt.Sprintf(`set the clipboard to (read (POSIX file %q) as JPEG picture)`, tmpFile.Name())
	default:
		// PNG and other formats — use PNG class
		script = fmt.Sprintf(`set the clipboard to (read (POSIX file %q) as «class PNGf»)`, tmpFile.Name())
	}

	cmd := exec.Command("osascript", "-e", script)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("osascript: %w: %s", err, string(out))
	}
	return nil
}

func writeClipboardLinux(data []byte, mimeType string) error {
	// Prefer xclip, fall back to xsel
	clipTool, err := exec.LookPath("xclip")
	if err != nil {
		clipTool, err = exec.LookPath("xsel")
		if err != nil {
			return fmt.Errorf("no clipboard tool found (need xclip or xsel)")
		}
		// xsel doesn't support setting MIME types for images well; use basic mode
		cmd := exec.Command(clipTool, "--clipboard", "--input")
		cmd.Stdin = bytes.NewReader(data)
		if out, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("xsel: %w: %s", err, string(out))
		}
		return nil
	}

	cmd := exec.Command(clipTool, "-selection", "clipboard", "-t", mimeType)
	cmd.Stdin = bytes.NewReader(data)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("xclip: %w: %s", err, string(out))
	}
	return nil
}

func extForMIME(mimeType string) string {
	switch mimeType {
	case "image/png":
		return ".png"
	case "image/jpeg":
		return ".jpg"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	default:
		return ".png"
	}
}
