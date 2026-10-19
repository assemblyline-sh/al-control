/**
 * Factory data — what command handlers read, wherever the factory lives.
 * Each call is one probe round trip (in-process locally, one ssh exec remotely).
 */

import path from 'node:path';

import { probe } from '../transport.js';
import { buildLineState } from './line-state.js';

/**
 * Station + line definitions from the factory's `.orchestrator/`.
 * @param {import('../config.js').FactoryContext} factory
 * @returns {{root: string, stations: import('./line-state.js').StationDef[], lines: Object<string, object>}}
 */
export function loadDefs(factory) {
  return probe(factory.host, { type: 'defs', path: factory.path });
}

/**
 * Live per-line state, plus the station defs it was built from and the
 * orphaned failed folders (no pointer.json) per station.
 * @param {import('../config.js').FactoryContext} factory
 * @returns {{root: string, lines: Object<string, import('./line-state.js').LineState>, stations: import('./line-state.js').StationDef[], orphans: Object<string, Object<string, string>>}}
 */
export function loadLines(factory) {
  const state = probe(factory.host, { type: 'state', path: factory.path });
  return { root: state.root, lines: buildLineState(state), stations: state.stations, orphans: state.orphans ?? {} };
}

/**
 * Parsed log.jsonl per workpiece dir (relative to temp/stations/).
 * @param {import('../config.js').FactoryContext} factory
 * @param {string[]} rel_dirs
 * @returns {Object<string, Array<{ts: string, station: string, event: string}>>}
 */
export function loadLogs(factory, rel_dirs) {
  if (rel_dirs.length === 0) return {};
  return probe(factory.host, { type: 'logs', path: factory.path, dirs: rel_dirs }).logs;
}

/**
 * Live per-line state for each factory. Host-wide (several factories), a factory
 * whose directory is missing is reported on stderr and skipped; asked for by
 * name, it's an error.
 * @param {import('../config.js').FactoryContext[]} factories
 * @returns {Array<{factory: import('../config.js').FactoryContext, root: string, lines: Object<string, import('./line-state.js').LineState>, orphans: Object<string, Object<string, string>>}>}
 */
export function loadLinesEach(factories) {
  const out = [];
  for (const factory of factories) {
    try {
      out.push({ factory, ...loadLines(factory) });
    } catch (err) {
      if (factories.length === 1 || err.code !== 'FACTORY_NOT_FOUND') throw err;
      console.error(`Skipping ${factory.name}: ${err.message}`);
    }
  }
  return out;
}

/**
 * error.json summaries (`failed_at`, `name`, `code`, `message`) per workpiece
 * dir; `null` where there's none.
 * @param {import('../config.js').FactoryContext} factory
 * @param {string[]} rel_dirs
 */
export function loadErrors(factory, rel_dirs) {
  if (rel_dirs.length === 0) return {};
  return probe(factory.host, { type: 'errors', path: factory.path, dirs: rel_dirs }).errors;
}

/**
 * Last activity (ms since epoch) per workpiece dir; `null` if it's gone.
 * @param {import('../config.js').FactoryContext} factory
 * @param {string[]} rel_dirs
 * @returns {Object<string, number|null>}
 */
export function loadAges(factory, rel_dirs) {
  if (rel_dirs.length === 0) return {};
  return probe(factory.host, { type: 'ages', path: factory.path, dirs: rel_dirs }).ages;
}

/**
 * A workpiece folder's files (recursive, with sizes) and its full error.json.
 * @param {import('../config.js').FactoryContext} factory
 * @param {string} rel_dir
 * @returns {{files: Array<{name: string, size: number}>, error: object|null}}
 */
export function loadWorkpieceFiles(factory, rel_dir) {
  return probe(factory.host, { type: 'workpiece', path: factory.path, dir: rel_dir });
}

/**
 * Absolute path of a workpiece folder on its host.
 * @param {string} root - absolute factory root on the host (from the probe)
 * @param {string} rel_dir - workpiece dir relative to temp/stations/
 */
export function workpiecePath(root, rel_dir) {
  return path.posix.join(root, 'temp', 'stations', rel_dir);
}

/**
 * Where a workpiece folder lives: a Cmd-clickable file:// URL locally,
 * `host:/abs/path` (scp-style) on a remote host.
 * @param {import('../config.js').FactoryContext} factory
 * @param {string} root - absolute factory root on the host (from the probe)
 * @param {string} rel_dir - workpiece dir relative to temp/stations/
 */
export function workpieceLocation(factory, root, rel_dir) {
  const abs = workpiecePath(root, rel_dir);
  return factory.host.is_local ? `file://${encodeURI(abs)}` : `${factory.host.ssh}:${abs}`;
}
