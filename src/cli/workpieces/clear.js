import { probe } from '../../transport.js';
import { formatTable } from '../../utils/format.js';
import { loadAges, loadLines } from '../../utils/factory-data.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `al-control workpieces clear [id] --bin done|finished -f <factory> [--line]
 * [--station] [--older-than <days>] [--yes]` — delete workpieces from `done`
 * bins, or from the output of each line's terminal station (`finished`).
 * With `id` instead of `--bin`: every done or finished copy of that one
 * workpiece. `--older-than` keeps anything active (folder or log.jsonl
 * modified) within that many days. Prints what it would delete and stops
 * unless `--yes`. Skipped: bins in the factory's config `keep` list, and bins
 * a conveyor (`move_files`) still drains — a terminal output can feed another
 * line. The probe re-checks every folder before deleting (see
 * docs/decisions/0005).
 *
 * @param {{id?: string, bin?: 'done'|'finished', line?: string, station?: string, olderThan?: number, yes?: boolean}} argv
 * @param {import('../../config.js').FactoryContext} factory
 */
export async function clearHandler(argv, factory) {
  const { lines, stations } = loadLines(factory);

  if (argv.line && !lines[argv.line]) fail(`Line "${argv.line}" not found. Available: ${Object.keys(lines).sort().join(', ') || '(none)'}`);
  if (argv.station) {
    const line = Object.values(lines).find((l) => l.stations.includes(argv.station));
    if (!line) fail(`Station "${argv.station}" not found.`);
    if (argv.bin === 'finished' && line.terminal !== argv.station) {
      fail(`${argv.station} isn't the terminal station of line ${line.code} (${line.terminal} is); only terminal output counts as finished.`);
    }
  }

  // STATION/BIN → where a conveyor moves it; source_bin may name a sub-bin.
  const drained_by = new Map();
  for (const s of stations) {
    for (const step of s.data.steps || []) {
      if (step.slug !== 'lib-factory:move_files' || !step.config?.source_bin) continue;
      drained_by.set(step.config.source_bin.split('/').slice(0, 2).join('/'), step.config.target_bin || '?');
    }
  }

  // Every clearable bin in scope: done anywhere, output of a terminal station.
  const groups = [];
  for (const line of Object.values(lines)) {
    if (argv.line && line.code !== argv.line) continue;
    for (const station of line.stations) {
      if (argv.station && station !== argv.station) continue;
      const bins = [];
      if (argv.bin !== 'finished') bins.push('done');
      if (argv.bin !== 'done' && station === line.terminal) bins.push('output');
      for (const bin of bins) {
        const map = line.bins[station][bin];
        if (!map || map.size === 0) continue;
        const spec = `${station}/${bin}`;
        let skip = null;
        if (factory.keep.includes(spec)) skip = 'kept (config keep list)';
        else if (drained_by.has(spec)) skip = `skipped: conveyor moves it to ${drained_by.get(spec)}`;
        groups.push({ line: line.code, spec, skip, entries: [...map].map(([id, sub]) => ({ id, rel: `${spec}/${sub}` })) });
      }
    }
  }

  let what = `${argv.bin} bins`;
  if (argv.id) {
    const ids = new Set(groups.flatMap((g) => g.entries.map((e) => e.id)));
    const matches = ids.has(argv.id) ? [argv.id] : [...ids].filter((id) => id.includes(argv.id)).sort();
    if (matches.length === 0) fail(`No done or finished workpiece matches "${argv.id}" on ${factory.name}. Only done bins and terminal outputs can be cleared.`);
    if (matches.length > 1) {
      const shown = matches.slice(0, 10);
      fail(`"${argv.id}" matches ${matches.length} workpieces; use the full id:\n  ${shown.join('\n  ')}${matches.length > 10 ? `\n  … +${matches.length - 10} more` : ''}`);
    }
    for (const g of groups) g.entries = g.entries.filter((e) => e.id === matches[0]);
    what = `done or finished copies of ${matches[0]}`;
  }

  if (argv.olderThan !== undefined) {
    const ages = loadAges(factory, groups.filter((g) => !g.skip).flatMap((g) => g.entries.map((e) => e.rel)));
    const cutoff = Date.now() - argv.olderThan * DAY_MS;
    for (const g of groups) {
      if (g.skip) continue;
      const before = g.entries.length;
      g.entries = g.entries.filter((e) => ages[e.rel] !== null && ages[e.rel] < cutoff);
      g.newer = before - g.entries.length;
    }
    what += ` older than ${argv.olderThan} day${argv.olderThan === 1 ? '' : 's'}`;
  }

  const shown = groups.filter((g) => g.entries.length > 0 || g.newer);
  if (shown.length === 0) {
    console.log(`Nothing to clear: no ${what} on ${factory.name}.`);
    return;
  }

  const has_age = argv.olderThan !== undefined;
  console.log(formatTable(
    ['LINE', 'BIN', 'WORKPIECES', ...(has_age ? ['NEWER (KEPT)'] : []), 'NOTE'],
    shown.map((g) => [
      g.line,
      g.spec,
      String(g.entries.length),
      ...(has_age ? [g.skip ? '' : String(g.newer ?? 0)] : []),
      g.skip ?? '',
    ]),
  ));
  console.log('');

  const to_delete = shown.filter((g) => !g.skip).flatMap((g) => g.entries.map((e) => e.rel));
  if (to_delete.length === 0) {
    console.log(`Nothing to delete: every matching bin is skipped${has_age ? ' or too recent' : ''}.`);
    return;
  }
  const where = `${factory.host.name} / ${factory.name}`;
  if (!argv.yes) {
    console.log(`Dry run: would delete ${to_delete.length} workpiece${to_delete.length === 1 ? '' : 's'} on ${where}. Re-run with --yes to delete.`);
    return;
  }

  const { removed } = probe(factory.host, { type: 'remove', path: factory.path, dirs: to_delete, keep: factory.keep });
  console.log(`Deleted ${removed.length} workpiece${removed.length === 1 ? '' : 's'} on ${where}.`);
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}
