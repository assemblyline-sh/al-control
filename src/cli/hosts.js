import { loadConfig, useHost, configPath, factoryEntry, LOCAL_HOST } from '../config.js';
import { formatTable } from '../utils/format.js';

/**
 * `al-control hosts list` — configured hosts; `*` marks the current one.
 * Reads the config only; doesn't contact any host.
 * @param {{json?: boolean}} argv
 */
export async function listHostsHandler(argv) {
  const cfg = loadConfig();
  const rows = Object.entries(cfg.hosts).map(([name, h]) => ({
    name,
    current: name === cfg.current_host,
    ssh: name === LOCAL_HOST ? null : h.ssh,
    factories: Object.keys(h.factories),
  }));

  if (argv.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  console.log(formatTable(
    ['', 'HOST', 'SSH', 'FACTORYS'],
    rows.map((r) => [r.current ? '*' : ' ', r.name, r.ssh ?? '(this machine)', r.factories.join(', ') || '—']),
  ));
  console.log('');
  console.log(`Config: ${configPath()}`);
}

/**
 * `al-control hosts use <name>`
 * @param {{name: string}} argv
 */
export async function useHostHandler(argv) {
  useHost(argv.name);
  console.log(`Switched to host ${argv.name}.`);
}

/** `al-control hosts current` */
export async function currentHostHandler() {
  const { current_host } = loadConfig();
  console.log(current_host ?? '(none — run `al-control hosts use <name>`)');
}

/** `al-control config show` — config path and contents as resolved. */
export async function showConfigHandler() {
  const cfg = loadConfig();
  console.log(`Config:       ${configPath()}`);
  console.log(`Current host: ${cfg.current_host ?? '(none)'}`);
  for (const [name, h] of Object.entries(cfg.hosts)) {
    console.log('');
    console.log(`${name}${name === LOCAL_HOST ? ' (this machine)' : `  ssh: ${h.ssh}`}${h.node ? `  node: ${h.node}` : ''}`);
    for (const [w, entry] of Object.entries(h.factories)) {
      const { path, keep } = factoryEntry(entry);
      console.log(`  ${w.padEnd(24)} ${path}${keep.length ? `  keep: ${keep.join(', ')}` : ''}`);
    }
  }
}
