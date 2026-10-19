import { resolvePosition, findWorkpieceMatches, workpieceRelDir } from '../../utils/line-state.js';
import { loadLines, loadLogs, loadWorkpieceFiles, workpieceLocation } from '../../utils/factory-data.js';
import { formatDate, formatElapsed, formatSection, localTzLabel } from '../../utils/format.js';
import { listWorkpiecesHandler } from './list.js';

const STACK_FRAMES = 6;
const MESSAGE_LINES = 3;
const LINE_MAX = 300;

/**
 * `al-control workpieces show <id-or-substring> -f <factory>` — one
 * workpiece: position, journey from log.jsonl with durations, the error when
 * it has one, its files, folder.
 *
 * A substring matching several ids promotes to the `workpieces list --match`
 * dashboard; pass the full id to force the single view.
 *
 * @param {{id: string, json?: boolean}} argv
 * @param {import('../../config.js').FactoryContext} factory
 */
export async function showWorkpieceHandler(argv, factory) {
  const { id: query, json } = argv;
  const { root, lines } = loadLines(factory);
  const matches = findWorkpieceMatches(query, lines);

  if (!matches.has(query) && matches.size > 1) {
    return listWorkpiecesHandler({ ...argv, match: query }, factory);
  }
  const id = matches.has(query) ? query : [...matches.keys()][0];
  if (!id) {
    console.error(`No workpiece matches "${query}".`);
    process.exit(1);
  }

  const pos = resolvePosition(id, lines);
  const rel = workpieceRelDir(pos, id);
  const journey = loadLogs(factory, [rel])[rel];
  const folder = workpieceLocation(factory, root, rel);
  const { files, error } = loadWorkpieceFiles(factory, rel);

  if (json) {
    console.log(JSON.stringify({ id, position: pos, journey, error, files, folder }, null, 2));
    return;
  }

  console.log(`Workpiece: ${id}`);
  console.log(`Position:  ${positionLabel(pos)}`);
  console.log('');
  renderJourney(journey);
  if (error) renderError(error, `al-control workpieces cat ${id} error.txt ${factory.flags}`);
  console.log(formatSection('Files'));
  const name_w = Math.max(...files.map((f) => f.name.length), 0);
  for (const f of files) console.log(`  ${f.name.padEnd(name_w)}  ${formatSize(f.size).padStart(8)}`);
  console.log('');
  console.log(`Folder: ${folder}`);
  console.log('');
  console.log(`Read a file:  al-control workpieces cat ${id} <file> ${factory.flags}`);
  console.log(`Go there:     al-control workpieces open ${id} ${factory.flags}`);
  console.log(`Tail live:    al-control workpieces watch ${id} ${factory.flags}`);
}

/**
 * Message (first lines, capped — some carry a whole HTML page), any extra
 * fields the step attached, then the top of the stack.
 */
function renderError(error, full_cmd) {
  const heading = `Error${error.failed_at ? ` — failed ${formatDate(error.failed_at)}` : ''}`;
  console.log(formatSection(heading));
  const cap = (l) => (l.length > LINE_MAX ? `${l.slice(0, LINE_MAX)}… [+${l.length - LINE_MAX} chars]` : l);
  const message_lines = `${error.name ?? 'Error'}: ${error.message ?? ''}`.split('\n');
  for (const l of message_lines.slice(0, MESSAGE_LINES)) console.log(`  ${cap(l)}`);
  if (message_lines.length > MESSAGE_LINES) console.log(`  … +${message_lines.length - MESSAGE_LINES} lines`);

  for (const [key, value] of Object.entries(error)) {
    if (['failed_at', 'name', 'message', 'stack'].includes(key)) continue;
    console.log(`  ${key}: ${cap(typeof value === 'string' ? value : JSON.stringify(value))}`);
  }

  const frames = String(error.stack ?? '').split('\n').filter((l) => /^\s+at /.test(l));
  if (frames.length > 0) {
    console.log('');
    for (const f of frames.slice(0, STACK_FRAMES)) console.log(`  ${f.trim()}`);
    if (frames.length > STACK_FRAMES) console.log(`  … +${frames.length - STACK_FRAMES} frames`);
  }
  console.log(`\n  Full error: ${full_cmd}`);
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function positionLabel(pos) {
  let label = `${pos.station}/${pos.bin}`;
  if (pos.anomaly) label += '  (anomaly — only in done, no live presence)';
  else if (pos.bin === 'failed') label += '  (stuck)';
  else if (pos.bin === 'output' && pos.terminal) label += '  (finished — terminal output)';
  else if (pos.bin === 'doing') label += '  (in progress)';
  return label;
}

function renderJourney(events) {
  const heading = `Journey (${localTzLabel()})`;
  console.log(heading);
  console.log('-'.repeat(heading.length));
  if (events.length === 0) {
    console.log('  (no log.jsonl found at current position)');
    return;
  }
  const started_at = {}; // station → ts of last station_started
  for (const e of events) {
    let extra = '';
    if (e.event === 'station_started') {
      started_at[e.station] = e.ts;
    } else if (e.event === 'station_complete' || e.event === 'station_failed') {
      const start = started_at[e.station];
      if (start) {
        const ms = new Date(e.ts).getTime() - new Date(start).getTime();
        if (!Number.isNaN(ms) && ms >= 0) extra = `       (${formatElapsed(ms)})`;
        delete started_at[e.station];
      }
    }
    console.log(`${formatDate(e.ts)}  ${e.station.padEnd(3)}  ${e.event}${extra}`);
  }
}
