import { useTheme } from '../hooks/useTheme';
import type { ProgressInfo, ProgressState } from '../lib/parseOsc9_4';

const STATE_COLORS: Record<ProgressState, (ui: ReturnType<typeof useTheme>['ui']) => string> = {
  0: () => 'transparent',
  1: (ui) => ui.accent,
  2: (ui) => ui.error,
  3: (ui) => ui.accent,
  4: (ui) => ui.warning,
};

export function ProgressBar({ progress }: { progress: ProgressInfo | null }) {
  const { ui } = useTheme();
  const visible = progress !== null;
  const state = progress?.state ?? 0;
  const value = progress?.value ?? 0;
  const color = STATE_COLORS[state](ui);
  const isIndeterminate = state === 3;

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0,
      height: 3, zIndex: 10, overflow: 'hidden',
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.3s ease-out',
      pointerEvents: 'none',
    }}>
      <div
        className={
          state === 2 ? 'progress-bar-pulse' :
          isIndeterminate ? 'progress-bar-indeterminate' :
          undefined
        }
        style={{
          height: '100%',
          background: color,
          borderRadius: '0 1.5px 1.5px 0',
          ...(isIndeterminate
            ? { width: '30%' }
            : { width: `${value}%`, transition: 'width 0.3s ease' }
          ),
        }}
      />
    </div>
  );
}
