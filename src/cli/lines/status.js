import { formatTable, formatHeader, formatField } from '../../utils/format.js';
import { summarizeLine, LIVE_BINS } from '../../utils/line-state.js';
import { loadLines } from '../../utils/factory-data.js';
import { watchRender, DEFAULT_WATCH_INTERVAL_SECS } from '../../utils/watch-render.js';

/**
 * `al-control lines status [line] -f <factory>` — live bin state.
 *
 * No line: per-line IN-FLIGHT / STUCK / FINISHED / HEALTH summary. With a
 * line: station × live-bin table; `done` shown in parens and excluded from
 * totals (a receipt of a forward move, not a position).
 *
 * `--watch [--interval=N]` re-renders in place; exclusive with `--json`.
 *
 * @param {{line?: string, json?: boolean, watch?: boolean, interval?: number}} argv
 * @param {import('../../config.js').FactoryContext} factory
 */
export async function statusLineHandler(argv, factory) {
  const { line: line_arg, json, watch, interval } = argv;
  if (watch && json) {
    console.error('--watch and --json are mutually exclusive (watch is a TTY redraw; json is a one-shot snapshot).');
    process.exit(1);
  }
  const interval_secs = typeof interval === 'number' ? interval : DEFAULT_WATCH_INTERVAL_SECS;

  const renderOnce = () => {
    const { lines } = loadLines(factory);

    if (Object.keys(lines).length === 0) {
      if (json) console.log(JSON.stringify({}, null, 2));
      else console.log(`No lines in ${factory.name}/.orchestrator/stations/. Run "al-orc stations pull --all" in the factory repo.`);
      return;
    }

    if (!line_arg) {
      renderLineSummary(lines, json);
      return;
    }

    const ls = lines[line_arg];
    if (!ls) {
      const msg = `Line "${line_arg}" not found. Available: ${Object.keys(lines).sort().join(', ')}`;
      // In watch mode the line may appear later, so surface and retry.
      if (watch) {
        console.log(msg);
        return;
      }
      console.error(msg);
      process.exit(1);
    }
    renderLineDrilldown(ls, json, factory);
  };

  if (watch) {
    await watchRender({ render: renderOnce, interval_secs });
    return;
  }
  renderOnce();
}

function renderLineSummary(lines, json) {
  const summaries = {};
  for (const ls of Object.values(lines)) summaries[ls.code] = summarizeLine(ls);

  if (json) {
    console.log(JSON.stringify(summaries, null, 2));
    return;
  }

  const rows = Object.keys(summaries).sort().map((code) => {
    const s = summaries[code];
    let health;
    if (s.stuck > 0) health = `⚠ ${s.stuck_locations.join(', ')}`;
    else if (s.in_flight === 0 && s.finished === 0) health = 'idle';
    else if (s.in_flight === 0) health = `${s.finished} finished, drained`;
    else health = `flowing, biggest at ${s.biggest_flow.at}`;
    return [code, String(s.in_flight), String(s.stuck), String(s.finished), health];
  });
  console.log(formatTable(['LINE', 'IN-FLIGHT', 'STUCK', 'FINISHED', 'HEALTH'], rows));
}

function renderLineDrilldown(ls, json, factory) {
  if (json) {
    const out = { code: ls.code, terminal: ls.terminal, stations: {} };
    for (const station of ls.stations) {
      out.stations[station] = {};
      for (const bin of [...LIVE_BINS, 'done']) {
        const map = ls.bins[station][bin];
        out.stations[station][bin] = map ? [...map.keys()].sort() : null;
      }
    }
    out.summary = summarizeLine(ls);
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  console.log(formatHeader('Line', ls.code));
  console.log(formatField('Stations', ls.stations.join(' → '), 12));
  console.log(formatField('Terminal', ls.terminal, 12));
  console.log('');

  const cell = (map) => (map === null ? '—' : String(map.size));
  const rows = ls.stations.map((station) => {
    const b = ls.bins[station];
    return [station, cell(b.input), cell(b.doing), cell(b.output), cell(b.failed), b.done === null ? '—' : `(${b.done.size})`];
  });

  const totals = { input: 0, doing: 0, output: 0, failed: 0 };
  for (const station of ls.stations) {
    for (const bin of LIVE_BINS) {
      const map = ls.bins[station][bin];
      if (map) totals[bin] += map.size;
    }
  }
  rows.push(['live', String(totals.input), String(totals.doing), String(totals.output), String(totals.failed), '']);

  console.log(formatTable(['STATION', 'INPUT', 'DOING', 'OUTPUT', 'FAILED', '(DONE)'], rows));
  console.log('');
  console.log('`(done)` shown in parens for audit; excluded from live totals.');
  console.log(`Run \`al-control workpieces list --line ${ls.code} ${factory.flags}\` for per-workpiece positions.`);
}
