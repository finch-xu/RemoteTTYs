import { useRef, useEffect } from 'react';
import { init, Terminal, FitAddon } from 'ghostty-web';
import { encodePayload, decodePayload } from '../lib/protocol';
import { useTheme } from '../hooks/useTheme';
import { MONO_FONT } from '../lib/theme';
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
  const { terminalTheme } = useTheme();

  // Update theme on existing terminal when theme changes
  useEffect(() => {
    if (termRef.current) {
      termRef.current.setTheme(terminalTheme.colors);
    }
  }, [terminalTheme]);

  useEffect(() => {
    if (!containerRef.current) return;

    let disposed = false;
    const cleanups: (() => void)[] = [];

    const setup = async () => {
      await init();

      if (disposed || !containerRef.current) return;

      const term = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: MONO_FONT,
        theme: terminalTheme.colors,
      });
      termRef.current = term;

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(containerRef.current);
      fitAddon.fit();

      send({ type: 'pty.resize', agentId, sessionId, cols: term.cols, rows: term.rows });

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
