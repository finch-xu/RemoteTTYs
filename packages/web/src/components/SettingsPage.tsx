import { useTheme } from '../hooks/useTheme';
import { MONO_FONT, terminalThemes, FONT_FAMILIES } from '../lib/theme';
import { DEFAULT_FONT_SIZE } from '../hooks/useTheme';
import type { AppView } from './Sidebar';
import { Page, Card, Button, IOSToggle, SectionHeader } from './primitives';
import * as Icons from '../lib/icons';

const IMAGE_TYPE_OPTIONS = [
  { mime: 'image/png', label: 'PNG', desc: 'screenshots, lossless' },
  { mime: 'image/jpeg', label: 'JPEG', desc: 'photos, lossy' },
  { mime: 'image/gif', label: 'GIF', desc: 'animated images' },
  { mime: 'image/webp', label: 'WebP', desc: 'modern format' },
];

interface SettingsPageProps {
  onNavigate: (view: AppView) => void;
}

export function SettingsPage({ onNavigate }: SettingsPageProps) {
  const {
    terminalThemeName,
    setTerminalThemeName,
    fontSize,
    setFontSize,
    fontFamily,
    setFontFamily,
    pasteImageTypes,
    setPasteImageTypes,
    pasteImageMaxSizeMB,
    setPasteImageMaxSizeMB,
  } = useTheme();

  const resetFont = () => {
    setFontSize(DEFAULT_FONT_SIZE);
    setFontFamily(MONO_FONT);
  };

  const toggleImageType = (mime: string, on: boolean) => {
    if (on) setPasteImageTypes([...pasteImageTypes, mime]);
    else setPasteImageTypes(pasteImageTypes.filter((t) => t !== mime));
  };

  return (
    <Page title="Settings" subtitle="Terminal appearance and input preferences">
      <SectionHeader title="Terminal theme" subtitle="Colors for the PTY output" />
      <Card padding={18} style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {terminalThemes.map((t) => {
            const selected = t.id === terminalThemeName;
            return (
              <div
                key={t.id}
                onClick={() => setTerminalThemeName(t.id)}
                style={{
                  width: 160,
                  padding: 10,
                  borderRadius: 10,
                  cursor: 'pointer',
                  border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                  background: 'var(--surface-alt)',
                  transition: 'border-color 0.15s',
                }}
              >
                <div
                  style={{
                    height: 68,
                    borderRadius: 6,
                    overflow: 'hidden',
                    marginBottom: 8,
                    background: t.colors.background,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    padding: '0 10px',
                    fontFamily: MONO_FONT,
                    fontSize: 10,
                    lineHeight: 1.5,
                  }}
                >
                  <div style={{ color: t.colors.foreground }}>
                    <span style={{ color: t.colors.green }}>$</span> ls{' '}
                    <span style={{ color: t.colors.blue }}>~/src</span>
                  </div>
                  <div style={{ color: t.colors.foreground }}>
                    <span style={{ color: t.colors.magenta }}>app.ts</span>
                    <span style={{ color: t.colors.yellow }}> 3.4kb</span>
                  </div>
                  <div style={{ color: t.colors.red }}>✗ error</div>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--text-primary)',
                    textAlign: 'center',
                    fontWeight: selected ? 600 : 500,
                  }}
                >
                  {t.name}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <SectionHeader
        title="Terminal font"
        subtitle="Size and family for PTY rendering"
        actions={
          fontSize !== DEFAULT_FONT_SIZE || fontFamily !== MONO_FONT ? (
            <Button variant="ghost" size="sm" onClick={resetFont}>
              Reset
            </Button>
          ) : undefined
        }
      />
      <Card padding={18} style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ minWidth: 240, flex: 1 }}>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
              Size: <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{fontSize}px</span>
            </label>
            <input
              type="range"
              min={10}
              max={24}
              step={1}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              <span>10</span>
              <span>24</span>
            </div>
          </div>
          <div style={{ minWidth: 240, flex: 1 }}>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
              Family
            </label>
            <select
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 8,
                fontSize: 13,
                border: '1px solid var(--border)',
                background: 'var(--surface-alt)',
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {FONT_FAMILIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div
          style={{
            marginTop: 14,
            padding: '12px 16px',
            borderRadius: 10,
            background: 'var(--surface-alt)',
            fontFamily: fontFamily,
            fontSize: fontSize,
            color: 'var(--text-primary)',
            lineHeight: 1.5,
          }}
        >
          ABCDE fghij 01234 ~!@#$% — The quick brown fox
        </div>
      </Card>

      <SectionHeader title="Image paste" subtitle="Clipboard image handling in the terminal" />
      <Card padding={18} style={{ marginBottom: 28 }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
            Allowed image types
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {IMAGE_TYPE_OPTIONS.map((opt) => (
              <div
                key={opt.mime}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  background: 'var(--surface-alt)',
                  borderRadius: 8,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                    {opt.desc}
                  </div>
                </div>
                <IOSToggle
                  checked={pasteImageTypes.includes(opt.mime)}
                  onChange={(v) => toggleImageType(opt.mime, v)}
                  ariaLabel={`Toggle ${opt.label} paste`}
                />
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '10px 12px',
            background: 'var(--surface-alt)',
            borderRadius: 8,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
              Max image size
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
              Larger images are rejected
            </div>
          </div>
          <input
            type="number"
            min={1}
            max={20}
            value={pasteImageMaxSizeMB}
            onChange={(e) =>
              setPasteImageMaxSizeMB(Math.max(1, Math.min(20, Number(e.target.value))))
            }
            style={{
              width: 72,
              padding: '6px 10px',
              borderRadius: 6,
              fontSize: 13,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text-primary)',
              fontFamily: MONO_FONT,
              textAlign: 'center',
              outline: 'none',
            }}
          />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>MB</span>
        </div>
      </Card>

      <SectionHeader title="Connection tokens" />
      <Card padding={18} style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
              Token management moved to Agents
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, maxWidth: 480 }}>
              Create, rotate, and revoke tokens from the Agents page — along with server public key
              and registered machine fingerprints.
            </div>
          </div>
          <Button variant="secondary" icon={Icons.Key} onClick={() => onNavigate('agents')}>
            Open Agents
          </Button>
        </div>
      </Card>

      <div
        style={{
          paddingTop: 24,
          borderTop: '1px solid var(--border)',
          textAlign: 'center',
          fontSize: 12,
          color: 'var(--text-muted)',
          fontFamily: MONO_FONT,
        }}
      >
        RemoteTTYs {__APP_VERSION__}
      </div>
    </Page>
  );
}
