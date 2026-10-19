import { errorKey } from '../../utils/failures.js';
import { formatTable, formatDate, localTzLabel } from '../../utils/format.js';
import { loadLinesEach, loadErrors } from '../../utils/factory-data.js';

const MAX_EXAMPLES = 2;
const ERROR_COL = 80;

/**
 * `al-control workpieces errors [-f <factory>] [--line] [--station]` — failed
 * workpieces grouped by error (see utils/failures.js), most common first.
 * Every factory on the host unless `-f` narrows it. One probe call per factory.
 * Orphaned failed folders (no pointer.json) are included and flagged.
 *
 * @param {{line?: string, station?: string, json?: boolean}} argv
 * @param {{host: import('../../config.js').HostContext, factories: import('../../config.js').FactoryContext[]}} scope
 */
export async function errorsHandler(argv, { factories }) {
  const host_wide = factories.length > 1;
  const groups = new Map();

  let orphan_total = 0;
  for (const { factory, lines, orphans } of loadLinesEach(factories)) {
    const failed = [];
    for (const line of Object.values(lines)) {
      if (argv.line && line.code !== argv.line) continue;
      for (const station of line.stations) {
        if (argv.station && station !== argv.station) continue;
        for (const [id, sub] of line.bins[station].failed ?? []) failed.push({ id, station, rel: `${station}/failed/${sub}`, orphan: false });
        for (const [id, sub] of Object.entries(orphans[station] ?? {})) failed.push({ id, station, rel: `${station}/failed/${sub}`, orphan: true });
      }
    }
    const errors = loadErrors(factory, failed.map((f) => f.rel));
    for (const f of failed) {
      const err = errors[f.rel];
      const key = errorKey(err);
      if (!groups.has(key)) groups.set(key, { key, count: 0, where: {}, workpieces: [], last_failed_at: null });
      const g = groups.get(key);
      const where = host_wide ? `${factory.name}/${f.station}` : f.station;
      g.count += 1;
      g.where[where] = (g.where[where] ?? 0) + 1;
      g.workpieces.push({ factory: factory.name, id: f.id, station: f.station, failed_at: err?.failed_at ?? null, message: err?.message ?? null, orphan: f.orphan });
      if (f.orphan) { g.orphans = (g.orphans ?? 0) + 1; orphan_total += 1; }
      if (err?.failed_at && (!g.last_failed_at || err.failed_at > g.last_failed_at)) g.last_failed_at = err.failed_at;
    }
  }

  const sorted = [...groups.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

  if (argv.json) {
    console.log(JSON.stringify({ groups: sorted }, null, 2));
    return;
  }

  if (sorted.length === 0) {
    console.log('No failed workpieces.');
    return;
  }

  const total = sorted.reduce((n, g) => n + g.count, 0);
  console.log(`${total} failed workpiece${total === 1 ? '' : 's'}, ${sorted.length} distinct error${sorted.length === 1 ? '' : 's'}\n`);
  console.log(formatTable(
    ['COUNT', 'ERROR', 'WHERE', `LAST FAILED (${localTzLabel()})`, 'EXAMPLES'],
    sorted.map((g) => [
      g.orphans ? `${g.count} (${g.orphans} orphaned)` : String(g.count),
      g.key.length > ERROR_COL ? `${g.key.slice(0, ERROR_COL - 1)}…` : g.key,
      Object.keys(g.where).length === 1
        ? Object.keys(g.where)[0]
        : Object.entries(g.where).map(([w, n]) => `${w} ×${n}`).join(', '),
      g.last_failed_at ? formatDate(g.last_failed_at) : '—',
      g.workpieces.slice(0, MAX_EXAMPLES).map((w) => w.id).join(', ') + (g.count > MAX_EXAMPLES ? ` +${g.count - MAX_EXAMPLES}` : ''),
    ]),
  ));
  if (orphan_total > 0) {
    console.log(`\n${orphan_total} orphaned: failed folder${orphan_total === 1 ? '' : 's'} with no pointer.json. \`show\` and \`clear\` can't see them; inspect or remove them on the host (--json has their stations).`);
  }
  const ex = sorted.flatMap((g) => g.workpieces).find((w) => !w.orphan) ?? sorted[0].workpieces[0];
  const flags = factories.find((w) => w.name === ex.factory).flags;
  console.log(`\nDetails: \`al-control workpieces show ${ex.id} ${flags}\`. Every id per group: --json.`);
}
