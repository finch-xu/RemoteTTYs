import { useRef, useEffect } from 'react';
import { init, Terminal, FitAddon } from 'ghostty-web';
import { useTheme } from '../hooks/useTheme';
import {
  importPublicKeyRaw,
  deriveSessionKeys,
  encrypt,
  decrypt,
  verifyKeyExchangeSignature,
  computeResizeHMAC,
  uint8ToBase64,
  base64ToUint8,
  DIRECTION_B2A,
  DIRECTION_A2B,
} from '../lib/e2e';
import type { E2ESession, E2EKeyPairData } from '../lib/e2e';
import type { PtyCreated, PtyData, PtyExited, PtyReplay, PtyError } from '../lib/protocol';

interface TerminalViewProps {
  agentId: string;
  sessionId: string;
  isExisting?: boolean;
  identityKey: string | null;
  ecdhKeyPair: E2EKeyPairData | null;
  send: (msg: object) => void;
  subscribe: (type: string, handler: (msg: any) => void) => () => void;
  onE2EEstablished?: (sessionId: string, hmacKey: CryptoKey) => void;
}

export function TerminalView({ agentId, sessionId, isExisting, identityKey, ecdhKeyPair, send, subscribe, onE2EEstablished }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const e2eRef = useRef<E2ESession | null>(null);
  const { terminalTheme, fontSize, fontFamily } = useTheme();

  // Update theme/font on existing terminal when settings change
  useEffect(() => {
    if (termRef.current) {
      termRef.current.renderer?.setTheme(terminalTheme.colors);
    }
  }, [terminalTheme]);

  useEffect(() => {
    if (!termRef.current) return;
    // Wait for web fonts to load before updating renderer metrics
    document.fonts.ready.then(() => {
      termRef.current?.renderer?.setFontSize(fontSize);
      termRef.current?.renderer?.setFontFamily(fontFamily);
    });
  }, [fontSize, fontFamily]);

  useEffect(() => {
    if (!containerRef.current) return;

    let disposed = false;
    const cleanups: (() => void)[] = [];

    const setup = async () => {
      await init();

      if (disposed || !containerRef.current) return;

      const term = new Terminal({
        cursorBlink: true,
        fontSize,
        fontFamily,
        theme: terminalTheme.colors,
      });
      termRef.current = term;

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(containerRef.current);
      fitAddon.fit();

      // --- E2E helpers ---

      async function encryptPayload(data: string): Promise<string> {
        const session = e2eRef.current;
        if (!session) throw new Error('E2E session not established');
        const plaintext = new TextEncoder().encode(data);
        const ct = await encrypt(session.keys.keyB2A, plaintext, DIRECTION_B2A, session.sendCounter);
        session.sendCounter++;
        return uint8ToBase64(ct);
      }

      async function decryptPayload(payload: string): Promise<Uint8Array> {
        const session = e2eRef.current;
        if (!session) throw new Error('E2E session not established');
        const data = base64ToUint8(payload);
        const plaintext = await decrypt(session.keys.keyA2B, data, DIRECTION_A2B, session.recvCounter);
        session.recvCounter++;
        return plaintext;
      }

      // Promise queue to serialize encrypted sends (prevents counter race on fast paste)
      let sendQueue = Promise.resolve();
      async function sendEncryptedData(data: string) {
        sendQueue = sendQueue.then(async () => {
          try {
            const payload = await encryptPayload(data);
            send({ type: 'pty.data', agentId, sessionId, payload });
          } catch {
            // E2E not yet established — drop input until key exchange completes
          }
        });
      }

      /** Send pty.resize with HMAC if E2E is active. */
      async function sendResize(cols: number, rows: number) {
        const session = e2eRef.current;
        if (session) {
          const hmac = await computeResizeHMAC(session.keys.hmacKey, sessionId, cols, rows);
          send({ type: 'pty.resize', agentId, sessionId, cols, rows, hmac });
        } else {
          send({ type: 'pty.resize', agentId, sessionId, cols, rows });
        }
      }

      // Send initial resize
      sendResize(term.cols, term.rows);

      // --- Key exchange: handle pty.created ---
      if (!isExisting && ecdhKeyPair && identityKey) {
        cleanups.push(subscribe('pty.created', async (msg: PtyCreated) => {
          if (msg.sessionId !== sessionId) return;
          if (!msg.publicKey || !msg.signature) return;

          try {
            const agentPubRaw = base64ToUint8(msg.publicKey);
            const signatureRaw = base64ToUint8(msg.signature);
            const identityKeyRaw = base64ToUint8(identityKey);

            // Verify Ed25519 signature
            const valid = await verifyKeyExchangeSignature(
              identityKeyRaw,
              agentPubRaw,
              ecdhKeyPair.publicKeyRaw,
              sessionId,
              signatureRaw,
            );

            if (!valid) {
              console.error('[E2E] Key exchange signature verification failed for session', sessionId);
              term.write('\r\n\x1b[91m[E2E] Key exchange signature verification failed. Session may be compromised.]\x1b[0m\r\n');
              return;
            }

            // Import agent's public key and derive session keys
            const agentPubKey = await importPublicKeyRaw(agentPubRaw);
            const keys = await deriveSessionKeys(
              ecdhKeyPair.keyPair.privateKey,
              agentPubKey,
              ecdhKeyPair.publicKeyRaw,
              agentPubRaw,
            );

            e2eRef.current = {
              keys,
              sendCounter: 0,
              recvCounter: 0,
            };

            // Notify parent so it can use hmacKey for close messages
            onE2EEstablished?.(sessionId, keys.hmacKey);

            console.log('[E2E] Session keys established for', sessionId);
          } catch (err) {
            console.error('[E2E] Key exchange failed:', err);
            term.write('\r\n\x1b[91m[E2E] Key exchange failed. Terminal may not work correctly.]\x1b[0m\r\n');
          }
        }));
      }

      // --- Input handling ---

      // Fix: Shift+Tab should send backtab sequence \x1b[Z, not \t
      // ghostty-web treats SHIFT+TAB the same as TAB in its InputHandler
      term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
        if (event.key === 'Tab' && event.shiftKey && event.type === 'keydown') {
          sendEncryptedData('\x1b[Z');
          return true;
        }
        return false;
      });

      // Fix: Forward mouse wheel events as SGR mouse protocol when TUI apps
      // enable mouse tracking (e.g. Claude Code, vim). ghostty-web defaults to
      // sending arrow keys in alternate screen, which doesn't work for apps
      // that use mouse-based scrolling.
      term.attachCustomWheelEventHandler((event: WheelEvent) => {
        if (!term.hasMouseTracking()) return false;

        const canvas = containerRef.current?.querySelector('canvas');
        if (!canvas) return false;

        const rect = canvas.getBoundingClientRect();
        const charW = term.renderer?.charWidth ?? 8;
        const charH = term.renderer?.charHeight ?? 16;
        const x = Math.max(1, Math.floor((event.clientX - rect.left) / charW) + 1);
        const y = Math.max(1, Math.floor((event.clientY - rect.top) / charH) + 1);
        const button = event.deltaY > 0 ? 65 : 64; // wheel down : wheel up

        const seq = `\x1b[<${button};${x};${y}M`;
        sendEncryptedData(seq);
        return true;
      });

      const inputDisposable = term.onData((data: string) => {
        sendEncryptedData(data);
      });
      cleanups.push(() => inputDisposable.dispose());

      // --- Incoming data ---

      cleanups.push(subscribe('pty.data', async (msg: PtyData) => {
        if (msg.sessionId !== sessionId) return;
        try {
          const bytes = await decryptPayload(msg.payload);
          term.write(bytes);
        } catch (err) {
          console.error('[E2E] Failed to decrypt pty.data:', err);
        }
      }));

      cleanups.push(subscribe('pty.exited', (msg: PtyExited) => {
        if (msg.sessionId === sessionId) {
          term.write(`\r\n\x1b[90m[Process exited with code ${msg.exitCode}]\x1b[0m\r\n`);
        }
      }));

      cleanups.push(subscribe('pty.replay', async (msg: PtyReplay) => {
        if (msg.sessionId !== sessionId) return;
        try {
          const bytes = await decryptPayload(msg.payload);
          term.write(bytes);
        } catch (err) {
          console.error('[E2E] Failed to decrypt pty.replay:', err);
        }
      }));

      // --- Handle pty.error ---
      cleanups.push(subscribe('pty.error', (msg: PtyError) => {
        if (msg.sessionId === sessionId) {
          term.write(`\r\n\x1b[91m[Error: ${msg.error}]\x1b[0m\r\n`);
        }
      }));

      if (isExisting) {
        send({ type: 'pty.replay.request', agentId, sessionId });
      }

      let resizeTimer: ReturnType<typeof setTimeout>;
      let lastCols = term.cols;
      let lastRows = term.rows;
      const resizeObserver = new ResizeObserver(() => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          fitAddon.fit();
          if (term.cols !== lastCols || term.rows !== lastRows) {
            lastCols = term.cols;
            lastRows = term.rows;
            sendResize(term.cols, term.rows);
          }
        }, 100);
      });
      resizeObserver.observe(containerRef.current!);
      cleanups.push(() => { clearTimeout(resizeTimer); resizeObserver.disconnect(); });
      cleanups.push(() => term.dispose());
    };

    setup();

    return () => {
      disposed = true;
      e2eRef.current = null;
      for (const fn of cleanups) fn();
    };
  }, [agentId, sessionId, send, subscribe]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'hidden', background: terminalTheme.colors.background }} />;
}
