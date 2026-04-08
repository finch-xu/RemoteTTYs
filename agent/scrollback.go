package main

import "sync"

const maxScrollbackBytes = 1024 * 1024 // 1MB

// RingBuffer is a byte-level circular buffer for PTY scrollback.
// It stores raw PTY output bytes and replays them on reconnect.
type RingBuffer struct {
	buf   []byte
	size  int // allocated capacity
	write int // next write position
	count int // total bytes stored (capped at size)
	mu    sync.Mutex
}

func NewRingBuffer(capacity int) *RingBuffer {
	return &RingBuffer{
		buf:  make([]byte, capacity),
		size: capacity,
	}
}

func (rb *RingBuffer) Write(data []byte) {
	rb.mu.Lock()
	defer rb.mu.Unlock()

	n := len(data)
	if n >= rb.size {
		// Data larger than buffer: keep only the tail
		copy(rb.buf, data[n-rb.size:])
		rb.write = 0
		rb.count = rb.size
		return
	}

	// Bulk copy in at most two segments
	first := rb.size - rb.write
	if n <= first {
		copy(rb.buf[rb.write:], data)
	} else {
		copy(rb.buf[rb.write:], data[:first])
		copy(rb.buf, data[first:])
	}
	rb.write = (rb.write + n) % rb.size
	rb.count = min(rb.count+n, rb.size)
}

// Contents returns all buffered bytes in order, oldest first.
func (rb *RingBuffer) Contents() []byte {
	rb.mu.Lock()
	defer rb.mu.Unlock()

	if rb.count == 0 {
		return nil
	}

	result := make([]byte, rb.count)
	if rb.count < rb.size {
		// Buffer hasn't wrapped yet
		copy(result, rb.buf[:rb.count])
	} else {
		// Buffer has wrapped: read from write position to end, then start to write position
		start := rb.write // oldest byte
		firstPart := rb.size - start
		copy(result, rb.buf[start:])
		copy(result[firstPart:], rb.buf[:start])
	}
	return result
}
