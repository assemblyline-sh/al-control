import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { runQuery } from '../src/probe.js';
import { buildLineState, resolvePosition, summarizeLine, workpieceRelDir } from '../src/utils/line-state.js';

/**
 * A factory repo with line VM: VM1 → VM2 (terminal).
 *   VM1/output/wp-1         flat workpiece
 *   VM2/output/inv/wp-2     workpiece under a sub-bin
 *   VM2/failed/             exists but empty
 */
function makeFactory() {
  const root = mkdtempSync(path.join(tmpdir(), 'al-control-factory-'));
  const stations_dir = path.join(root, '.orchestrator', 'stations');
  mkdirSync(stations_dir, { recursive: true });
  writeFileSync(path.join(stations_dir, 'VM1__a.json'), JSON.stringify({ id: 'id1', short_code: 'VM1', line: 'VM', dependencies: [] }));
  writeFileSync(path.join(stations_dir, 'VM2__b.json'), JSON.stringify({ id: 'id2', short_code: 'VM2', line: 'VM', dependencies: ['id1'] }));
  writeFileSync(path.join(stations_dir, 'broken.json'), '{not json');
  mkdirSync(path.join(root, '.orchestrator', 'lines'), { recursive: true });
  writeFileSync(path.join(root, '.orchestrator', 'lines', 'VM.json'), JSON.stringify({ code: 'VM', name: 'Vendor', location: 'w' }));

  const wp = (rel, log) => {
    const dir = path.join(root, 'temp', 'stations', rel);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'pointer.json'), '{}');
    if (log) writeFileSync(path.join(dir, 'log.jsonl'), log);
  };
  wp('VM1/output/wp-1', '{"ts":"2026-01-01T00:00:00Z","station":"VM1","event":"station_complete"}\n\nnot json\n');
  wp('VM2/output/inv/wp-2');
  mkdirSync(path.join(root, 'temp', 'stations', 'VM2', 'failed'), { recursive: true });
  return root;
}

describe('runQuery', () => {
  test('defs: stations (malformed skipped) and lines', () => {
    const root = makeFactory();
    const out = runQuery({ type: 'defs', path: root });
    expect(out.root).toBe(root);
    expect(out.stations.map((s) => s.data.short_code)).toEqual(['VM1', 'VM2']);
    expect(out.lines.VM.name).toBe('Vendor');
    expect(out.factory).toBeNull();
  });

  test('defs and state: .orchestrator/factory.json when present', () => {
    const root = makeFactory();
    const factory = { orchestrator_url: 'https://o.example', org: 'acme' };
    writeFileSync(path.join(root, '.orchestrator', 'factory.json'), JSON.stringify(factory));
    expect(runQuery({ type: 'defs', path: root }).factory).toEqual(factory);
    expect(runQuery({ type: 'state', path: root }).factory).toEqual(factory);
  });

  test('state: bins with sub-bins; missing bin dirs are null', () => {
    const out = runQuery({ type: 'state', path: makeFactory() });
    expect(out.bins.VM1.output).toEqual({ 'wp-1': 'wp-1' });
    expect(out.bins.VM2.output).toEqual({ 'wp-2': 'inv/wp-2' });
    expect(out.bins.VM2.failed).toEqual({});
    expect(out.bins.VM1.input).toBeNull();
  });

  test('state result is plain JSON', () => {
    const out = runQuery({ type: 'state', path: makeFactory() });
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });

  test('logs: parsed, blank and malformed lines dropped, missing log is []', () => {
    const root = makeFactory();
    const { logs } = runQuery({ type: 'logs', path: root, dirs: ['VM1/output/wp-1', 'VM2/output/inv/wp-2'] });
    expect(logs['VM1/output/wp-1']).toEqual([{ ts: '2026-01-01T00:00:00Z', station: 'VM1', event: 'station_complete' }]);
    expect(logs['VM2/output/inv/wp-2']).toEqual([]);
  });

  test('logs: refuses paths outside temp/stations/', () => {
    expect(() => runQuery({ type: 'logs', path: makeFactory(), dirs: ['../../.orchestrator'] })).toThrow(/Refusing to touch outside/);
  });

  test('missing factory dir', () => {
    expect(() => runQuery({ type: 'state', path: '/definitely/not/here' })).toThrow(expect.objectContaining({ code: 'FACTORY_NOT_FOUND' }));
  });

  test('counts: per-bin numbers and station → line, per factory; a missing factory reports an error', () => {
    const root = makeFactory();
    const out = runQuery({ type: 'counts', paths: { a: root, gone: '/definitely/not/here' } });
    expect(out.a.lines).toEqual({ VM1: 'VM', VM2: 'VM' });
    expect(out.a.counts.VM1).toEqual({ input: null, doing: null, output: 1, failed: null, done: null });
    expect(out.a.counts.VM2).toMatchObject({ output: 1, failed: 0 });
    expect(out.gone.error).toMatch(/does not exist/);
  });

  test('factories: existence and package main', () => {
    const root = makeFactory();
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ main: 'src/index.js', dependencies: { '@assemblyline/lib-factory': '1' } }));
    const out = runQuery({ type: 'factories', paths: { a: root, gone: '/definitely/not/here' } });
    expect(out.factories).toEqual([
      { name: 'a', root, exists: true, main: 'src/index.js' },
      { name: 'gone', root: '/definitely/not/here', exists: false, main: null },
    ]);
    expect(Array.isArray(out.procs)).toBe(true);
    expect(typeof out.pm2_found).toBe('boolean');
  });
});

describe('triage queries', () => {
  /** VM2/failed/wp-3 with an error and a binary file; VM1/done/wp-1 and a stray non-workpiece dir. */
  function makeTriageFactory() {
    const root = makeFactory();
    const st = path.join(root, 'temp', 'stations');
    mkdirSync(path.join(st, 'VM2', 'failed', 'wp-3', 'sub'), { recursive: true });
    writeFileSync(path.join(st, 'VM2', 'failed', 'wp-3', 'pointer.json'), '{}');
    writeFileSync(path.join(st, 'VM2', 'failed', 'wp-3', 'error.json'), JSON.stringify({ failed_at: 't', name: 'Error', message: 'x'.repeat(5000), stack: 's', code: 'E1' }));
    writeFileSync(path.join(st, 'VM2', 'failed', 'wp-3', 'sub', 'doc.pdf'), Buffer.from([0x25, 0x50, 0x00, 0xff]));
    mkdirSync(path.join(st, 'VM1', 'done', 'wp-1'), { recursive: true });
    writeFileSync(path.join(st, 'VM1', 'done', 'wp-1', 'pointer.json'), '{}');
    mkdirSync(path.join(st, 'VM1', 'done', 'not-a-workpiece'), { recursive: true });
    return root;
  }

  test('state: failed folders without pointer.json are orphans; sub-bins and other bins are not', () => {
    const root = makeTriageFactory();
    const st = path.join(root, 'temp', 'stations');
    mkdirSync(path.join(st, 'VM2', 'failed', 'orphan-1'), { recursive: true });
    writeFileSync(path.join(st, 'VM2', 'failed', 'orphan-1', 'error.json'), JSON.stringify({ message: 'ENOENT' }));
    mkdirSync(path.join(st, 'VM2', 'failed', 'inv', 'wp-4'), { recursive: true });
    writeFileSync(path.join(st, 'VM2', 'failed', 'inv', 'wp-4', 'pointer.json'), '{}');
    const out = runQuery({ type: 'state', path: root });
    expect(out.orphans).toEqual({ VM2: { 'orphan-1': 'orphan-1' } });
    expect(out.bins.VM2.failed).toEqual({ 'wp-3': 'wp-3', 'wp-4': 'inv/wp-4' });
    expect(runQuery({ type: 'counts', paths: { a: root } }).a.orphans).toEqual({ VM2: 1 });
    expect(runQuery({ type: 'errors', path: root, dirs: ['VM2/failed/orphan-1'] }).errors['VM2/failed/orphan-1'].message).toBe('ENOENT');
  });

  test('ages: later of folder and log.jsonl mtime; null when gone', () => {
    const root = makeTriageFactory();
    const dir = path.join(root, 'temp', 'stations', 'VM1', 'output', 'wp-1');
    utimesSync(dir, new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'));
    utimesSync(path.join(dir, 'log.jsonl'), new Date('2026-02-01T00:00:00Z'), new Date('2026-02-01T00:00:00Z'));
    const { ages } = runQuery({ type: 'ages', path: root, dirs: ['VM1/output/wp-1', 'VM1/done/gone'] });
    expect(ages['VM1/output/wp-1']).toBe(Date.parse('2026-02-01T00:00:00Z'));
    expect(ages['VM1/done/gone']).toBeNull();
  });

  test('errors: summary without stack, message capped, null when missing', () => {
    const { errors } = runQuery({ type: 'errors', path: makeTriageFactory(), dirs: ['VM2/failed/wp-3', 'VM1/output/wp-1'] });
    expect(errors['VM2/failed/wp-3']).toEqual({ failed_at: 't', name: 'Error', code: 'E1', message: 'x'.repeat(2000) });
    expect(errors['VM1/output/wp-1']).toBeNull();
  });

  test('workpiece: recursive file list and full error', () => {
    const out = runQuery({ type: 'workpiece', path: makeTriageFactory(), dir: 'VM2/failed/wp-3' });
    expect(out.files.map((f) => f.name)).toEqual(['error.json', 'pointer.json', 'sub/doc.pdf']);
    expect(out.error.stack).toBe('s');
  });

  test('read: text as utf8, binary as base64, no escaping the folder', () => {
    const root = makeTriageFactory();
    expect(runQuery({ type: 'read', path: root, dir: 'VM2/failed/wp-3', file: 'pointer.json' })).toEqual({ encoding: 'utf8', content: '{}' });
    const bin = runQuery({ type: 'read', path: root, dir: 'VM2/failed/wp-3', file: 'sub/doc.pdf' });
    expect(bin.encoding).toBe('base64');
    expect(Buffer.from(bin.content, 'base64')).toEqual(Buffer.from([0x25, 0x50, 0x00, 0xff]));
    expect(() => runQuery({ type: 'read', path: root, dir: 'VM2/failed/wp-3', file: '../../../VM1/output/wp-1/log.jsonl' })).toThrow(/outside the workpiece folder/);
    expect(() => runQuery({ type: 'read', path: root, dir: 'VM2/failed/wp-3', file: 'nope' })).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  test('remove: deletes done/output workpieces', () => {
    const root = makeTriageFactory();
    expect(runQuery({ type: 'remove', path: root, dirs: ['VM1/done/wp-1', 'VM2/output/inv/wp-2'], keep: [] }).removed).toHaveLength(2);
    expect(existsSync(path.join(root, 'temp', 'stations', 'VM1', 'done', 'wp-1'))).toBe(false);
    expect(existsSync(path.join(root, 'temp', 'stations', 'VM2', 'output', 'inv'))).toBe(true);
  });

  test.each([
    ['a failed bin', ['VM2/failed/wp-3'], [], /Only done and output/],
    ['a kept bin', ['VM1/done/wp-1'], ['VM1/done'], /keep list/],
    ['a dir without pointer.json', ['VM1/done/not-a-workpiece'], [], /no pointer.json/],
    ['a path outside temp/stations', ['VM1/done/../../../../x'], [], /Only done and output|outside temp\/stations/],
  ])('remove refuses %s, and deletes nothing in that batch', (_, dirs, keep, msg) => {
    const root = makeTriageFactory();
    expect(() => runQuery({ type: 'remove', path: root, dirs: ['VM1/output/wp-1', ...dirs], keep })).toThrow(msg);
    expect(existsSync(path.join(root, 'temp', 'stations', 'VM1', 'output', 'wp-1'))).toBe(true);
  });

  test('requeue: failed and done workpieces go back to their own input, flat, minus the stale error', () => {
    const root = makeTriageFactory();
    const st = path.join(root, 'temp', 'stations');
    writeFileSync(path.join(st, 'VM2', 'failed', 'wp-3', 'error.txt'), 'boom');
    writeFileSync(path.join(st, 'VM2', 'failed', 'wp-3', 'log.jsonl'), '{"ts":"t","station":"VM2","event":"station_failed"}\n');
    mkdirSync(path.join(st, 'VM2', 'failed', 'inv', 'wp-4'), { recursive: true });
    writeFileSync(path.join(st, 'VM2', 'failed', 'inv', 'wp-4', 'pointer.json'), '{}');

    const out = runQuery({ type: 'requeue', path: root, dirs: ['VM2/failed/wp-3', 'VM2/failed/inv/wp-4', 'VM1/done/wp-1'] });
    expect(out.requeued).toHaveLength(3);

    const wp3 = path.join(st, 'VM2', 'input', 'wp-3');
    expect(existsSync(path.join(st, 'VM2', 'failed', 'wp-3'))).toBe(false);
    expect(existsSync(path.join(wp3, 'pointer.json'))).toBe(true);
    expect(existsSync(path.join(wp3, 'sub', 'doc.pdf'))).toBe(true);
    expect(existsSync(path.join(wp3, 'error.json'))).toBe(false);
    expect(existsSync(path.join(wp3, 'error.txt'))).toBe(false);
    const events = readFileSync(path.join(wp3, 'log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(events.map((e) => e.event)).toEqual(['station_failed', 'requeued']);
    expect(events[1]).toMatchObject({ station: 'VM2', from: 'failed' });

    expect(existsSync(path.join(st, 'VM2', 'input', 'wp-4', 'pointer.json'))).toBe(true);
    expect(existsSync(path.join(st, 'VM1', 'input', 'wp-1', 'pointer.json'))).toBe(true);
  });

  test.each([
    ['an output workpiece', ['VM1/output/wp-1'], /Only failed and done/],
    ['an output workpiece dressed up as failed', ['VM2/failed/../output/inv/wp-2'], /Only failed and done/],
    ['a dir without pointer.json', ['VM1/done/not-a-workpiece'], /no pointer.json/],
    ['a path outside temp/stations', ['VM2/failed/../../../../x'], /outside temp\/stations/],
  ])('requeue refuses %s, and moves nothing in that batch', (_, dirs, msg) => {
    const root = makeTriageFactory();
    expect(() => runQuery({ type: 'requeue', path: root, dirs: ['VM2/failed/wp-3', ...dirs] })).toThrow(msg);
    expect(existsSync(path.join(root, 'temp', 'stations', 'VM2', 'failed', 'wp-3', 'error.json'))).toBe(true);
    expect(existsSync(path.join(root, 'temp', 'stations', 'VM2', 'input'))).toBe(false);
  });

  test('requeue refuses when input already holds that id', () => {
    const root = makeTriageFactory();
    mkdirSync(path.join(root, 'temp', 'stations', 'VM2', 'input', 'wp-3'), { recursive: true });
    expect(() => runQuery({ type: 'requeue', path: root, dirs: ['VM2/failed/wp-3'] })).toThrow(/already exists/);
    expect(existsSync(path.join(root, 'temp', 'stations', 'VM2', 'failed', 'wp-3'))).toBe(true);
  });
});

describe('remote entry (node - over stdin)', () => {
  const source = readFileSync(new URL('../src/probe.js', import.meta.url), 'utf8');
  const run = (query) => JSON.parse(execFileSync(
    process.execPath,
    ['--input-type=module', '-'],
    { input: `${source}\nmain(${JSON.stringify(query)});\n`, encoding: 'utf8' },
  ));

  test('returns an ok envelope with the same data as in-process', () => {
    const root = makeFactory();
    expect(run({ type: 'state', path: root })).toEqual({ ok: true, data: runQuery({ type: 'state', path: root }) });
  });

  test('a query far past the 128 KB argv limit', () => {
    const root = makeFactory();
    const dirs = Array.from({ length: 20000 }, (_, i) => `VM1/output/wp-${i}`);
    expect(Object.keys(run({ type: 'logs', path: root, dirs }).data.logs)).toHaveLength(20000);
  });

  test('a refused remove comes back as a REFUSED envelope', () => {
    const root = makeFactory();
    expect(run({ type: 'remove', path: root, dirs: ['VM1/input/x'], keep: [] })).toMatchObject({ ok: false, error: { code: 'REFUSED' } });
  });

  test('errors come back as a structured envelope', () => {
    expect(run({ type: 'state', path: '/definitely/not/here' })).toEqual({
      ok: false,
      error: { code: 'FACTORY_NOT_FOUND', message: 'Factory directory does not exist: /definitely/not/here' },
    });
  });
});

describe('line model over probe output', () => {
  test('orders stations, finds terminal, resolves positions', () => {
    const lines = buildLineState(runQuery({ type: 'state', path: makeFactory() }));
    expect(lines.VM.stations).toEqual(['VM1', 'VM2']);
    expect(lines.VM.terminal).toBe('VM2');

    const pos = resolvePosition('wp-2', lines);
    expect(pos).toMatchObject({ station: 'VM2', bin: 'output', subpath: 'inv/wp-2', terminal: true });
    expect(workpieceRelDir(pos, 'wp-2')).toBe('VM2/output/inv/wp-2');

    expect(summarizeLine(lines.VM)).toMatchObject({ in_flight: 1, stuck: 0, finished: 1 });
  });
});
