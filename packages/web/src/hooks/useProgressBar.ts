import { useState, useCallback, useEffect, useRef } from 'react';
import { parseOsc9_4 } from '../lib/parseOsc9_4';
import type { ProgressInfo } from '../lib/parseOsc9_4';

const AUTO_HIDE_MS = 15_000;

export type { ProgressInfo };

export function useProgressBar(): { progress: ProgressInfo | null; feed: (data: Uint8Array) => void } {
  const [progress, setProgress] = useState<ProgressInfo | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const feed = useCallback((data: Uint8Array) => {
    const info = parseOsc9_4(data);
    if (!info) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (info.state === 0) {
      setProgress(null);
      return;
    }

    setProgress(info);

    // Auto-hide after 15s — matches Ghostty behavior for killed processes
    // that never send state=0 to clear the progress bar
    timerRef.current = setTimeout(() => {
      setProgress(null);
      timerRef.current = null;
    }, AUTO_HIDE_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { progress, feed };
}
