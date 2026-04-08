import { useRef, useState, useEffect, useCallback } from 'react';
import type { BaseMessage } from '../lib/protocol';

type MessageHandler = (msg: BaseMessage) => void;

export interface UseWebSocketReturn {
  connected: boolean;
  send: (msg: object) => void;
  subscribe: (type: string, handler: MessageHandler) => () => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Map<string, Set<MessageHandler>>>(new Map());
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const intentionalCloseRef = useRef(false);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws/terminal`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as BaseMessage;
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

  return { connected, send, subscribe };
}
