import type { CSSProperties, ReactNode, ButtonHTMLAttributes, MouseEvent } from 'react';
import { useMemo, useState } from 'react';
import { ACTION_CATEGORIES, ACTION_LABELS, CATEGORY_COLORS } from '../lib/audit';

// --- StatusDot ---

export function StatusDot({ online, size = 8 }: { online: boolean; size?: number }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: online ? 'var(--online)' : 'var(--text-muted)',
        flexShrink: 0,
        boxShadow: online ? '0 0 0 3px var(--online-soft)' : 'none',
      }}
    />
  );
}

// --- Sparkline (drawIn animation opt-in via animate prop) ---

interface SparklineProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
  fill?: boolean;
  strokeWidth?: number;
}

export function Sparkline({
  data,
  color = 'var(--accent)',
  width = 120,
  height = 28,
  fill = true,
  strokeWidth = 1.5,
}: SparklineProps) {
  if (!data.length) return <svg width={width} height={height} />;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => {
    const x = data.length === 1 ? width / 2 : (i / (data.length - 1)) * width;
    const y = height - (v / max) * (height - 2) - 1;
    return [x, y] as const;
  });
  const d = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const dFill = `${d} L${width},${height} L0,${height} Z`;
  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      {fill && <path d={dFill} fill={color} fillOpacity="0.12" stroke="none" />}
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// --- Donut ---

interface DonutProps {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: ReactNode;
}

export function Donut({
  value,
  size = 44,
  stroke = 4,
  color = 'var(--accent)',
  track = 'var(--surface-alt)',
  children,
}: DonutProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (Math.min(100, Math.max(0, value)) / 100) * c;
  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={off}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <div style={{ position: 'absolute', fontSize: 10, fontWeight: 600, fontFamily: 'var(--mono-font, "JetBrains Mono Variable", monospace)' }}>
        {children ?? `${value}%`}
      </div>
    </div>
  );
}

// --- Button ---

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ComponentType<{ size?: number }>;
  children?: ReactNode;
}

export function Button({ variant = 'secondary', size = 'md', icon: Icon, children, style, onMouseEnter, onMouseLeave, ...rest }: ButtonProps) {
  const pad = { sm: '5px 10px', md: '7px 14px', lg: '9px 18px' }[size];
  const fs = { sm: 12, md: 13, lg: 14 }[size];

  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: pad,
    fontSize: fs,
    borderRadius: 'var(--radius)',
    fontWeight: 500,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    cursor: rest.disabled ? 'not-allowed' : 'pointer',
    opacity: rest.disabled ? 0.5 : 1,
    border: 'none',
    fontFamily: 'inherit',
  };

  const styles: Record<ButtonVariant, CSSProperties> = {
    primary: { ...base, background: 'var(--accent)', color: 'var(--accent-text)' },
    secondary: { ...base, background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border)' },
    ghost: { ...base, background: 'transparent', color: 'var(--text-secondary)' },
    danger: { ...base, background: 'transparent', color: 'var(--error)', border: '1px solid var(--border)' },
    soft: { ...base, background: 'var(--surface-alt)', color: 'var(--text-primary)' },
  };

  function handleEnter(e: MouseEvent<HTMLButtonElement>) {
    if (rest.disabled) return;
    const el = e.currentTarget;
    if (variant === 'primary') el.style.background = 'var(--accent-hover)';
    else if (variant === 'secondary' || variant === 'ghost') el.style.background = 'var(--surface-alt)';
    else if (variant === 'danger') el.style.background = 'var(--error-soft)';
    else if (variant === 'soft') el.style.background = 'var(--surface-active)';
    onMouseEnter?.(e);
  }
  function handleLeave(e: MouseEvent<HTMLButtonElement>) {
    const el = e.currentTarget;
    if (variant === 'primary') el.style.background = 'var(--accent)';
    else if (variant === 'secondary' || variant === 'ghost' || variant === 'danger') el.style.background = 'transparent';
    else if (variant === 'soft') el.style.background = 'var(--surface-alt)';
    onMouseLeave?.(e);
  }

  return (
    <button
      style={{ ...styles[variant], ...style }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      {...rest}
    >
      {Icon && <Icon size={14} />}
      {children}
    </button>
  );
}

// --- Chip / Pill ---

export type ChipTone = 'neutral' | 'accent' | 'online' | 'warning' | 'error' | 'outline';

interface ChipProps {
  tone?: ChipTone;
  size?: 'sm' | 'md';
  icon?: React.ComponentType<{ size?: number }>;
  children?: ReactNode;
  style?: CSSProperties;
}

export function Chip({ tone = 'neutral', size = 'md', icon: Icon, children, style }: ChipProps) {
  const tones: Record<ChipTone, { bg: string; fg: string; bd: string }> = {
    neutral: { bg: 'var(--surface-alt)', fg: 'var(--text-secondary)', bd: 'transparent' },
    accent: { bg: 'var(--accent-soft)', fg: 'var(--accent)', bd: 'transparent' },
    online: { bg: 'var(--online-soft)', fg: 'var(--online)', bd: 'transparent' },
    warning: { bg: 'var(--warning-soft)', fg: 'var(--warning)', bd: 'transparent' },
    error: { bg: 'var(--error-soft)', fg: 'var(--error)', bd: 'transparent' },
    outline: { bg: 'transparent', fg: 'var(--text-secondary)', bd: 'var(--border)' },
  };
  const t = tones[tone];
  const sz = size === 'sm' ? { fs: 10.5, pad: '2px 7px', gap: 4, bd: 6 } : { fs: 11.5, pad: '3px 9px', gap: 5, bd: 6 };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: sz.gap,
        padding: sz.pad,
        fontSize: sz.fs,
        fontWeight: 500,
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.bd}`,
        borderRadius: sz.bd,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {Icon && <Icon size={11} />}
      {children}
    </span>
  );
}

// --- Kbd ---

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 18,
        height: 18,
        padding: '0 5px',
        fontSize: 10.5,
        fontFamily: '"JetBrains Mono Variable", monospace',
        fontWeight: 500,
        background: 'var(--surface-alt)',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border)',
        borderBottomWidth: 2,
        borderRadius: 4,
        lineHeight: 1,
      }}
    >
      {children}
    </kbd>
  );
}

// --- OS helpers ---

export type OsKind = 'darwin' | 'linux' | 'windows' | string;

export function getOsLabel(os: string): string {
  if (os === 'darwin') return 'macOS';
  if (os === 'linux') return 'Linux';
  if (os === 'windows') return 'Windows';
  return os;
}

export function getOsGlyph(os: string): string {
  if (os === 'darwin') return '⌘';
  if (os === 'windows') return '⊞';
  return '🐧';
}

export function OsBadge({ os, size = 14 }: { os: OsKind; size?: number }) {
  const map: Record<string, { char: string; color: string }> = {
    darwin: { char: '⌘', color: 'var(--text-primary)' },
    linux: { char: '🐧', color: 'var(--warning)' },
    windows: { char: '⊞', color: 'var(--term-blue, #6B9FDC)' },
  };
  const m = map[os] || map.linux;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size + 8,
        height: size + 8,
        borderRadius: 6,
        fontSize: size,
        lineHeight: 1,
        background: 'var(--surface-alt)',
        color: m.color,
        fontWeight: 500,
        fontFamily: '"JetBrains Mono Variable", monospace',
      }}
    >
      {m.char}
    </span>
  );
}

// --- ShortId ---

export function ShortId({ value, chars = 7 }: { value: string; chars?: number }) {
  return (
    <span className="mono" style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
      {String(value).slice(0, chars)}…
    </span>
  );
}

// --- Segmented control ---

interface SegmentedOption<T> {
  label: string;
  value: T;
}

interface SegmentedProps<T extends string | number> {
  value: T;
  onChange: (v: T) => void;
  options: SegmentedOption<T>[];
}

export function Segmented<T extends string | number>({ value, onChange, options }: SegmentedProps<T>) {
  return (
    <div
      style={{
        display: 'inline-flex',
        padding: 3,
        gap: 2,
        background: 'var(--surface-alt)',
        borderRadius: 8,
      }}
    >
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              padding: '5px 12px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              background: active ? 'var(--surface)' : 'transparent',
              color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: active ? 'var(--shadow-sm)' : 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// --- SectionHeader ---

export function SectionHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14, gap: 12 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8 }}>{actions}</div>}
    </div>
  );
}

// --- Page wrapper with scroll ---

export function Page({
  title,
  subtitle,
  actions,
  children,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg)' }}>
      {(title || actions) && (
        <div style={{ padding: '28px 40px 0', maxWidth: 1180, margin: '0 auto', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16 }}>
            <div>
              {title && <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>{title}</h1>}
              {subtitle && <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginTop: 4 }}>{subtitle}</div>}
            </div>
            {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>{actions}</div>}
          </div>
        </div>
      )}
      <div style={{ padding: '0 40px 40px', maxWidth: 1180, margin: '0 auto', width: '100%' }}>
        {children}
      </div>
    </div>
  );
}

// --- Card ---

export function Card({
  children,
  padding = 20,
  style,
  onClick,
}: {
  children?: ReactNode;
  padding?: number | string;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding,
        boxShadow: 'var(--shadow-sm)',
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// --- iOS-style Toggle ---

export function IOSToggle({
  checked,
  onChange,
  disabled,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        position: 'relative',
        width: 40,
        height: 24,
        borderRadius: 999,
        background: checked ? 'var(--accent)' : 'var(--surface-active)',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background-color 0.15s ease',
        opacity: disabled ? 0.5 : 1,
        padding: 0,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 18 : 2,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: '#FFFFFF',
          boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
          transition: 'left 0.15s ease',
        }}
      />
    </button>
  );
}

// --- Password strength indicator (4 segments) ---

export function scorePassword(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(4, score);
}

export function PasswordStrength({ password }: { password: string }) {
  const score = useMemo(() => scorePassword(password), [password]);
  const labels = ['Too short', 'Weak', 'OK', 'Good', 'Strong'];
  const colors = ['var(--border)', 'var(--error)', 'var(--warning)', 'var(--online)', 'var(--accent)'];
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              background: i < score ? colors[score] : 'var(--surface-alt)',
              transition: 'background-color 0.15s ease',
            }}
          />
        ))}
      </div>
      {password && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{labels[score]}</div>
      )}
    </div>
  );
}

// --- Icon button (square, used in toolbars / top bars) ---

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size'> {
  size?: number;
  tone?: 'default' | 'muted' | 'danger';
}

export function IconButton({ size = 30, tone = 'default', children, style, onMouseEnter, onMouseLeave, ...rest }: IconButtonProps) {
  // Tones differ on default vs hover color:
  //   default: secondary → primary on hover
  //   muted:   muted     → primary on hover
  //   danger:  secondary → error  on hover  (progressive red; avoids always-red UI)
  const color = tone === 'muted' ? 'var(--text-muted)' : 'var(--text-secondary)';
  const hoverColor = tone === 'danger' ? 'var(--error)' : 'var(--text-primary)';
  return (
    <button
      type="button"
      {...rest}
      onMouseEnter={(e) => {
        if (!rest.disabled) {
          e.currentTarget.style.background = 'var(--surface-alt)';
          e.currentTarget.style.color = hoverColor;
        }
        onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = color;
        onMouseLeave?.(e);
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: 6,
        background: 'transparent',
        border: 'none',
        color,
        cursor: rest.disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
        padding: 0,
        flexShrink: 0,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// --- ActionBadge (audit log + dashboard recent activity) ---

export function ActionBadge({ action, minWidth = 0 }: { action: string; minWidth?: number }) {
  const category = ACTION_CATEGORIES[action] ?? 'session';
  const colors = CATEGORY_COLORS[category];
  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: 5,
        fontSize: 11,
        fontWeight: 500,
        background: colors.bg,
        color: colors.fg,
        fontFamily: '"JetBrains Mono Variable", monospace',
        flexShrink: 0,
        minWidth,
        textAlign: 'center',
      }}
    >
      {ACTION_LABELS[action] ?? action}
    </span>
  );
}

// --- CopyButton (used for tokens, keys, commands) ---

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
    >
      {copied ? 'Copied' : label}
    </Button>
  );
}
