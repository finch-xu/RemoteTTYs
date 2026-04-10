import { useRef, useEffect } from 'react';
import { init, Terminal, FitAddon } from 'ghostty-web';
import { encodePayload, decodePayload } from '../lib/protocol';
import { useTheme } from '../hooks/useTheme';
import type { PtyData, PtyExited, PtyReplay } from '../lib/protocol';

interface TerminalViewProps {
  agentId: string;
  sessionId: string;
  isExisting?: boolean;
  send: (msg: object) => void;
  subscribe: (type: string, handler: (msg: any) => void) => () => void;
}

export function TerminalView({ agentId, sessionId, isExisting, send, subscribe }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
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

      send({ type: 'pty.resize', agentId, sessionId, cols: term.cols, rows: term.rows });

      // Fix: Shift+Tab should send backtab sequence \x1b[Z, not \t
      // ghostty-web treats SHIFT+TAB the same as TAB in its InputHandler
      term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
        if (event.key === 'Tab' && event.shiftKey && event.type === 'keydown') {
          send({ type: 'pty.data', agentId, sessionId, payload: encodePayload('\x1b[Z') });
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
        send({ type: 'pty.data', agentId, sessionId, payload: encodePayload(seq) });
        return true;
      });

      const inputDisposable = term.onData((data: string) => {
        send({ type: 'pty.data', agentId, sessionId, payload: encodePayload(data) });
      });
      cleanups.push(() => inputDisposable.dispose());

      cleanups.push(subscribe('pty.data', (msg: PtyData) => {
        if (msg.sessionId === sessionId) term.write(decodePayload(msg.payload));
      }));

      cleanups.push(subscribe('pty.exited', (msg: PtyExited) => {
        if (msg.sessionId === sessionId) {
          term.write(`\r\n\x1b[90m[Process exited with code ${msg.exitCode}]\x1b[0m\r\n`);
        }
      }));

      cleanups.push(subscribe('pty.replay', (msg: PtyReplay) => {
        if (msg.sessionId === sessionId) term.write(decodePayload(msg.payload));
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
            send({ type: 'pty.resize', agentId, sessionId, cols: term.cols, rows: term.rows });
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
      for (const fn of cleanups) fn();
    };
  }, [agentId, sessionId, send, subscribe]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }} />;
}
