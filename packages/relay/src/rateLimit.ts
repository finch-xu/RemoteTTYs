import type { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const MAX_STORE_SIZE = 50_000;

export class RateLimitStore {
  private store = new Map<string, RateLimitEntry>();

  constructor(private windowMs: number, private maxRequests: number) {
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store.entries()) {
        if (now > entry.resetAt) this.store.delete(key);
      }
    }, Math.min(windowMs, 5 * 60 * 1000));
  }

  check(key: string): boolean {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now > entry.resetAt) {
      if (this.store.size >= MAX_STORE_SIZE) return false;
      this.store.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    entry.count++;
    return entry.count <= this.maxRequests;
  }
}

export function createRateLimiter(windowMs: number, maxRequests: number) {
  const limiter = new RateLimitStore(windowMs, maxRequests);

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    if (!limiter.check(key)) {
      res.status(429).json({ error: 'Too many requests. Try again later.' });
      return;
    }
    next();
  };
}
