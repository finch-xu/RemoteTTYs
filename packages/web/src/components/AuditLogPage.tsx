import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../lib/api';
import { MONO_FONT } from '../lib/theme';
import {
  ACTION_LABELS,
  ACTION_CATEGORIES,
  ACTIONS_BY_CATEGORY,
  CATEGORY_LABELS,
  formatDateTime,
} from '../lib/audit';
import type { ActionCategory } from '../lib/audit';
import { Page, Card, Button, Segmented } from './primitives';
import * as Icons from '../lib/icons';

interface AuditLog {
  id: number;
  ts: string;
  action: string;
  user: string | null;
  detail: string | null;
}

interface AuditResponse {
  logs: AuditLog[];
  hasMore: boolean;
  total: number;
}

interface Filters {
  action?: string;
  user?: string;
  search?: string;
  timePreset: string;
  startDate?: string;
  endDate?: string;
}

const PAGE_SIZE = 50;
const DEFAULT_FILTERS: Filters = { timePreset: 'all' };

const TIME_PRESETS = [
  { label: '1h', value: '1h', ms: 3_600_000 },
  { label: '24h', value: '24h', ms: 86_400_000 },
  { label: '7d', value: '7d', ms: 7 * 86_400_000 },
  { label: 'All', value: 'all', ms: 0 },
];

const CATEGORY_COLORS: Record<ActionCategory, { bg: string; fg: string }> = {
  auth: { bg: 'var(--warning-soft)', fg: 'var(--warning)' },
  user: { bg: 'var(--accent-soft)', fg: 'var(--accent)' },
  agent: { bg: 'var(--online-soft)', fg: 'var(--online)' },
  token: { bg: 'var(--surface-alt)', fg: 'var(--text-secondary)' },
  session: { bg: 'var(--accent-soft)', fg: 'var(--accent)' },
};

function tryParseJSON(s: string | null): object | null {
  if (!s) return null;
  try {
    const parsed = JSON.parse(s);
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function AuditRow({
  log,
  expanded,
  onToggle,
}: {
  log: AuditLog;
  expanded: boolean;
  onToggle: () => void;
}) {
  const category = ACTION_CATEGORIES[log.action] ?? 'session';
  const colors = CATEGORY_COLORS[category];
  const parsed = expanded ? tryParseJSON(log.detail) : null;

  return (
    <div
      style={{
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
      }}
      onClick={onToggle}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '170px 160px 110px 1fr',
          gap: 10,
          padding: '10px 18px',
          alignItems: 'center',
          fontSize: 12.5,
        }}
      >
        <span style={{ color: 'var(--text-muted)', fontSize: 11, fontFamily: MONO_FONT }}>
          {formatDateTime(log.ts)}
        </span>
        <span>
          <span
            style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: 5,
              background: colors.bg,
              color: colors.fg,
              fontSize: 11,
              fontWeight: 500,
              fontFamily: MONO_FONT,
              whiteSpace: 'nowrap',
            }}
          >
            {ACTION_LABELS[log.action] || log.action}
          </span>
        </span>
        <span
          style={{
            fontFamily: MONO_FONT,
            fontSize: 11.5,
            color: log.user ? 'var(--text-secondary)' : 'var(--text-muted)',
            fontStyle: log.user ? 'normal' : 'italic',
          }}
        >
          {log.user ?? 'system'}
        </span>
        <span
          style={{
            color: 'var(--text-secondary)',
            fontSize: 11.5,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontFamily: MONO_FONT,
          }}
          title={log.detail ?? ''}
        >
          {log.detail ?? '—'}
        </span>
      </div>
      {expanded && log.detail && (
        <div
          style={{
            padding: '0 18px 14px',
            fontFamily: MONO_FONT,
            fontSize: 11.5,
            color: 'var(--text-secondary)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <pre
            style={{
              margin: 0,
              padding: '10px 12px',
              background: 'var(--surface-alt)',
              borderRadius: 8,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              lineHeight: 1.5,
              color: 'var(--text-primary)',
            }}
          >
            {parsed ? JSON.stringify(parsed, null, 2) : log.detail}
          </pre>
        </div>
      )}
    </div>
  );
}

export function AuditLogPage({ userRole }: { userRole: string }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [filterKey, setFilterKey] = useState(0);
  const [cursorStack, setCursorStack] = useState<number[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isAdmin = userRole === 'admin';

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const fetchLogs = useCallback(
    async (before?: number, after?: number, isNewQuery = false) => {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      if (before !== undefined) params.set('before', String(before));
      if (after !== undefined) params.set('after', String(after));
      if (filters.action) params.set('action', filters.action);
      if (filters.user && isAdmin) params.set('user', filters.user);
      if (filters.search) params.set('search', filters.search);

      const preset = TIME_PRESETS.find((p) => p.value === filters.timePreset);
      if (preset && preset.ms > 0) {
        params.set(
          'startDate',
          new Date(Date.now() - preset.ms).toISOString().slice(0, 19).replace('T', ' '),
        );
      }

      try {
        const res = await apiFetch(`/api/audit?${params}`);
        if (!res.ok) return;
        const data: AuditResponse = await res.json();
        setLogs(data.logs);
        setHasMore(data.hasMore);
        if (isNewQuery || (before === undefined && after === undefined)) {
          setTotal(data.total);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    },
    [filters, isAdmin],
  );

  useEffect(() => {
    setCursorStack([]);
    fetchLogs(undefined, undefined, true);
  }, [fetchLogs]);

  const handleNextPage = () => {
    if (logs.length === 0 || !hasMore) return;
    setCursorStack((prev) => [...prev, logs[0].id]);
    fetchLogs(logs[logs.length - 1].id);
  };

  const handlePrevPage = () => {
    if (cursorStack.length === 0) return;
    const newStack = [...cursorStack];
    const afterId = newStack.pop()!;
    setCursorStack(newStack);
    if (newStack.length === 0) fetchLogs();
    else fetchLogs(undefined, afterId);
  };

  const updateFilter = (key: keyof Filters, value: string | undefined) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleTextFilter = (key: 'user' | 'search', value: string) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateFilter(key, value || undefined);
    }, 300);
  };

  const hasActiveFilters =
    filters.action || filters.user || filters.search || filters.timePreset !== 'all';

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setFilterKey((k) => k + 1);
  };

  const pageStart = cursorStack.length * PAGE_SIZE + 1;
  const pageEnd = pageStart + logs.length - 1;

  return (
    <Page
      title="Audit log"
      subtitle="Security-relevant events across the relay"
      actions={
        <Button
          variant="ghost"
          size="sm"
          icon={Icons.RefreshCw}
          onClick={() => fetchLogs(undefined, undefined, true)}
          disabled={loading}
        >
          Refresh
        </Button>
      }
    >
      {/* Filter bar */}
      <Card padding={14} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Segmented
            value={filters.timePreset}
            onChange={(v) => updateFilter('timePreset', v)}
            options={TIME_PRESETS.map((p) => ({ label: p.label, value: p.value }))}
          />
          <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px' }} />
          <div key={filterKey} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
            <select
              value={filters.action ?? ''}
              onChange={(e) => updateFilter('action', e.target.value || undefined)}
              style={{
                padding: '7px 10px',
                borderRadius: 8,
                fontSize: 12.5,
                border: '1px solid var(--border)',
                background: 'var(--surface-alt)',
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
                cursor: 'pointer',
                minWidth: 150,
                outline: 'none',
              }}
            >
              <option value="">All actions</option>
              {(Object.keys(ACTIONS_BY_CATEGORY) as ActionCategory[]).map((cat) => (
                <optgroup key={cat} label={CATEGORY_LABELS[cat]}>
                  {ACTIONS_BY_CATEGORY[cat].map((a) => (
                    <option key={a} value={a}>
                      {ACTION_LABELS[a] || a}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {isAdmin && (
              <input
                type="text"
                placeholder="User…"
                defaultValue=""
                onChange={(e) => handleTextFilter('user', e.target.value)}
                style={{
                  padding: '7px 10px',
                  borderRadius: 8,
                  fontSize: 12.5,
                  fontFamily: MONO_FONT,
                  border: '1px solid var(--border)',
                  background: 'var(--surface-alt)',
                  color: 'var(--text-primary)',
                  width: 140,
                  outline: 'none',
                }}
              />
            )}
            <input
              type="text"
              placeholder="Search details…"
              defaultValue=""
              onChange={(e) => handleTextFilter('search', e.target.value)}
              style={{
                padding: '7px 10px',
                borderRadius: 8,
                fontSize: 12.5,
                fontFamily: MONO_FONT,
                border: '1px solid var(--border)',
                background: 'var(--surface-alt)',
                color: 'var(--text-primary)',
                flex: 1,
                minWidth: 180,
                outline: 'none',
              }}
            />
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" icon={Icons.X} onClick={clearFilters}>
                Clear
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Log list */}
      {loading && logs.length === 0 ? (
        <Card padding={40} style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 8px' }} />
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
        </Card>
      ) : logs.length === 0 ? (
        <Card padding={40} style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No audit log entries</div>
          {hasActiveFilters && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              Try adjusting your filters
            </div>
          )}
        </Card>
      ) : (
        <Card padding={0} style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s' }}>
          {/* Header row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '170px 160px 110px 1fr',
              gap: 10,
              padding: '10px 18px',
              background: 'var(--surface-alt)',
              borderBottom: '1px solid var(--border)',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            <span>Time</span>
            <span>Action</span>
            <span>User</span>
            <span>Detail</span>
          </div>

          {logs.map((log) => (
            <AuditRow
              key={log.id}
              log={log}
              expanded={expandedId === log.id}
              onToggle={() => setExpandedId((prev) => (prev === log.id ? null : log.id))}
            />
          ))}
        </Card>
      )}

      {logs.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 12,
            fontSize: 12.5,
            color: 'var(--text-secondary)',
          }}
        >
          <span>
            Showing {pageStart}–{pageEnd} of {total > 0 ? total : '…'}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <Button
              variant="secondary"
              size="sm"
              icon={Icons.ChevronLeft}
              onClick={handlePrevPage}
              disabled={cursorStack.length === 0}
            >
              Prev
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleNextPage}
              disabled={!hasMore}
            >
              Next <Icons.ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}
    </Page>
  );
}
