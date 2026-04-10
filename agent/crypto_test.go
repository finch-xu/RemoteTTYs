package main

import (
	"bytes"
	"testing"
)

func TestECDHKeyExchange(t *testing.T) {
	privA, pubA, err := GenerateECDHKeyPair()
	if err != nil {
		t.Fatalf("GenerateECDHKeyPair A: %v", err)
	}
	privB, pubB, err := GenerateECDHKeyPair()
	if err != nil {
		t.Fatalf("GenerateECDHKeyPair B: %v", err)
	}

	secretA, err := ComputeSharedSecret(privA, pubB)
	if err != nil {
		t.Fatalf("ComputeSharedSecret A: %v", err)
	}
	secretB, err := ComputeSharedSecret(privB, pubA)
	if err != nil {
		t.Fatalf("ComputeSharedSecret B: %v", err)
	}

	if !bytes.Equal(secretA, secretB) {
		t.Fatalf("shared secrets differ: A=%x B=%x", secretA, secretB)
	}
	if len(secretA) == 0 {
		t.Fatal("shared secret is empty")
	}
}

func TestDeriveSessionKeys(t *testing.T) {
	sharedSecret := bytes.Repeat([]byte{0xAB}, 32)
	browserPub := bytes.Repeat([]byte{0x01}, 65)
	agentPub := bytes.Repeat([]byte{0x02}, 65)

	keys1, err := DeriveSessionKeys(sharedSecret, browserPub, agentPub)
	if err != nil {
		t.Fatalf("DeriveSessionKeys: %v", err)
	}
	keys2, err := DeriveSessionKeys(sharedSecret, browserPub, agentPub)
	if err != nil {
		t.Fatalf("DeriveSessionKeys second call: %v", err)
	}

	// Deterministic
	if !bytes.Equal(keys1.KeyB2A, keys2.KeyB2A) {
		t.Fatal("KeyB2A not deterministic")
	}
	if !bytes.Equal(keys1.KeyA2B, keys2.KeyA2B) {
		t.Fatal("KeyA2B not deterministic")
	}
	if !bytes.Equal(keys1.HMACKey, keys2.HMACKey) {
		t.Fatal("HMACKey not deterministic")
	}

	// Each key is 32 bytes
	if len(keys1.KeyB2A) != 32 {
		t.Fatalf("KeyB2A length %d, want 32", len(keys1.KeyB2A))
	}
	if len(keys1.KeyA2B) != 32 {
		t.Fatalf("KeyA2B length %d, want 32", len(keys1.KeyA2B))
	}
	if len(keys1.HMACKey) != 32 {
		t.Fatalf("HMACKey length %d, want 32", len(keys1.HMACKey))
	}

	// B2A != A2B (different keys)
	if bytes.Equal(keys1.KeyB2A, keys1.KeyA2B) {
		t.Fatal("KeyB2A and KeyA2B are equal, expected different keys")
	}
}

func TestEncryptDecryptRoundTrip(t *testing.T) {
	key := bytes.Repeat([]byte{0x55}, 32)
	plaintext := []byte("hello, remote terminal!")

	ciphertext, err := Encrypt(key, plaintext, DirectionB2A, 0)
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}
	if bytes.Equal(ciphertext, plaintext) {
		t.Fatal("ciphertext equals plaintext")
	}

	recovered, err := Decrypt(key, ciphertext, DirectionB2A, 0)
	if err != nil {
		t.Fatalf("Decrypt: %v", err)
	}
	if !bytes.Equal(recovered, plaintext) {
		t.Fatalf("decrypted %q, want %q", recovered, plaintext)
	}
}

func TestDecryptRejectsWrongKey(t *testing.T) {
	key := bytes.Repeat([]byte{0xAA}, 32)
	wrongKey := bytes.Repeat([]byte{0xBB}, 32)
	plaintext := []byte("sensitive data")

	ciphertext, err := Encrypt(key, plaintext, DirectionA2B, 1)
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}

	_, err = Decrypt(wrongKey, ciphertext, DirectionA2B, 1)
	if err == nil {
		t.Fatal("Decrypt with wrong key should fail but succeeded")
	}
}

func TestDecryptRejectsWrongCounter(t *testing.T) {
	key := bytes.Repeat([]byte{0xCC}, 32)
	plaintext := []byte("counter test")

	ciphertext, err := Encrypt(key, plaintext, DirectionB2A, 42)
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}

	_, err = Decrypt(key, ciphertext, DirectionB2A, 99)
	if err == nil {
		t.Fatal("Decrypt with wrong counter should fail but succeeded")
	}
}

func TestComputeHMAC(t *testing.T) {
	key := bytes.Repeat([]byte{0x11}, 32)
	data := []byte("test data for hmac")

	mac1 := ComputeHMAC(key, data)
	mac2 := ComputeHMAC(key, data)

	// Deterministic
	if !bytes.Equal(mac1, mac2) {
		t.Fatal("HMAC not deterministic")
	}
	if len(mac1) != 32 {
		t.Fatalf("HMAC length %d, want 32", len(mac1))
	}

	// VerifyHMAC passes for correct mac
	if !VerifyHMAC(key, data, mac1) {
		t.Fatal("VerifyHMAC returned false for correct HMAC")
	}

	// VerifyHMAC rejects wrong mac
	wrongMac := make([]byte, 32)
	copy(wrongMac, mac1)
	wrongMac[0] ^= 0xFF
	if VerifyHMAC(key, data, wrongMac) {
		t.Fatal("VerifyHMAC returned true for wrong HMAC")
	}
}

func TestPublicKeyRawFormat(t *testing.T) {
	_, pub, err := GenerateECDHKeyPair()
	if err != nil {
		t.Fatalf("GenerateECDHKeyPair: %v", err)
	}

	raw := pub.Bytes()
	if len(raw) != 65 {
		t.Fatalf("public key raw length %d, want 65", len(raw))
	}
	if raw[0] != 0x04 {
		t.Fatalf("public key prefix 0x%02x, want 0x04", raw[0])
	}

	// Round-trip through ParseECDHPublicKey
	parsed, err := ParseECDHPublicKey(raw)
	if err != nil {
		t.Fatalf("ParseECDHPublicKey: %v", err)
	}
	if !bytes.Equal(parsed.Bytes(), raw) {
		t.Fatal("round-trip public key bytes differ")
	}
}

func TestBuildNonce(t *testing.T) {
	nonce := buildNonce(DirectionB2A, 0x0102030405060708)

	if len(nonce) != 12 {
		t.Fatalf("nonce length %d, want 12", len(nonce))
	}
	// byte 0: direction
	if nonce[0] != DirectionB2A {
		t.Fatalf("nonce[0] = 0x%02x, want DirectionB2A (0x%02x)", nonce[0], DirectionB2A)
	}
	// bytes 1-8: counter big-endian
	want := []byte{0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08}
	if !bytes.Equal(nonce[1:9], want) {
		t.Fatalf("nonce counter bytes %x, want %x", nonce[1:9], want)
	}
	// bytes 9-11: zero padding
	if nonce[9] != 0 || nonce[10] != 0 || nonce[11] != 0 {
		t.Fatalf("nonce padding bytes %x, want zeros", nonce[9:12])
	}

	// Test A2B direction
	nonce2 := buildNonce(DirectionA2B, 1)
	if nonce2[0] != DirectionA2B {
		t.Fatalf("nonce2[0] = 0x%02x, want DirectionA2B (0x%02x)", nonce2[0], DirectionA2B)
	}
}
