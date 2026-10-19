import { formatHeader } from '../../utils/format.js';
import { LIVE_BINS } from '../../utils/line-state.js';
import { loadLines } from '../../utils/factory-data.js';
import { watchRender, DEFAULT_WATCH_INTERVAL_SECS } from '../../utils/watch-render.js';

/**
 * `al-control stations status <code> -f <factory>` — one station's bins and
 * the workpieces in each.
 *
 * `--watch [--interval=N]` re-renders in place; exclusive with `--json`.
 *
 * @param {{id: string, json?: boolean, watch?: boolean, interval?: number}} argv
 * @param {import('../../config.js').FactoryContext} factory
 */
export async function statusStationHandler(argv, factory) {
  const { id, json, watch, interval } = argv;
  if (watch && json) {
    console.error('--watch and --json are mutually exclusive (watch is a TTY redraw; json is a one-shot snapshot).');
    process.exit(1);
  }
  const interval_secs = typeof interval === 'number' ? interval : DEFAULT_WATCH_INTERVAL_SECS;

  const renderOnce = () => {
    const { lines } = loadLines(factory);
    const station_line = Object.values(lines).find((ls) => ls.stations.includes(id));
    if (!station_line) {
      // In watch mode the station may appear later, so surface and retry.
      if (watch) {
        console.log(`No station "${id}" on ${factory.name}.`);
        return;
      }
      console.error(`No station "${id}" on ${factory.name}.`);
      console.error(`Pass the station short_code (e.g. VM3). Run \`al-control lines status ${factory.flags}\` to see active lines.`);
      process.exit(1);
    }

    const bins = station_line.bins[id];
    const is_terminal = id === station_line.terminal;

    if (json) {
      const out = { station: id, line: station_line.code, terminal: is_terminal, bins: {} };
      for (const bin of [...LIVE_BINS, 'done']) {
        const map = bins[bin];
        out.bins[bin] = map ? [...map.keys()].sort() : null;
      }
      console.log(JSON.stringify(out, null, 2));
      return;
    }

    console.log(formatHeader('Station', id));
    console.log(`Line:     ${station_line.code}${is_terminal ? '  (terminal)' : ''}`);
    console.log('');

    for (const bin of [...LIVE_BINS, 'done']) {
      const map = bins[bin];
      const label = bin === 'done' ? '(done)' : bin;
      if (map === null) {
        console.log(`${label.padEnd(8)} —`);
        continue;
      }
      const sorted = [...map.keys()].sort();
      console.log(`${label.padEnd(8)} (${sorted.length})`);
      // Show the sub-bin when a workpiece lives under one (invoices/hi-1__...).
      for (const wp_id of sorted) {
        const sub = map.get(wp_id);
        const display = sub && sub !== wp_id ? `${wp_id}  (in ${sub.slice(0, sub.lastIndexOf('/'))}/)` : wp_id;
        console.log(`         ${display}`);
      }
      if (sorted.length === 0) console.log('         —');
      console.log('');
    }
  };

  if (watch) {
    await watchRender({ render: renderOnce, interval_secs });
    return;
  }
  renderOnce();
}
