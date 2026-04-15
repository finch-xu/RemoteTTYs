import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, X, RefreshCw } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useTheme } from '../hooks/useTheme';
import { UI_FONT, MONO_FONT } from '../lib/theme';
import type { UITheme } from '../lib/theme';
import {
  ACTION_LABELS,
  ACTION_CATEGORIES,
  ACTIONS_BY_CATEGORY,
  CATEGORY_LABELS,
  getCategoryColors,
  formatDateTime,
} from '../lib/audit';
import type { ActionCategory } from '../lib/audit';

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

function presetBtnStyle(active: boolean, ui: UITheme): React.CSSProperties {
  return {
    padding: '5px 14px', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
    border: `1px solid ${active ? ui.accent : ui.border}`,
    background: active ? `${ui.accent}18` : 'transparent',
    color: active ? ui.accent : ui.textSecondary,
    fontWeight: active ? 600 : 400,
  };
}

export function AuditLogPage({ userRole }: { userRole: string }) {
  const { ui } = useTheme();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [filterKey, setFilterKey] = useState(0); // forces text input remount on clear
  const [cursorStack, setCursorStack] = useState<number[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isAdmin = userRole === 'admin';
  const categoryColors = getCategoryColors(ui);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const fetchLogs = useCallback(async (before?: number, after?: number, isNewQuery = false) => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('limit', String(PAGE_SIZE));
    if (before !== undefined) params.set('before', String(before));
    if (after !== undefined) params.set('after', String(after));
    if (filters.action) params.set('action', filters.action);
    if (filters.user && isAdmin) params.set('user', filters.user);
    if (filters.search) params.set('search', filters.search);

    // Time range from preset
    const preset = TIME_PRESETS.find(p => p.value === filters.timePreset);
    if (preset && preset.ms > 0) {
      params.set('startDate', new Date(Date.now() - preset.ms).toISOString().slice(0, 19).replace('T', ' '));
    }
    if (filters.timePreset === 'custom') {
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
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
  }, [filters, isAdmin]);

  // Initial fetch and on filter change
  useEffect(() => {
    setCursorStack([]);
    fetchLogs(undefined, undefined, true);
  }, [fetchLogs]);

  const handleNextPage = () => {
    if (logs.length === 0 || !hasMore) return;
    setCursorStack(prev => [...prev, logs[0].id]);
    fetchLogs(logs[logs.length - 1].id);
  };

  const handlePrevPage = () => {
    if (cursorStack.length === 0) return;
    const newStack = [...cursorStack];
    const afterId = newStack.pop()!;
    setCursorStack(newStack);
    if (newStack.length === 0) {
      fetchLogs();
    } else {
      fetchLogs(undefined, afterId);
    }
  };

  const updateFilter = (key: keyof Filters, value: string | undefined) => {
    setFilters(prev => {
      const next = { ...prev, [key]: value };
      // Clear custom date fields when switching away from custom preset
      if (key === 'timePreset' && value !== 'custom') {
        delete next.startDate;
        delete next.endDate;
      }
      return next;
    });
  };

  const handleTextFilter = (key: 'user' | 'search', value: string) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateFilter(key, value || undefined);
    }, 300);
  };

  const hasActiveFilters = filters.action || filters.user || filters.search || filters.timePreset !== 'all';

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setFilterKey(k => k + 1); // remount text inputs to clear their DOM value
  };

  const pageStart = cursorStack.length * PAGE_SIZE + 1;
  const pageEnd = pageStart + logs.length - 1;

  return (
    <div style={{ flex: 1, padding: 'clamp(14px, 4vw, 28px)', overflow: 'auto', fontFamily: UI_FONT }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 20px' }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: ui.textPrimary }}>Audit Log</h2>
        <button
          onClick={() => fetchLogs(undefined, undefined, true)}
          disabled={loading}
          title="Refresh"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 6, border: `1px solid ${ui.border}`,
            background: 'transparent', color: ui.textSecondary, cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.5 : 1, transition: 'opacity 0.15s',
          }}
        >
          <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} />
        </button>
      </div>

      {/* Time presets */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {TIME_PRESETS.map(p => (
          <button
            key={p.value}
            onClick={() => updateFilter('timePreset', p.value)}
            style={presetBtnStyle(filters.timePreset === p.value, ui)}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => updateFilter('timePreset', 'custom')}
          style={presetBtnStyle(filters.timePreset === 'custom', ui)}
        >
          Custom
        </button>
      </div>

      {/* Custom date inputs */}
      {filters.timePreset === 'custom' && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: ui.textSecondary }}>
            Start:
            <input
              type="date"
              value={filters.startDate ?? ''}
              onChange={e => updateFilter('startDate', e.target.value || undefined)}
              style={{
                marginLeft: 6, padding: '4px 8px', borderRadius: 6, fontSize: 12,
                border: `1px solid ${ui.border}`, background: ui.surface, color: ui.textPrimary,
                fontFamily: 'inherit',
              }}
            />
          </label>
          <label style={{ fontSize: 12, color: ui.textSecondary }}>
            End:
            <input
              type="date"
              value={filters.endDate ?? ''}
              onChange={e => updateFilter('endDate', e.target.value || undefined)}
              style={{
                marginLeft: 6, padding: '4px 8px', borderRadius: 6, fontSize: 12,
                border: `1px solid ${ui.border}`, background: ui.surface, color: ui.textPrimary,
                fontFamily: 'inherit',
              }}
            />
          </label>
        </div>
      )}

      {/* Filter bar */}
      <div key={filterKey} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <select
          value={filters.action ?? ''}
          onChange={e => updateFilter('action', e.target.value || undefined)}
          style={{
            padding: '6px 10px', borderRadius: 6, fontSize: 12,
            border: `1px solid ${ui.border}`, background: ui.surface, color: ui.textPrimary,
            fontFamily: 'inherit', cursor: 'pointer', minWidth: 150,
          }}
        >
          <option value="">All Actions</option>
          {(Object.keys(ACTIONS_BY_CATEGORY) as ActionCategory[]).map(cat => (
            <optgroup key={cat} label={CATEGORY_LABELS[cat]}>
              {ACTIONS_BY_CATEGORY[cat].map(a => (
                <option key={a} value={a}>{ACTION_LABELS[a] || a}</option>
              ))}
            </optgroup>
          ))}
        </select>

        {isAdmin && (
          <input
            type="text"
            placeholder="Filter by user..."
            defaultValue=""
            onChange={e => handleTextFilter('user', e.target.value)}
            style={{
              padding: '6px 10px', borderRadius: 6, fontSize: 12,
              border: `1px solid ${ui.border}`, background: ui.surface, color: ui.textPrimary,
              fontFamily: 'inherit', width: 140,
            }}
          />
        )}

        <input
          type="text"
          placeholder="Search details..."
          defaultValue=""
          onChange={e => handleTextFilter('search', e.target.value)}
          style={{
            padding: '6px 10px', borderRadius: 6, fontSize: 12,
            border: `1px solid ${ui.border}`, background: ui.surface, color: ui.textPrimary,
            fontFamily: 'inherit', width: 160,
          }}
        />

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '5px 10px', borderRadius: 6, fontSize: 12,
              border: `1px solid ${ui.border}`, background: 'transparent',
              color: ui.textSecondary, fontFamily: 'inherit', cursor: 'pointer',
            }}
          >
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {/* Log list */}
      {loading && logs.length === 0 ? (
        <div style={{ color: ui.textMuted, fontSize: 13, textAlign: 'center', marginTop: 60 }}>
          <div className="spinner" style={{ marginBottom: 8 }} /> Loading...
        </div>
      ) : logs.length === 0 ? (
        <div style={{ color: ui.textMuted, fontSize: 13, textAlign: 'center', marginTop: 60 }}>
          <div style={{ marginBottom: 6 }}>No audit log entries found</div>
          {hasActiveFilters && <div style={{ fontSize: 12 }}>Try adjusting your filters</div>}
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <div style={{
              border: `1px solid ${ui.border}`, borderRadius: 10, overflow: 'hidden',
              opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s', minWidth: 480,
            }}>
            {/* Header */}
            <div style={{
              display: 'flex', gap: 8, padding: '8px 14px',
              background: ui.surfaceAlt, borderBottom: `1px solid ${ui.border}`,
              fontSize: 11, fontWeight: 600, color: ui.textSecondary, textTransform: 'uppercase', letterSpacing: '0.3px',
            }}>
              <span style={{ width: 150 }}>Time</span>
              <span style={{ width: 140 }}>Action</span>
              <span style={{ width: 80 }}>User</span>
              <span style={{ flex: 1 }}>Detail</span>
            </div>

            {/* Rows */}
            {logs.map(log => {
              const category = ACTION_CATEGORIES[log.action] ?? 'session';
              const colors = categoryColors[category];
              return (
                <div
                  key={log.id}
                  style={{
                    display: 'flex', gap: 8, padding: '8px 14px', alignItems: 'center',
                    borderBottom: `1px solid ${ui.border}`, fontSize: 12,
                  }}
                >
                  <span
                    style={{ width: 150, color: ui.textMuted, fontSize: 11, flexShrink: 0, fontFamily: MONO_FONT }}
                  >
                    {formatDateTime(log.ts)}
                  </span>
                  <span style={{ width: 140, flexShrink: 0 }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                      background: colors.bg, color: colors.text,
                      fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap',
                    }}>
                      {ACTION_LABELS[log.action] || log.action}
                    </span>
                  </span>
                  <span style={{
                    width: 80, flexShrink: 0, fontFamily: MONO_FONT, fontSize: 11,
                    color: log.user ? ui.textSecondary : ui.textMuted,
                    fontStyle: log.user ? 'normal' : 'italic',
                  }}>
                    {log.user ?? 'system'}
                  </span>
                  <span
                    style={{
                      flex: 1, color: ui.textSecondary, fontSize: 11,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      fontFamily: MONO_FONT,
                    }}
                    title={log.detail ?? ''}
                  >
                    {log.detail ?? ''}
                  </span>
                </div>
              );
            })}
            </div>
          </div>

          {/* Pagination */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginTop: 12, fontSize: 12, color: ui.textSecondary,
          }}>
            <span>
              Showing {pageStart}-{pageEnd} of {total > 0 ? total : '...'}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={handlePrevPage}
                disabled={cursorStack.length === 0}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '5px 12px', borderRadius: 6, fontSize: 12, fontFamily: 'inherit',
                  border: `1px solid ${ui.border}`, cursor: cursorStack.length === 0 ? 'default' : 'pointer',
                  background: 'transparent',
                  color: cursorStack.length === 0 ? ui.textMuted : ui.textPrimary,
                  opacity: cursorStack.length === 0 ? 0.5 : 1,
                }}
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <button
                onClick={handleNextPage}
                disabled={!hasMore}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '5px 12px', borderRadius: 6, fontSize: 12, fontFamily: 'inherit',
                  border: `1px solid ${ui.border}`, cursor: !hasMore ? 'default' : 'pointer',
                  background: 'transparent',
                  color: !hasMore ? ui.textMuted : ui.textPrimary,
                  opacity: !hasMore ? 0.5 : 1,
                }}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
