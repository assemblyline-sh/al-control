/**
 * Line state — client-side model over what the probe read from a factory.
 *
 * The probe returns raw station defs and bin listings (plain JSON). This
 * module turns them into per-line state and answers:
 *   - which lines exist and their station order
 *   - how many workpieces sit in each bin of each station
 *   - where a given workpiece is right now (most-advanced live bin)
 *
 * Mental model (see fde-handbook/patterns/structural/assembly-line-processing.md):
 *   - Live bins (workpiece's current location): input | doing | output | failed
 *   - Archive bin (receipt of a successful forward move): done — NOT a position
 *   - Position rule: walk stations terminal → source; at each, check
 *     output > doing > input > failed; first match wins. done ignored.
 *
 * Station order, terminal and summaries come from ../probe.js (one copy, shared
 * with control-room); this module adds the Map view and workpiece positions.
 */

import {
  ALL_BINS,
  LIVE_BINS,
  codeOf,
  indexStationsByRef,
  dependencyRef,
  resolveStationRef,
  topoSortStations,
  computeTerminal,
  groupLines,
  summarizeCounts,
} from '../probe.js';

export { ALL_BINS, LIVE_BINS, codeOf, indexStationsByRef, dependencyRef, resolveStationRef, topoSortStations, computeTerminal };

const LIVE_PRIORITY = ['output', 'doing', 'input', 'failed']; // most-advanced first

/**
 * @typedef {import('../probe.js').StationDef} StationDef
 */

/**
 * @typedef {object} LineState
 * @property {string} code - line code (e.g. 'VM')
 * @property {string[]} stations - Station codes in dependency order
 * @property {string} terminal - Sink station of the line
 * @property {Object<string, Object<string, Map<string, string>|null>>} bins -
 *   bins[station][bin] is a Map of workpiece_id → path relative to the bin
 *   (e.g. 'hi-1', or 'invoices/hi-1__NT-...' under a sub-bin), or null if the
 *   bin directory does not exist.
 */

/**
 * @typedef {object} Position
 * @property {string} line
 * @property {string} station
 * @property {string} bin
 * @property {string} subpath - path relative to the bin
 * @property {boolean} terminal - true if station is the line's terminal
 * @property {boolean} [anomaly] - true when only present in done (not live)
 */

/**
 * Build per-line state from a probe `state` result.
 * @param {{stations: StationDef[], bins: Object<string, Object<string, Object<string, string>|null>>}} state
 * @returns {Object<string, LineState>} keyed by line code
 */
export function buildLineState(state) {
  const lines = {};
  for (const [line_code, line] of Object.entries(groupLines(state.stations))) {
    const bins = {};
    for (const station of line.stations) {
      bins[station] = {};
      for (const bin of ALL_BINS) {
        const listing = state.bins[station]?.[bin];
        bins[station][bin] = listing ? new Map(Object.entries(listing)) : null;
      }
    }
    lines[line_code] = { code: line_code, stations: line.stations, terminal: line.terminal, bins };
  }
  return lines;
}

/**
 * A workpiece's live position: every line terminal → source, output → doing →
 * input → failed; first match wins. Falls back to a done-only anomaly.
 * @param {string} workpiece_id
 * @param {Object<string, LineState>} lines
 * @returns {Position|null}
 */
export function resolvePosition(workpiece_id, lines) {
  for (const line of Object.values(lines)) {
    for (let i = line.stations.length - 1; i >= 0; i--) {
      const station = line.stations[i];
      for (const bin of LIVE_PRIORITY) {
        const map = line.bins[station][bin];
        if (map?.has(workpiece_id)) {
          return { line: line.code, station, bin, subpath: map.get(workpiece_id), terminal: station === line.terminal };
        }
      }
    }
  }
  for (const line of Object.values(lines)) {
    for (let i = line.stations.length - 1; i >= 0; i--) {
      const station = line.stations[i];
      const map = line.bins[station].done;
      if (map?.has(workpiece_id)) {
        return { line: line.code, station, bin: 'done', subpath: map.get(workpiece_id), terminal: station === line.terminal, anomaly: true };
      }
    }
  }
  return null;
}

/**
 * Every workpiece id containing `query`, each resolved to its position.
 * @param {string} query
 * @param {Object<string, LineState>} lines
 * @returns {Map<string, Position>}
 */
export function findWorkpieceMatches(query, lines) {
  const ids = new Set();
  for (const line of Object.values(lines)) {
    for (const station of line.stations) {
      for (const bin of ALL_BINS) {
        const map = line.bins[station][bin];
        if (!map) continue;
        for (const id of map.keys()) if (id.includes(query)) ids.add(id);
      }
    }
  }
  const matches = new Map();
  for (const id of ids) {
    const pos = resolvePosition(id, lines);
    if (pos) matches.set(id, pos);
  }
  return matches;
}

/**
 * Resolve a user-typed id: an exact id wins, else a substring matching
 * exactly one workpiece.
 * @param {string} query
 * @param {Object<string, LineState>} lines
 * @returns {{id: string, pos: Position} | {ambiguous: string[]} | null}
 */
export function resolveWorkpieceQuery(query, lines) {
  const matches = findWorkpieceMatches(query, lines);
  if (matches.has(query)) return { id: query, pos: matches.get(query) };
  if (matches.size > 1) return { ambiguous: [...matches.keys()].sort() };
  const [only] = matches;
  return only ? { id: only[0], pos: only[1] } : null;
}

/**
 * Every workpiece id in a bin spec: `STATION/BIN` or `STATION/BIN/SUBPATH`.
 * @param {string} bin_spec
 * @param {Object<string, LineState>} lines
 * @returns {{ok: true, ids: string[]} | {ok: false, error: string}}
 */
export function collectIdsForBin(bin_spec, lines) {
  const m = bin_spec.match(/^([^/]+)\/(input|doing|output|done|failed)(?:\/(.+))?$/);
  if (!m) {
    return {
      ok: false,
      error: `Invalid bin spec "${bin_spec}". Use STATION/BIN or STATION/BIN/SUBPATH (e.g. AP3b/failed, HI3/output/invoices).`,
    };
  }
  const [, station, bin, subpath_filter] = m;
  const line_found = Object.values(lines).find((line) => line.stations.includes(station));
  if (!line_found) return { ok: false, error: `Station "${station}" not found.` };
  const map = line_found.bins[station][bin];
  if (!map) return { ok: true, ids: [] };
  if (!subpath_filter) return { ok: true, ids: [...map.keys()] };
  const filter_prefix = subpath_filter.replace(/\/+$/, '') + '/';
  const ids = [];
  for (const [id, sub] of map) {
    if (sub === subpath_filter || sub.startsWith(filter_prefix)) ids.push(id);
  }
  return { ok: true, ids };
}

/**
 * Every workpiece id on a line, across all bins.
 * @param {LineState} line
 * @returns {string[]}
 */
export function idsOnLine(line) {
  const set = new Set();
  for (const station of line.stations) {
    for (const bin of ALL_BINS) {
      const map = line.bins[station][bin];
      if (map) for (const id of map.keys()) set.add(id);
    }
  }
  return [...set];
}

/**
 * Workpiece dir relative to temp/stations/ — the form the probe's `logs`
 * query takes.
 * @param {Position} pos
 * @param {string} workpiece_id
 */
export function workpieceRelDir(pos, workpiece_id) {
  return `${pos.station}/${pos.bin}/${pos.subpath || workpiece_id}`;
}

/**
 * Per-line totals from live bins only (`done` ignored).
 * - in_flight = input + doing + output, excluding terminal output
 * - stuck     = failed across the line
 * - finished  = terminal-station output
 * @param {LineState} line
 */
export function summarizeLine(line) {
  const counts = {};
  for (const station of line.stations) {
    counts[station] = {};
    for (const bin of LIVE_BINS) {
      const map = line.bins[station][bin];
      counts[station][bin] = map ? map.size : null;
    }
  }
  return summarizeCounts(line, counts);
}
