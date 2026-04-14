import { useRef, useEffect, useState, useCallback } from 'react';
import { init, Terminal, FitAddon } from 'ghostty-web';
import { useTheme } from '../hooks/useTheme';
import { UploadOverlay } from './UploadOverlay';
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
import type { PtyData, PtyExited, PtyReplay, PtyError, FileTransferComplete } from '../lib/protocol';

const CHUNK_SIZE = 32 * 1024; // 32KB per chunk

export interface UploadState {
  transferId: string;
  fileName: string;
  totalSize: number;
  totalChunks: number;
  chunksSent: number;
  status: 'sending' | 'waiting' | 'complete' | 'error';
  error?: string;
}

interface TerminalViewProps {
  agentId: string;
  sessionId: string;
  isExisting?: boolean;
  identityKey: string | null;
  ecdhKeyPair: E2EKeyPairData | null;
  agentPublicKey: string | null;
  agentSignature: string | null;
  clipboardAvailable: boolean;
  send: (msg: object) => void;
  subscribe: (type: string, handler: (msg: any) => void) => () => void;
  onE2EEstablished?: (sessionId: string, hmacKey: CryptoKey) => void;
}

export function TerminalView({ agentId, sessionId, isExisting, identityKey, ecdhKeyPair, agentPublicKey, agentSignature, clipboardAvailable, send, subscribe, onE2EEstablished }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const e2eRef = useRef<E2ESession | null>(null);
  const { terminalTheme, fontSize, fontFamily, pasteImageTypes, pasteImageMaxSizeMB } = useTheme();
  const [uploadState, setUploadState] = useState<UploadState | null>(null);
  const [showNoClipboardToast, setShowNoClipboardToast] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const sendEncryptedDataRef = useRef<((data: string) => void) | null>(null);
  const clipboardToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

      async function encryptAndEncode(plaintext: Uint8Array): Promise<string> {
        const session = e2eRef.current;
        if (!session) throw new Error('E2E session not established');
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

      const textEncoder = new TextEncoder();

      // Promise queue to serialize encrypted sends (prevents counter race on fast paste)
      let sendQueue = Promise.resolve();
      function queueEncryptedSend(plaintext: Uint8Array, msg: object) {
        sendQueue = sendQueue.then(async () => {
          try {
            const payload = await encryptAndEncode(plaintext);
            send({ ...msg, payload });
          } catch {
            // E2E not yet established — drop until key exchange completes
          }
        });
      }
      async function sendEncryptedData(data: string) {
        queueEncryptedSend(textEncoder.encode(data), { type: 'pty.data', agentId, sessionId });
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

      // --- E2E key exchange (inline using props, not via pty.created subscription) ---
      // pty.created is processed by TerminalTabs before TerminalView mounts,
      // so subscribing to it here would be too late. Instead, the agent's
      // publicKey and signature are passed as props.
      if (!isExisting && ecdhKeyPair && identityKey && agentPublicKey && agentSignature) {
        try {
          const agentPubRaw = base64ToUint8(agentPublicKey);
          const signatureRaw = base64ToUint8(agentSignature);
          const identityKeyRaw = base64ToUint8(identityKey);

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
          } else {
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

            onE2EEstablished?.(sessionId, keys.hmacKey);
            console.log('[E2E] Session keys established for', sessionId);
          }
        } catch (err) {
          console.error('[E2E] Key exchange failed:', err);
          term.write('\r\n\x1b[91m[E2E] Key exchange failed. Terminal may not work correctly.]\x1b[0m\r\n');
        }
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

      sendEncryptedDataRef.current = sendEncryptedData;
      cleanups.push(() => { sendEncryptedDataRef.current = null; });

      // --- Image paste/drop handling ---

      async function startImageTransfer(file: File) {
        if (!e2eRef.current) return;

        const allowedTypes = pasteImageTypes ?? ['image/png', 'image/jpeg'];
        if (!allowedTypes.includes(file.type)) return;

        const maxSize = (pasteImageMaxSizeMB ?? 10) * 1024 * 1024;
        if (file.size > maxSize) {
          setUploadState({ transferId: '', fileName: file.name, totalSize: file.size, totalChunks: 0, chunksSent: 0, status: 'error', error: `Image too large (${(file.size / 1024 / 1024).toFixed(1)} MB), max ${pasteImageMaxSizeMB ?? 10} MB` });
          return;
        }

        const buffer = new Uint8Array(await file.arrayBuffer());
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const sha256 = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

        const transferId = crypto.randomUUID();
        const totalChunks = Math.ceil(buffer.length / CHUNK_SIZE);
        const fileName = file.name || 'image.png';

        setUploadState({ transferId, fileName, totalSize: buffer.length, totalChunks, chunksSent: 0, status: 'sending' });

        // Each message queued individually via queueEncryptedSend so keyboard input can interleave
        queueEncryptedSend(
          textEncoder.encode(JSON.stringify({ fileName, mimeType: file.type, totalSize: buffer.length, totalChunks, sha256 })),
          { type: 'file.transfer.start', agentId, sessionId, transferId },
        );

        for (let i = 0; i < totalChunks; i++) {
          const start = i * CHUNK_SIZE;
          const chunk = buffer.slice(start, Math.min(start + CHUNK_SIZE, buffer.length));
          const chunkIndex = i;
          queueEncryptedSend(chunk, { type: 'file.transfer.chunk', agentId, sessionId, transferId, chunkIndex });
          // Throttle progress updates to every 5 chunks or the last chunk
          if ((i + 1) % 5 === 0 || i + 1 === totalChunks) {
            sendQueue = sendQueue.then(() => {
              setUploadState(prev => prev?.transferId === transferId ? { ...prev, chunksSent: chunkIndex + 1 } : prev);
            });
          }
        }

        queueEncryptedSend(
          textEncoder.encode(JSON.stringify({ sha256 })),
          { type: 'file.transfer.end', agentId, sessionId, transferId },
        );
        sendQueue = sendQueue.then(() => {
          setUploadState(prev => prev?.transferId === transferId ? { ...prev, status: 'waiting' } : prev);
        });
      }

      // Capture phase — intercept image pastes before ghostty-web's text paste handler
      function handleImagePaste(event: ClipboardEvent) {
        if (!event.clipboardData) return;
        const items = event.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.startsWith('image/')) {
            event.preventDefault();
            event.stopPropagation();
            if (!clipboardAvailable) {
              if (clipboardToastTimerRef.current) clearTimeout(clipboardToastTimerRef.current);
              setShowNoClipboardToast(true);
              clipboardToastTimerRef.current = setTimeout(() => setShowNoClipboardToast(false), 3000);
              return;
            }
            const file = items[i].getAsFile();
            if (file) startImageTransfer(file);
            return;
          }
        }
      }

      containerRef.current.addEventListener('paste', handleImagePaste, { capture: true });
      cleanups.push(() => containerRef.current?.removeEventListener('paste', handleImagePaste, { capture: true }));

      // Drag-and-drop handlers
      function handleDragOver(event: DragEvent) {
        if (event.dataTransfer?.types.includes('Files')) {
          event.preventDefault();
          setIsDragging(true);
        }
      }
      function handleDragLeave() {
        setIsDragging(false);
      }
      function handleDrop(event: DragEvent) {
        event.preventDefault();
        setIsDragging(false);
        if (!clipboardAvailable || !event.dataTransfer?.files.length) return;
        const file = event.dataTransfer.files[0];
        if (file.type.startsWith('image/')) {
          startImageTransfer(file);
        }
      }

      containerRef.current.addEventListener('dragover', handleDragOver);
      containerRef.current.addEventListener('dragleave', handleDragLeave);
      containerRef.current.addEventListener('drop', handleDrop);
      cleanups.push(() => {
        containerRef.current?.removeEventListener('dragover', handleDragOver);
        containerRef.current?.removeEventListener('dragleave', handleDragLeave);
        containerRef.current?.removeEventListener('drop', handleDrop);
      });

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

      cleanups.push(subscribe('file.transfer.complete', (msg: FileTransferComplete) => {
        if (msg.sessionId !== sessionId) return;
        setUploadState(prev => {
          if (!prev || prev.transferId !== msg.transferId) return prev;
          return { ...prev, status: 'complete' };
        });
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
      if (clipboardToastTimerRef.current) clearTimeout(clipboardToastTimerRef.current);
      for (const fn of cleanups) fn();
    };
  }, [agentId, sessionId, agentPublicKey, agentSignature, send, subscribe]);

  const handleSendToTerminal = useCallback(() => {
    sendEncryptedDataRef.current?.('\x16');
    setUploadState(null);
  }, []);

  const handleDismissUpload = useCallback(() => {
    setUploadState(null);
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'hidden', background: terminalTheme.colors.background }} />
      <UploadOverlay
        uploadState={uploadState}
        isDragging={isDragging}
        showNoClipboardToast={showNoClipboardToast}
        onSendToTerminal={handleSendToTerminal}
        onDismiss={handleDismissUpload}
      />
    </div>
  );
}
