import { WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { BrowserMessage, parseMessage } from './protocol.js';

export interface BrowserConnection {
  id: string;
  ws: WebSocket;
  subscribedSessions: Set<string>;
}

const browsers = new Map<string, BrowserConnection>();

let onBrowserMessage: (browserId: string, msg: BrowserMessage) => void = () => {};
let onBrowserDisconnect: (browserId: string) => void = () => {};

export function setBrowserMessageHandler(handler: typeof onBrowserMessage) {
  onBrowserMessage = handler;
}

export function setBrowserDisconnectHandler(handler: typeof onBrowserDisconnect) {
  onBrowserDisconnect = handler;
}

const MAX_BROWSER_MSG_SIZE = 64 * 1024; // 64KB (browser sends keystrokes, not large data)
const MAX_BROWSER_CONNECTIONS = 100;

export function handleBrowserConnection(ws: WebSocket) {
  if (browsers.size >= MAX_BROWSER_CONNECTIONS) {
    console.error('Max browser connections reached, rejecting new connection');
    ws.close(1013, 'Too many connections');
    return;
  }

  const browserId = randomUUID();
  const conn: BrowserConnection = {
    id: browserId,
    ws,
    subscribedSessions: new Set(),
  };
  browsers.set(browserId, conn);
  console.log(`Browser connected: ${browserId}`);

  ws.on('message', (data) => {
    const raw = data.toString();
    if (raw.length > MAX_BROWSER_MSG_SIZE) {
      console.error(`Browser ${browserId} message exceeds size limit:`, raw.length);
      ws.close(1009, 'Message too large');
      return;
    }
    let msg: BrowserMessage;
    try {
      msg = parseMessage(raw) as BrowserMessage;
    } catch {
      console.error('Invalid message from browser:', raw);
      return;
    }

    onBrowserMessage(browserId, msg);
  });

  ws.on('close', () => {
    console.log(`Browser disconnected: ${browserId}`);
    browsers.delete(browserId);
    onBrowserDisconnect(browserId);
  });

  ws.on('error', (err) => {
    console.error(`Browser WebSocket error: ${err.message}`);
  });
}

export function getBrowser(browserId: string): BrowserConnection | undefined {
  return browsers.get(browserId);
}

export function sendToBrowser(browserId: string, msg: object) {
  const browser = browsers.get(browserId);
  if (browser && browser.ws.readyState === WebSocket.OPEN) {
    browser.ws.send(JSON.stringify(msg));
  }
}

export function broadcastToBrowsers(msg: object) {
  const payload = JSON.stringify(msg);
  for (const browser of browsers.values()) {
    if (browser.ws.readyState === WebSocket.OPEN) {
      browser.ws.send(payload);
    }
  }
}

export function sendToSessionSubscribers(sessionId: string, msg: object) {
  const payload = JSON.stringify(msg);
  for (const browser of browsers.values()) {
    if (browser.subscribedSessions.has(sessionId) && browser.ws.readyState === WebSocket.OPEN) {
      browser.ws.send(payload);
    }
  }
}
