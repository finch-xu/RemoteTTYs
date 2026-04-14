package main

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"log"
	"time"
)

const (
	maxTransferSize     = 10 * 1024 * 1024 // 10MB
	maxTransfersPerSess = 1                // clipboard is shared, one at a time
	transferTimeout     = 60 * time.Second
)

type PendingTransfer struct {
	TransferID  string
	SessionID   string
	FileName    string
	MimeType    string
	TotalSize   int
	TotalChunks int
	ExpectedSHA string
	Chunks      map[int][]byte
	ReceivedCnt int
	CreatedAt   time.Time
}

type transferMetadata struct {
	FileName    string `json:"fileName"`
	MimeType    string `json:"mimeType"`
	TotalSize   int    `json:"totalSize"`
	TotalChunks int    `json:"totalChunks"`
	SHA256      string `json:"sha256"`
}

type transferEndData struct {
	SHA256 string `json:"sha256"`
}

type ackPayload struct {
	Accepted bool   `json:"accepted"`
	Error    string `json:"error,omitempty"`
}

type progressPayload struct {
	ChunksReceived int `json:"chunksReceived"`
}

type completePayload struct {
	Mode        string `json:"mode"`
	SHA256Match bool   `json:"sha256Match"`
}

// decryptIncoming decodes base64, decrypts with B2A key, and increments RecvCounter.
func decryptIncoming(sess *Session, payload string) ([]byte, error) {
	encrypted, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		return nil, err
	}
	plaintext, err := Decrypt(sess.Keys.GCMB2A, encrypted, DirectionB2A, sess.RecvCounter)
	if err != nil {
		return nil, err
	}
	sess.RecvCounter++
	return plaintext, nil
}

// encryptOutgoing encrypts data with A2B key, increments SendCounter, and returns base64.
func encryptOutgoing(sess *Session, data []byte) string {
	ct := Encrypt(sess.Keys.GCMA2B, data, DirectionA2B, sess.sendCounterNext())
	return base64.StdEncoding.EncodeToString(ct)
}

func (c *Client) sendAck(sess *Session, transferID string, accepted bool, errMsg string) {
	data, _ := json.Marshal(ackPayload{Accepted: accepted, Error: errMsg})
	c.Send(FileTransferAckMsg{
		Type:       "file.transfer.ack",
		SessionID:  sess.ID,
		TransferID: transferID,
		Payload:    encryptOutgoing(sess, data),
	})
}

func (c *Client) handleFileTransferStart(msg IncomingMessage) {
	sess := c.getSession(msg.SessionID)
	if sess == nil {
		return
	}

	plaintext, err := decryptIncoming(sess, msg.Payload)
	if err != nil {
		log.Printf("session %s: file.transfer.start decrypt error: %v", msg.SessionID, err)
		return
	}

	var meta transferMetadata
	if err := json.Unmarshal(plaintext, &meta); err != nil {
		log.Printf("session %s: file.transfer.start metadata parse error: %v", msg.SessionID, err)
		return
	}

	if !c.hasClipboard {
		c.sendAck(sess, msg.TransferID, false, "clipboard not available on this agent")
		return
	}
	if meta.TotalSize > maxTransferSize {
		c.sendAck(sess, msg.TransferID, false, "file too large")
		return
	}
	if meta.TotalChunks <= 0 || meta.TotalSize <= 0 {
		c.sendAck(sess, msg.TransferID, false, "invalid transfer metadata")
		return
	}
	if len(sess.PendingTransfers) >= maxTransfersPerSess {
		c.sendAck(sess, msg.TransferID, false, "too many concurrent transfers")
		return
	}

	sess.PendingTransfers[msg.TransferID] = &PendingTransfer{
		TransferID:  msg.TransferID,
		SessionID:   msg.SessionID,
		FileName:    meta.FileName,
		MimeType:    meta.MimeType,
		TotalSize:   meta.TotalSize,
		TotalChunks: meta.TotalChunks,
		ExpectedSHA: meta.SHA256,
		Chunks:      make(map[int][]byte),
		CreatedAt:   time.Now(),
	}

	c.sendAck(sess, msg.TransferID, true, "")
	log.Printf("session %s: file transfer %s started (%s, %d bytes, %d chunks)",
		msg.SessionID, msg.TransferID, meta.MimeType, meta.TotalSize, meta.TotalChunks)
}

func (c *Client) handleFileTransferChunk(msg IncomingMessage) {
	sess := c.getSession(msg.SessionID)
	if sess == nil {
		return
	}

	pt := sess.PendingTransfers[msg.TransferID]
	if pt == nil {
		return
	}

	if time.Since(pt.CreatedAt) > transferTimeout {
		log.Printf("session %s: transfer %s timed out", msg.SessionID, msg.TransferID)
		delete(sess.PendingTransfers, msg.TransferID)
		return
	}

	plaintext, err := decryptIncoming(sess, msg.Payload)
	if err != nil {
		log.Printf("session %s: chunk decrypt error: %v", msg.SessionID, err)
		return
	}

	pt.Chunks[msg.ChunkIndex] = plaintext
	pt.ReceivedCnt++

	if pt.ReceivedCnt%10 == 0 {
		data, _ := json.Marshal(progressPayload{ChunksReceived: pt.ReceivedCnt})
		c.Send(FileTransferProgressMsg{
			Type:       "file.transfer.progress",
			SessionID:  msg.SessionID,
			TransferID: msg.TransferID,
			Payload:    encryptOutgoing(sess, data),
		})
	}
}

func (c *Client) handleFileTransferEnd(msg IncomingMessage) {
	sess := c.getSession(msg.SessionID)
	if sess == nil {
		return
	}

	pt := sess.PendingTransfers[msg.TransferID]
	if pt == nil {
		return
	}
	defer delete(sess.PendingTransfers, msg.TransferID)

	plaintext, err := decryptIncoming(sess, msg.Payload)
	if err != nil {
		log.Printf("session %s: file.transfer.end decrypt error: %v", msg.SessionID, err)
		return
	}

	var endData transferEndData
	if err := json.Unmarshal(plaintext, &endData); err != nil {
		log.Printf("session %s: file.transfer.end parse error: %v", msg.SessionID, err)
		return
	}

	// Reassemble chunks in order
	assembled := make([]byte, 0, pt.TotalSize)
	for i := 0; i < pt.TotalChunks; i++ {
		chunk, ok := pt.Chunks[i]
		if !ok {
			log.Printf("session %s: transfer %s missing chunk %d", msg.SessionID, msg.TransferID, i)
			c.sendAck(sess, msg.TransferID, false, "missing chunks")
			return
		}
		assembled = append(assembled, chunk...)
	}

	hash := sha256.Sum256(assembled)
	actualSHA := hex.EncodeToString(hash[:])
	sha256Match := actualSHA == endData.SHA256

	if !sha256Match {
		log.Printf("session %s: transfer %s SHA-256 mismatch (expected %s, got %s)",
			msg.SessionID, msg.TransferID, endData.SHA256, actualSHA)
	}

	if err := WriteImageToClipboard(assembled, pt.MimeType); err != nil {
		log.Printf("session %s: clipboard write error: %v", msg.SessionID, err)
		c.sendAck(sess, msg.TransferID, false, "clipboard write failed: "+err.Error())
		return
	}

	data, _ := json.Marshal(completePayload{Mode: "clipboard", SHA256Match: sha256Match})
	c.Send(FileTransferCompleteMsg{
		Type:       "file.transfer.complete",
		SessionID:  msg.SessionID,
		TransferID: msg.TransferID,
		Payload:    encryptOutgoing(sess, data),
	})

	log.Printf("session %s: transfer %s complete, written to clipboard (%d bytes, sha256_ok=%v)",
		msg.SessionID, msg.TransferID, len(assembled), sha256Match)
}
