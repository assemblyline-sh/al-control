import { probeProcesses } from '../../transport.js';
import { formatTable } from '../../utils/format.js';

/**
 * `al-control procs list` — every factory process on the host, configured
 * or not, pm2-managed or run directly.
 * @param {{json?: boolean}} argv
 * @param {import('../../config.js').HostContext} host
 */
export async function listProcsHandler(argv, host) {
  const { procs } = probeProcesses(host, { type: 'procs' });

  if (argv.json) {
    console.log(JSON.stringify(procs, null, 2));
    return;
  }
  if (procs.length === 0) {
    console.log(`No running factories on ${host.name}.`);
    return;
  }
  console.log(formatTable(
    ['PID', 'FACTORY', 'MODE', 'PM2', 'PORT', 'UPTIME', 'STARTED'],
    procs.map((r) => [r.pid, r.factory, r.mode, r.pm2, r.port, r.uptime, r.started]),
  ));
}
