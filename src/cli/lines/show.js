import {
  topoSortStations,
  codeOf,
  dependencyRef,
  resolveStationRef,
  indexStationsByRef,
} from '../../utils/line-state.js';
import { loadDefs } from '../../utils/factory-data.js';
import { formatHeader, formatField, formatTable, formatSection } from '../../utils/format.js';

/**
 * `al-control lines show <line> -f <factory>` — definitional view of a line:
 * stations in dependency order plus conveyor topology.
 *
 * @param {{line: string, json?: boolean}} argv
 * @param {import('../../config.js').FactoryContext} factory
 */
export async function showLineHandler(argv, factory) {
  const { line: line_arg, json } = argv;
  const { stations, lines: line_defs } = loadDefs(factory);
  const line_def = line_defs[line_arg] || null;

  const members = stations.filter((s) => s.line === line_arg);
  if (members.length === 0 && !line_def) {
    console.error(`Line not found: ${line_arg}`);
    console.error(`Run "al-control lines list ${factory.flags}" to see available lines.`);
    process.exit(1);
  }

  const ordered = topoSortStations(members);

  if (json) {
    console.log(JSON.stringify({ line: line_def, stations: ordered.map((m) => m.data) }, null, 2));
    return;
  }

  console.log(formatHeader('Line', line_arg));
  if (line_def?.name && line_def.name !== line_arg) console.log(formatField('Name', line_def.name, 12));
  console.log(formatField('Location', line_def?.location ?? '(no line file — run "al-orc lines pull --all")', 12));
  if (line_def?.description) console.log(formatField('Description', line_def.description, 12));
  console.log(formatField('Stations', String(members.length), 12));
  console.log('');

  // Resolve dependency refs against every station, not just this line's — a
  // cross-line edge should still render as a short_code.
  const by_ref = indexStationsByRef(stations);
  const rows = ordered.map((m) => {
    const deps = (m.data.dependencies || [])
      .map((d) => resolveStationRef(dependencyRef(d), by_ref))
      .join(', ') || '—';
    return [
      codeOf(m),
      m.data.name || '—',
      String(Array.isArray(m.data.steps) ? m.data.steps.length : 0),
      deps,
      m.data.is_enabled === false ? 'no' : 'yes',
    ];
  });
  console.log(formatTable(['STATION', 'NAME', 'STEPS', 'DEPENDS ON', 'ENABLED'], rows));

  // move_files steps describe the source → target bin flow.
  const conveyors = [];
  for (const m of ordered) {
    for (const step of m.data.steps || []) {
      if (step.slug === 'lib-factory:move_files' && step.config) {
        conveyors.push([codeOf(m), step.config.source_bin || '—', step.config.target_bin || '—', step.config.mode || '—']);
      }
    }
  }
  if (conveyors.length > 0) {
    console.log(formatSection('Conveyors'));
    console.log(formatTable(['AT STATION', 'FROM BIN', 'TO BIN', 'MODE'], conveyors));
  }

  console.log('');
  console.log(`Run \`al-control lines status ${line_arg} ${factory.flags}\` for live bin counts.`);
}
