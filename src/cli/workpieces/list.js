import { formatTable, formatSection, formatTime, formatElapsed, localTzLabel } from '../../utils/format.js';
import {
  resolvePosition,
  findWorkpieceMatches,
  collectIdsForBin,
  idsOnLine,
  workpieceRelDir,
} from '../../utils/line-state.js';
import { loadLines, loadLogs, workpieceLocation } from '../../utils/factory-data.js';

/**
 * `al-control workpieces list -f <factory> [--line] [--bin] [--match]` —
 * dashboard of workpieces on disk: position, last event, folder.
 *
 * Scope flags are optional and layer when combined:
 *   --line VM            all workpieces on the VM line
 *   --bin STATION/BIN    one bin, e.g. VM3/failed
 *   --match <substring>  workpiece-id substring
 *
 * @param {{line?: string, bin?: string, match?: string, json?: boolean}} argv
 * @param {import('../../config.js').FactoryContext} factory
 */
export async function listWorkpiecesHandler(argv, factory) {
  const { line: line_arg, bin: bin_arg, match: match_arg, json } = argv;
  const { root, lines } = loadLines(factory);

  if (Object.keys(lines).length === 0) {
    if (json) {
      console.log(JSON.stringify({ header: 'Workpieces', workpieces: [] }, null, 2));
      return;
    }
    console.log(`No lines in ${factory.name}/.orchestrator/stations/. Run "al-orc stations pull --all" in the factory repo.`);
    return;
  }

  let ids;
  let header = 'Workpieces';
  if (bin_arg) {
    const result = collectIdsForBin(bin_arg, lines);
    if (!result.ok) {
      console.error(result.error);
      process.exit(1);
    }
    ids = result.ids;
    header = `Workpieces in ${bin_arg}`;
  } else if (match_arg) {
    ids = [...findWorkpieceMatches(match_arg, lines).keys()];
    header = `Workpieces matching "${match_arg}"`;
  } else if (line_arg) {
    ids = idsOnLine(requireLine(lines, line_arg));
    header = `Workpieces on line ${line_arg}`;
  } else {
    ids = [...new Set(Object.values(lines).flatMap(idsOnLine))];
  }

  // --line narrows --bin / --match further.
  if (line_arg && (bin_arg || match_arg)) {
    const line_ids = new Set(idsOnLine(requireLine(lines, line_arg)));
    ids = ids.filter((id) => line_ids.has(id));
  }

  ids.sort((a, b) => a.localeCompare(b));

  const positioned = ids.map((id) => {
    const pos = resolvePosition(id, lines);
    return { id, pos, rel: pos ? workpieceRelDir(pos, id) : null };
  });
  const logs = loadLogs(factory, positioned.filter((p) => p.pos).map((p) => p.rel));

  const rows = positioned.map(({ id, pos, rel }) => {
    if (!pos) return { id, position: '(not on disk)', last_event: '—', folder: '—' };
    return {
      id,
      position: positionShort(pos),
      last_event: formatLastEventCompact(logs[rel] || []),
      folder: workpieceLocation(factory, root, rel),
    };
  });

  if (json) {
    console.log(JSON.stringify({ header, workpieces: rows }, null, 2));
    return;
  }

  if (rows.length === 0) {
    console.log(`${header}: 0 workpieces.`);
    return;
  }

  console.log(`${header} — ${rows.length} workpiece${rows.length === 1 ? '' : 's'}`);
  console.log('');
  console.log(formatTable(
    ['WORKPIECE', 'POSITION', `LAST EVENT (${localTzLabel()})`],
    rows.map((r) => [r.id, r.position, r.last_event]),
  ));

  console.log(formatSection('Folders'));
  const id_w = Math.max(...rows.map((r) => r.id.length));
  for (const r of rows) console.log(`  ${r.id.padEnd(id_w)}  ${r.folder}`);
}

function requireLine(lines, code) {
  const ls = lines[code];
  if (!ls) {
    console.error(`Line "${code}" not found. Available: ${Object.keys(lines).sort().join(', ') || '(none)'}`);
    process.exit(1);
  }
  return ls;
}

function positionShort(pos) {
  // Show the sub-bin segment when the workpiece lives under one
  // (HI3/output/invoices); the id itself is already the WORKPIECE column.
  const sub = pos.subpath && pos.subpath.includes('/')
    ? '/' + pos.subpath.slice(0, pos.subpath.lastIndexOf('/'))
    : '';
  if (pos.anomaly) return `${pos.station}/done${sub} (anomaly)`;
  let suffix = '';
  if (pos.bin === 'failed') suffix = ' (stuck)';
  else if (pos.bin === 'output' && pos.terminal) suffix = ' (finished)';
  else if (pos.bin === 'doing') suffix = ' (active)';
  return `${pos.station}/${pos.bin}${sub}${suffix}`;
}

function formatLastEventCompact(events) {
  if (events.length === 0) return '—';
  const e = events[events.length - 1];
  const ts = formatTime(e.ts).slice(0, 5); // HH:MM, local
  let extra = '';
  if (e.event === 'station_complete' || e.event === 'station_failed') {
    for (let i = events.length - 2; i >= 0; i--) {
      if (events[i].station === e.station && events[i].event === 'station_started') {
        const ms = new Date(e.ts).getTime() - new Date(events[i].ts).getTime();
        if (!Number.isNaN(ms) && ms >= 0) extra = ` (${formatElapsed(ms)})`;
        break;
      }
    }
  }
  return `${ts}  ${e.station}  ${e.event}${extra}`;
}
