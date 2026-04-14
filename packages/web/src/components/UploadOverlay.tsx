import { useTheme } from '../hooks/useTheme';
import { UI_FONT } from '../lib/theme';
import type { UploadState } from './TerminalView';

interface UploadOverlayProps {
  uploadState: UploadState | null;
  isDragging: boolean;
  showNoClipboardToast: boolean;
  onSendToTerminal: () => void;
  onDismiss: () => void;
}

export function UploadOverlay({ uploadState, isDragging, showNoClipboardToast, onSendToTerminal, onDismiss }: UploadOverlayProps) {
  const { ui } = useTheme();

  return (
    <>
      {/* Drag-over overlay */}
      {isDragging && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 20,
          background: `${ui.accent}18`, border: `2px dashed ${ui.accent}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none', borderRadius: 4,
        }}>
          <span style={{ fontSize: 15, color: ui.accent, fontFamily: UI_FONT, fontWeight: 500 }}>
            Drop image to upload
          </span>
        </div>
      )}

      {/* No clipboard toast */}
      {showNoClipboardToast && (
        <div style={{
          position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 30,
          background: ui.surface, border: `1px solid ${ui.border}`, borderRadius: 8,
          padding: '8px 16px', fontSize: 13, color: ui.textSecondary, fontFamily: UI_FONT,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        }}>
          This Agent does not support image paste (no system clipboard)
        </div>
      )}

      {/* Upload progress / completion overlay */}
      {uploadState && (
        <div style={{
          position: 'absolute', bottom: 12, left: 12, right: 12, zIndex: 30,
          background: ui.surface, border: `1px solid ${ui.border}`, borderRadius: 10,
          padding: '10px 16px', fontFamily: UI_FONT, fontSize: 13,
          boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          {uploadState.status === 'sending' && (
            <>
              <span style={{ color: ui.textSecondary, flexShrink: 0 }}>
                Uploading image ({(uploadState.totalSize / 1024).toFixed(0)} KB)...
              </span>
              <div style={{ flex: 1, height: 4, background: ui.surfaceAlt, borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  width: `${uploadState.totalChunks > 0 ? (uploadState.chunksSent / uploadState.totalChunks) * 100 : 0}%`,
                  height: '100%', background: ui.accent, borderRadius: 2,
                  transition: 'width 0.15s ease',
                }} />
              </div>
              <span style={{ color: ui.textMuted, flexShrink: 0 }}>
                {uploadState.totalChunks > 0 ? Math.round((uploadState.chunksSent / uploadState.totalChunks) * 100) : 0}%
              </span>
            </>
          )}

          {uploadState.status === 'waiting' && (
            <span style={{ color: ui.textSecondary }}>Writing to clipboard...</span>
          )}

          {uploadState.status === 'complete' && (
            <>
              <span style={{ color: ui.online }}>Image ready</span>
              <div style={{ flex: 1 }} />
              <button
                onClick={onSendToTerminal}
                style={{
                  background: ui.accent, color: ui.accentText, border: 'none', borderRadius: 6,
                  padding: '5px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
                }}
              >
                Send to terminal
              </button>
              <button
                onClick={onDismiss}
                style={{
                  background: 'none', border: `1px solid ${ui.border}`, borderRadius: 6,
                  padding: '5px 10px', fontSize: 12, cursor: 'pointer', color: ui.textSecondary, fontFamily: 'inherit',
                }}
              >
                Close
              </button>
            </>
          )}

          {uploadState.status === 'error' && (
            <>
              <span style={{ color: ui.error }}>{uploadState.error || 'Upload failed'}</span>
              <div style={{ flex: 1 }} />
              <button
                onClick={onDismiss}
                style={{
                  background: 'none', border: `1px solid ${ui.border}`, borderRadius: 6,
                  padding: '5px 10px', fontSize: 12, cursor: 'pointer', color: ui.textSecondary, fontFamily: 'inherit',
                }}
              >
                Close
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
