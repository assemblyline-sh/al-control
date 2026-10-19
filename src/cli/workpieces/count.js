import { formatTable } from '../../utils/format.js';
import { loadLinesEach } from '../../utils/factory-data.js';

const LEVELS = ['factory', 'line', 'station'];

const BINS = ['failed', 'done', 'finished'];

/**
 * `al-control workpieces count [failed|done|finished] [-f <factory>]
 * [--by factory|line|station]` — FAILED / DONE / FINISHED per station, rolled
 * up to the `--by` level; naming a bin shows only that count. Every factory on
 * the host unless `-f` narrows it. FINISHED is the output bin of a line's
 * terminal station. Rows that are zero in every shown count are hidden.
 * FAILED includes orphaned failed folders (no pointer.json), noted below the
 * table since nothing else can see them.
 *
 * @param {{bin?: string, by?: string, json?: boolean}} argv
 * @param {{host: import('../../config.js').HostContext, factories: import('../../config.js').FactoryContext[]}} scope
 */
export async function countWorkpiecesHandler(argv, { factories }) {
  const by = argv.by ?? 'station';
  const keys = LEVELS.slice(0, LEVELS.indexOf(by) + 1);

  const rows = new Map();
  let orphan_total = 0;
  for (const { factory, lines, orphans } of loadLinesEach(factories)) {
    for (const line of Object.values(lines)) {
      for (const station of line.stations) {
        const bins = line.bins[station];
        const at = { factory: factory.name, line: line.code, station };
        const id = keys.map((k) => at[k]).join('\0');
        if (!rows.has(id)) rows.set(id, { ...Object.fromEntries(keys.map((k) => [k, at[k]])), failed: 0, done: 0, finished: 0 });
        const row = rows.get(id);
        const orphan_count = Object.keys(orphans[station] ?? {}).length;
        orphan_total += orphan_count;
        row.failed += (bins.failed?.size ?? 0) + orphan_count;
        row.done += bins.done?.size ?? 0;
        if (station === line.terminal) row.finished += bins.output?.size ?? 0;
      }
    }
  }

  const bins = argv.bin ? [argv.bin] : BINS;
  const nonzero = [...rows.values()]
    .filter((r) => bins.some((b) => r[b]))
    .map((r) => ({ ...Object.fromEntries(keys.map((k) => [k, r[k]])), ...Object.fromEntries(bins.map((b) => [b, r[b]])) }));

  if (argv.json) {
    console.log(JSON.stringify({ by, rows: nonzero, orphaned: orphan_total }, null, 2));
    return;
  }

  if (nonzero.length === 0) {
    console.log(`No ${bins.join(', ')} workpieces.`);
    return;
  }

  const n = (v) => (v ? String(v) : '—');
  const blank = keys.map(() => '');
  blank[0] = 'TOTAL';
  console.log(formatTable(
    [...keys.map((k) => k.toUpperCase()), ...bins.map((b) => b.toUpperCase())],
    [
      ...nonzero.map((r) => [...keys.map((k) => r[k]), ...bins.map((b) => n(r[b]))]),
      [...blank, ...bins.map((b) => n(nonzero.reduce((t, r) => t + r[b], 0)))],
    ],
  ));
  if (bins.includes('finished')) console.log('\nFINISHED = output of a line\'s terminal station.');
  if (bins.includes('failed') && orphan_total > 0) {
    console.log(`${bins.includes('finished') ? '' : '\n'}FAILED includes ${orphan_total} orphaned folder${orphan_total === 1 ? '' : 's'} (no pointer.json); \`workpieces errors\` lists them.`);
  }
  if (bins.includes('failed')) console.log(`${bins.includes('finished') || orphan_total > 0 ? '' : '\n'}Why things failed: \`al-control workpieces errors\`.`);
}
