import path from 'node:path';

import { probeProcesses } from '../../transport.js';
import { formatTable } from '../../utils/format.js';

/**
 * `al-control factories list` — the current host's configured factories joined
 * with what's running there.
 * @param {{json?: boolean}} argv
 * @param {import('../../config.js').HostContext} host
 */
export async function listFactoriesHandler(argv, host) {
  if (Object.keys(host.factories).length === 0) {
    if (argv.json) console.log(JSON.stringify([], null, 2));
    else console.log(`No factories configured for host ${host.name}.`);
    return;
  }

  const { factories, procs } = probeProcesses(host, { type: 'factories', paths: host.factories });
  const rows = factories.map((w) => {
    const pm2_name = path.posix.basename(w.root);
    const proc = procs.find((r) => r.cwd === w.root || r.pm2 === pm2_name) ?? null;
    let status;
    if (!w.exists) status = 'missing';
    else if (!w.main) status = 'not a factory';
    else if (proc) status = `running (${proc.mode})`;
    else status = 'stopped';
    return {
      name: w.name,
      path: w.root,
      status,
      pid: proc?.pid ?? null,
      cpu: proc?.cpu ?? null,
      memory: proc?.memory ?? null,
      uptime: proc?.uptime ?? null,
    };
  });

  if (argv.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  console.log(formatTable(
    ['FACTORY', 'STATUS', 'PID', 'CPU', 'MEM', 'UPTIME', 'PATH'],
    rows.map((r) => [
      r.name,
      r.status,
      r.pid ?? '—',
      r.cpu === null ? '—' : `${r.cpu}%`,
      r.memory === null ? '—' : `${Math.round(r.memory / 1024 / 1024)} MB`,
      r.uptime ?? '—',
      r.path,
    ]),
  ));
}
