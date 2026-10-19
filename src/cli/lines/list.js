import { topoSortStations, codeOf } from '../../utils/line-state.js';
import { loadDefs } from '../../utils/factory-data.js';
import { formatTable } from '../../utils/format.js';

/**
 * `al-control lines list -f <factory>` — lines derived from the factory's
 * station JSON files: name, location (from `.orchestrator/lines/<CODE>.json`),
 * station count and members. Definitional; `lines status` has live counts.
 *
 * @param {{json?: boolean}} argv
 * @param {import('../../config.js').FactoryContext} factory
 */
export async function listLinesHandler(argv, factory) {
  const { json } = argv;
  const { stations, lines: line_defs } = loadDefs(factory);

  if (stations.length === 0) {
    if (json) {
      console.log(JSON.stringify({}, null, 2));
      return;
    }
    console.log(`No station files in ${factory.name}/.orchestrator/stations/.`);
    console.log('Run "al-orc stations pull --all" in the factory repo to fetch them.');
    return;
  }

  // Stations without a line field group under '(unassigned)'.
  const groups = new Map();
  for (const s of stations) {
    const key = s.line ?? '(unassigned)';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  // A line file with no stations yet still exists as a definition.
  for (const code of Object.keys(line_defs)) {
    if (!groups.has(code)) groups.set(code, []);
  }

  if (json) {
    const out = {};
    for (const [line, members] of groups) {
      const def = line_defs[line] || null;
      out[line] = {
        name: def?.name ?? null,
        location: def?.location ?? null,
        stations: topoSortStations(members).map((m) => ({ short_code: m.data.short_code, id: m.data.id, name: m.data.name })),
      };
    }
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  const rows = [...groups.keys()].sort().map((line) => {
    const members = groups.get(line);
    const def = line_defs[line];
    return [
      line,
      def?.name && def.name !== line ? def.name : '—',
      def?.location ?? '(no line file)',
      String(members.length),
      topoSortStations(members).map(codeOf).join(', ') || '—',
    ];
  });

  console.log(formatTable(['LINE', 'NAME', 'LOCATION', 'STATIONS', 'MEMBERS'], rows));
  console.log('');
  console.log(`Total: ${groups.size} lines, ${stations.length} stations`);
  if (Object.keys(line_defs).length === 0) {
    console.log('No line files in .orchestrator/lines/ — run "al-orc lines pull --all" in the factory repo.');
  }
  console.log(`Run \`al-control lines status ${factory.flags}\` for live bin counts.`);
}
