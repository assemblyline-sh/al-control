// @ts-check

import { probe } from '../../transport.js';
import { formatTable } from '../../utils/format.js';
import { loadLines } from '../../utils/factory-data.js';

/**
 * `al-control workpieces requeue [id] --bin STATION/failed -f <factory> [--yes]` — move
 * workpieces back to their station's `input` to run that station again. With `--bin`, every
 * workpiece in that station's `failed` bin; with an id, that one workpiece from `failed` or
 * `done`. Dry run unless `--yes`. The probe re-checks each folder, drops its stale
 * `error.json`/`error.txt` and logs a `requeued` event; the station's next run picks it up.
 */

/**
 * @typedef {object} RequeueEntry
 * @property {string} id
 * @property {string} from - `STATION/BIN`
 * @property {string} rel - folder relative to temp/stations/
 */

/**
 * Which workpieces a requeue would move. Throws a user-facing Error when the request can't be
 * met (unknown station, ambiguous id, nothing found).
 *
 * @param {Object<string, import('../../utils/line-state.js').LineState>} lines
 * @param {{id?: string, bin?: string}} argv
 * @returns {RequeueEntry[]}
 */
export function planRequeue(lines, argv) {
  if (argv.bin) {
    const m = argv.bin.match(/^([^/]+)\/failed\/?$/);
    if (!m) throw new Error(`--bin takes STATION/failed (e.g. EX1/failed); to retry a done workpiece, give its id.`);
    const station = m[1];
    const line = Object.values(lines).find((l) => l.stations.includes(station));
    if (!line) throw new Error(`Station "${station}" not found.`);
    const map = line.bins[station].failed;
    return [...(map ?? new Map())].map(([id, sub]) => ({ id, from: `${station}/failed`, rel: `${station}/failed/${sub}` }));
  }

  /** @type {RequeueEntry[]} */
  const all = [];
  for (const line of Object.values(lines)) {
    for (const station of line.stations) {
      for (const bin of ['failed', 'done']) {
        for (const [id, sub] of line.bins[station][bin] ?? new Map()) {
          all.push({ id, from: `${station}/${bin}`, rel: `${station}/${bin}/${sub}` });
        }
      }
    }
  }
  const query = /** @type {string} */ (argv.id);
  const exact = all.filter((e) => e.id === query);
  const ids = exact.length > 0 ? [query] : [...new Set(all.filter((e) => e.id.includes(query)).map((e) => e.id))].sort();
  if (ids.length === 0) throw new Error(`No failed or done workpiece matches "${query}".`);
  if (ids.length > 1) {
    const shown = ids.slice(0, 10);
    throw new Error(`"${query}" matches ${ids.length} workpieces; use the full id:\n  ${shown.join('\n  ')}${ids.length > 10 ? `\n  … +${ids.length - 10} more` : ''}`);
  }
  const copies = all.filter((e) => e.id === ids[0]);
  if (copies.length > 1) {
    throw new Error(`${ids[0]} is in ${copies.map((c) => c.from).join(' and ')}; requeue one bin with --bin STATION/failed.`);
  }
  return copies;
}

/**
 * @param {{id?: string, bin?: string, yes?: boolean}} argv
 * @param {import('../../config.js').FactoryContext} factory
 */
export async function requeueHandler(argv, factory) {
  const { lines } = loadLines(factory);
  let plan;
  try {
    plan = planRequeue(lines, argv);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  const where = `${factory.host.name} / ${factory.name}`;
  if (plan.length === 0) {
    console.log(`Nothing to requeue: ${argv.bin} is empty on ${where}.`);
    return;
  }

  const counts = new Map();
  for (const e of plan) counts.set(e.from, (counts.get(e.from) ?? 0) + 1);
  console.log(formatTable(['FROM', 'TO', 'WORKPIECES'], [...counts].map(([from, n]) => [from, `${from.split('/')[0]}/input`, String(n)])));
  if (plan.length === 1) console.log(`\n${plan[0].id}`);
  console.log('');

  if (!argv.yes) {
    console.log(`Dry run: would requeue ${plan.length} workpiece${plan.length === 1 ? '' : 's'} on ${where}. Re-run with --yes to move.`);
    return;
  }
  const { requeued } = probe(factory.host, { type: 'requeue', path: factory.path, dirs: plan.map((e) => e.rel) });
  console.log(`Requeued ${requeued.length} workpiece${requeued.length === 1 ? '' : 's'} on ${where}. The station's next run picks them up.`);
}
