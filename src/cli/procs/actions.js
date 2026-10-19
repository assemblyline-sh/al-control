import path from 'node:path';

import { probe, pm2, pm2Hint } from '../../transport.js';

/**
 * The factory's resolved root on its host, its package.json `main`, and the
 * running process for it (if any) — one probe round trip.
 *
 * pm2 process name = directory basename of the factory root, the same name
 * `al-factory procs start` and the control-room app use, so a factory started by
 * one is recognised by the others.
 *
 * @param {import('../../config.js').FactoryContext} factory
 */
function inspectFactory(factory) {
  const { factories: [w], procs, pm2_found } = probe(factory.host, { type: 'factories', paths: { [factory.name]: factory.path } });
  if (!w.exists) throw new Error(`Factory directory does not exist on ${factory.host.name}: ${w.root}`);
  if (!pm2_found) throw new Error(`pm2 not found on ${factory.host.name}. ${pm2Hint(factory.host)}`);
  const pm2_name = path.posix.basename(w.root);
  const running = procs.find((r) => r.cwd === w.root || r.pm2 === pm2_name) ?? null;
  return { root: w.root, main: w.main, pm2_name, running };
}

/**
 * The factory's pm2-managed process, or exit with why it can't be managed.
 * @param {import('../../config.js').FactoryContext} factory
 */
function requirePm2Process(factory) {
  const { running } = inspectFactory(factory);
  if (!running) {
    console.error(`Factory "${factory.name}" is not running on ${factory.host.name}.`);
    process.exit(1);
  }
  if (running.mode !== 'pm2') {
    console.error(`Factory "${factory.name}" (pid ${running.pid}) is running directly, not under pm2 — can't manage it this way.`);
    console.error(`Stop it on ${factory.host.name} manually: kill ${running.pid}`);
    process.exit(1);
  }
  return running;
}

/**
 * `al-control procs start -f <factory>` — start under pm2 from the factory root.
 * @param {object} argv
 * @param {import('../../config.js').FactoryContext} factory
 */
export async function startFactoryHandler(argv, factory) {
  const { root, main, pm2_name, running } = inspectFactory(factory);
  if (!main) {
    console.error(`${root} on ${factory.host.name} doesn't look like a factory repo (missing @assemblyline/lib-factory dependency or package.json "main").`);
    process.exit(1);
  }
  if (running) {
    console.error(`Factory "${factory.name}" is already running on ${factory.host.name} (pid ${running.pid}, mode ${running.mode}).`);
    console.error(`Use "al-control procs restart ${factory.flags}" instead.`);
    process.exit(1);
  }
  pm2(factory.host, ['start', main, '--name', pm2_name], { cwd: root });
}

/**
 * `al-control procs stop -f <factory>`
 * @param {object} argv
 * @param {import('../../config.js').FactoryContext} factory
 */
export async function stopFactoryHandler(argv, factory) {
  pm2(factory.host, ['stop', requirePm2Process(factory).pm2]);
}

/**
 * `al-control procs restart -f <factory>`
 * @param {object} argv
 * @param {import('../../config.js').FactoryContext} factory
 */
export async function restartFactoryHandler(argv, factory) {
  pm2(factory.host, ['restart', requirePm2Process(factory).pm2]);
}

/**
 * `al-control procs logs -f <factory>` — tail until Ctrl-C.
 * @param {object} argv
 * @param {import('../../config.js').FactoryContext} factory
 */
export async function logsFactoryHandler(argv, factory) {
  pm2(factory.host, ['logs', requirePm2Process(factory).pm2], { interactive: true });
}

/**
 * `al-control procs monit` — pm2's interactive CPU/RAM monitor on the host.
 * @param {object} argv
 * @param {import('../../config.js').HostContext} host
 */
export async function monitHandler(argv, host) {
  pm2(host, ['monit'], { interactive: true });
}
