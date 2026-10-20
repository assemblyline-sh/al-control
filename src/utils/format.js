/**
 * Shared formatting helpers for CLI output.
 * Structured text readable by both humans and LLMs.
 */

/**
 * Format a header line with right-aligned status.
 * "Work Record: abc123                    Completed"
 */
export function formatHeader(label, id, status) {
  const left = `${label}: ${id}`;
  if (!status) return left;
  const min_gap = 4;
  const width = Math.max(left.length + min_gap + status.length, 60);
  return left + ' '.repeat(width - left.length - status.length) + status;
}

/**
 * Format a label: value field with aligned label.
 * "Name:      Monthly Debt & Equity Monitoring"
 */
export function formatField(label, value, label_width = 0) {
  const padded = (label + ':').padEnd(label_width || label.length + 1);
  return `${padded}  ${value ?? '—'}`;
}

/**
 * Format a table with dynamic column widths.
 * @param {string[]} headers - Column header names
 * @param {string[][]} rows - Array of row arrays (strings)
 * @returns {string} Formatted table string
 */
export function formatTable(headers, rows) {
  if (rows.length === 0) {
    return headers.join('  ') + '\n(none)';
  }

  // Calculate column widths
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => (r[i] || '').length))
  );

  const header_line = headers.map((h, i) => h.padEnd(widths[i])).join('  ');
  const separator = '-'.repeat(header_line.length);
  const data_lines = rows.map(row =>
    row.map((cell, i) => (cell || '—').padEnd(widths[i])).join('  ')
  );

  return [header_line, separator, ...data_lines].join('\n');
}

/**
 * Format a section divider.
 * "--- Title ---"
 */
export function formatSection(title) {
  return `\n--- ${title} ---\n`;
}

/** The zone timestamps render in. Resolved once, so a long listing cannot straddle a DST change mid-table. */
const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * Short zone label, e.g. "PDT" or "Asia/Calcutta". Computed once — it labels a
 * header, not a value.
 *
 * `timeZoneName: 'short'` only yields a real abbreviation for zones ICU has one
 * for; elsewhere it returns "GMT+5:30", which is correct but noisy in a column
 * header and tells you less than the zone's own name. So: take the abbreviation
 * when it is one, otherwise use the IANA name.
 */
const LOCAL_TZ_LABEL = (() => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(new Date());
  const short = parts.find((p) => p.type === 'timeZoneName')?.value;
  if (short && !/^(GMT|UTC)[+-]/.test(short)) return short;
  return LOCAL_TZ || short || 'local';
})();

/**
 * Short name of the local zone, e.g. "PDT" or "Asia/Calcutta".
 *
 * Use it to name the zone ONCE per table or detail block — in the column header
 * (`STARTED (${localTzLabel()})`) or a section heading — never per row.
 */
export function localTzLabel() {
  return LOCAL_TZ_LABEL;
}

/**
 * Format an ISO timestamp in the operator's local timezone: "2026-03-15 15:53:01".
 *
 * **Local, not UTC.** This used to print `toISOString()` verbatim, so an
 * operator in IST read every timestamp 5.5 hours early with nothing on screen
 * saying so — and everything a factory CLI is compared against (`pm2 logs`, file
 * mtimes, `al-orc` output) is local. Kept identical to al-orc's helper so the
 * two CLIs never disagree about the same instant.
 *
 * Pair with `localTzLabel()` in the surrounding header so the zone is stated
 * once. sv-SE is used because its locale format is already `YYYY-MM-DD HH:MM:SS`.
 */
export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('sv-SE', { timeZone: LOCAL_TZ }).replace(',', '');
}

/**
 * Wall-clock time only, for append-style feeds where the date is implied by the
 * session: "15:53:01".
 *
 * Accepts an ISO string or a `Date` (`al-control workpieces watch` stamps
 * `new Date()` as each event arrives).
 *
 * @param {string|Date|null|undefined} iso
 */
export function formatTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('sv-SE', { timeZone: LOCAL_TZ });
}

/**
 * Format duration between two ISO timestamps.
 * "1m" / "2h 15m" / "3d 4h"
 */
export function formatDuration(start, end) {
  if (!start || !end) return '—';
  const ms = new Date(end) - new Date(start);
  if (ms < 0) return '—';

  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remaining_minutes = minutes % 60;
  if (hours < 24) {
    return remaining_minutes > 0 ? `${hours}h ${remaining_minutes}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remaining_hours = hours % 24;
  return remaining_hours > 0 ? `${days}d ${remaining_hours}h` : `${days}d`;
}

/**
 * Format an elapsed duration in ms: "850ms" / "4.2s" / "3m 12s" / "1h 5m".
 * @param {number} ms
 */
export function formatElapsed(ms) {
  const secs = ms / 1000;
  if (secs < 1) return `${ms}ms`;
  if (secs < 60) return `${secs.toFixed(secs < 10 ? 1 : 0)}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}
