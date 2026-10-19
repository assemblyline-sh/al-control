import {
  resolvePosition,
  findWorkpieceMatches,
  collectIdsForBin,
  idsOnLine,
  workpieceRelDir,
} from '../../utils/line-state.js';
import { loadLines, loadLogs, workpieceLocation } from '../../utils/factory-data.js';
import { formatTime } from '../../utils/format.js';
import { listWorkpiecesHandler } from './list.js';
import { showWorkpieceHandler } from './show.js';

const DEFAULT_INTERVAL_SECS = 2;

/**
 * `al-control workpieces watch [id | --line | --bin | --match] -f <factory>` —
 * append-style live tail: prints only bin moves and new log events.
 *
 * Renders the matching snapshot first (show for one workpiece, list for a
 * set), then polls. Each tick is two probe calls — state, then the tracked
 * workpieces' logs in one batch.
 *
 * @param {{id?: string, line?: string, bin?: string, match?: string, interval?: number}} argv
 * @param {import('../../config.js').FactoryContext} factory
 */
export async function watchHandler(argv, factory) {
  const { id, line: line_arg, bin: bin_arg, match: match_arg, interval } = argv;
  const interval_secs = typeof interval === 'number' ? interval : DEFAULT_INTERVAL_SECS;
  const { lines } = loadLines(factory);

  if (id) {
    const matches = findWorkpieceMatches(id, lines);
    if (matches.size === 0) {
      console.error(`No workpiece matches "${id}".`);
      process.exit(1);
    }
    if (matches.size === 1 || matches.has(id)) {
      const resolved_id = matches.has(id) ? id : [...matches.keys()][0];
      await showWorkpieceHandler({ id: resolved_id }, factory);
      await watchLoop(factory, [resolved_id], { interval_secs, single: true });
      return;
    }
    await listWorkpiecesHandler({ match: id }, factory);
    await watchLoop(factory, [...matches.keys()], { interval_secs, single: false });
    return;
  }

  let ids;
  if (bin_arg) {
    const result = collectIdsForBin(bin_arg, lines);
    if (!result.ok) {
      console.error(result.error);
      process.exit(1);
    }
    ids = result.ids;
  } else if (match_arg) {
    ids = [...findWorkpieceMatches(match_arg, lines).keys()];
  } else if (line_arg) {
    const ls = lines[line_arg];
    if (!ls) {
      console.error(`Line "${line_arg}" not found. Available: ${Object.keys(lines).sort().join(', ') || '(none)'}`);
      process.exit(1);
    }
    ids = idsOnLine(ls);
  } else {
    console.error(`Usage: al-control workpieces watch <id> | --line <code> | --bin STATION/BIN | --match <substring> ${factory.flags}`);
    process.exit(1);
  }

  if (ids.length === 0) {
    console.log('No workpieces in scope.');
    return;
  }

  await listWorkpiecesHandler({ line: line_arg, bin: bin_arg, match: match_arg }, factory);
  await watchLoop(factory, ids, { interval_secs, single: false });
}

/**
 * Poll a fixed set of workpieces. Multi-workpiece output tags each line with
 * the id; a workpiece reaching terminal output emits `✓ finished` once and
 * stops being followed.
 *
 * @param {import('../../config.js').FactoryContext} factory
 * @param {string[]} ids
 * @param {{interval_secs: number, single: boolean}} opts
 */
async function watchLoop(factory, ids, { interval_secs, single }) {
  process.on('SIGINT', () => { console.log('\nStopped.'); process.exit(0); });
  const label = single ? ids[0] : `${ids.length} workpiece${ids.length === 1 ? '' : 's'}`;
  console.log(`\n--- watching ${label} (interval ${interval_secs}s, Ctrl-C to stop) ---`);

  /** @type {Map<string, {pos_key: string, log_count: number, finished: boolean}>} */
  const state = new Map();

  const snapshot = () => {
    const { root, lines } = loadLines(factory);
    const tracked = ids
      .filter((id) => !state.get(id)?.finished)
      .map((id) => {
        const pos = resolvePosition(id, lines);
        return { id, pos, rel: pos ? workpieceRelDir(pos, id) : null };
      });
    const logs = loadLogs(factory, tracked.filter((t) => t.pos).map((t) => t.rel));
    return { root, tracked, logs };
  };

  const seed = snapshot();
  for (const { id, pos, rel } of seed.tracked) {
    if (!pos) {
      if (single) console.log(`${formatTime(new Date())}  ${id}  not on disk`);
      continue;
    }
    state.set(id, {
      pos_key: `${pos.station}/${pos.bin}`,
      log_count: seed.logs[rel].length,
      finished: !single && pos.bin === 'output' && pos.terminal,
    });
  }
  if (state.size === 0 && single) return;

  const tag = (id) => (single ? '' : `  ${id}`);

  while (true) {
    await new Promise((r) => setTimeout(r, interval_secs * 1000));
    const { root, tracked, logs } = snapshot();

    for (const { id, pos, rel } of tracked) {
      const prev = state.get(id);
      if (!prev) continue;

      if (!pos) {
        console.log(`${formatTime(new Date())}${tag(id)}  no longer on disk`);
        state.delete(id);
        if (single) return;
        continue;
      }

      const pos_key = `${pos.station}/${pos.bin}`;
      const events = logs[rel];
      if (pos_key !== prev.pos_key) {
        console.log(`${formatTime(new Date())}${tag(id)}  → moved from ${prev.pos_key} to ${pos_key}`);
        console.log(`${single ? 'Folder: ' : '                          '}${workpieceLocation(factory, root, rel)}`);
        prev.pos_key = pos_key;
        prev.log_count = events.length;
      } else if (events.length > prev.log_count) {
        for (const e of events.slice(prev.log_count)) {
          console.log(`${formatTime(e.ts)}${tag(id)}  ${single ? e.station.padEnd(3) : e.station}  ${e.event}`);
        }
        prev.log_count = events.length;
      }

      if (!single && pos.bin === 'output' && pos.terminal && !prev.finished) {
        console.log(`${formatTime(new Date())}${tag(id)}  ✓ finished (terminal output)`);
        prev.finished = true;
      }
    }
  }
}
