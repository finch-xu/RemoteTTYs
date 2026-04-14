import { useRef, useState, useEffect, useCallback } from 'react';
import type { BaseMessage } from '../lib/protocol';

type MessageHandler = (msg: BaseMessage) => void;

export interface UseWebSocketReturn {
  connected: boolean;
  relayLatencyMs: number | null;
  send: (msg: object) => void;
  subscribe: (type: string, handler: MessageHandler) => () => void;
}

const BROWSER_PING_INTERVAL_MS = 30_000;

export function useWebSocket(): UseWebSocketReturn {
  const [connected, setConnected] = useState(false);
  const [relayLatencyMs, setRelayLatencyMs] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Map<string, Set<MessageHandler>>>(new Map());
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const intentionalCloseRef = useRef(false);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const smoothedLatencyRef = useRef<number | null>(null);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws/terminal`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      console.log('WebSocket connected');

      // Start browser↔relay ping loop
      clearInterval(pingIntervalRef.current);
      smoothedLatencyRef.current = null;
      setRelayLatencyMs(null);
      const sendPing = () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'browser.ping', timestamp: Date.now() }));
        }
      };
      sendPing();
      pingIntervalRef.current = setInterval(sendPing, BROWSER_PING_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as BaseMessage;

        if (msg.type === 'browser.pong') {
          const pong = msg as unknown as { timestamp: number };
          const raw = Date.now() - pong.timestamp;
          const prev = smoothedLatencyRef.current;
          const smoothed = prev === null ? raw : Math.round(0.3 * raw + 0.7 * prev);
          if (smoothed !== prev) {
            smoothedLatencyRef.current = smoothed;
            setRelayLatencyMs(smoothed);
          }
          return;
        }

        const handlers = handlersRef.current.get(msg.type);
        if (handlers) {
          for (const handler of handlers) {
            handler(msg);
          }
        }
      } catch (err) {
        console.error('Failed to parse message:', err);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      clearInterval(pingIntervalRef.current);
      smoothedLatencyRef.current = null;
      setRelayLatencyMs(null);
      if (!intentionalCloseRef.current) {
        console.log('WebSocket disconnected, reconnecting in 3s...');
        reconnectTimerRef.current = setTimeout(connect, 3000);
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };
  }, []);

  useEffect(() => {
    intentionalCloseRef.current = false;
    connect();
    return () => {
      intentionalCloseRef.current = true;
      clearTimeout(reconnectTimerRef.current);
      clearInterval(pingIntervalRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const subscribe = useCallback((type: string, handler: MessageHandler) => {
    if (!handlersRef.current.has(type)) {
      handlersRef.current.set(type, new Set());
    }
    handlersRef.current.get(type)!.add(handler);

    return () => {
      handlersRef.current.get(type)?.delete(handler);
    };
  }, []);

  return { connected, relayLatencyMs, send, subscribe };
}
