import { spawnSync } from 'node:child_process';

import { shell } from '../../transport.js';
import { workpiecePath } from '../../utils/factory-data.js';
import { resolveOneWorkpiece } from './_resolve.js';

/**
 * `al-control workpieces open <id> -f <factory>` — local: the folder in
 * Finder (xdg-open on Linux). Remote: an interactive shell on the host,
 * started in the folder; exit it to come back.
 *
 * @param {{id: string}} argv
 * @param {import('../../config.js').FactoryContext} factory
 */
export async function openHandler(argv, factory) {
  const { root, rel } = resolveOneWorkpiece(factory, argv.id);
  const dir = workpiecePath(root, rel);
  if (factory.host.is_local) {
    const res = spawnSync(process.platform === 'darwin' ? 'open' : 'xdg-open', [dir], { stdio: 'inherit' });
    if (res.error || res.status !== 0) console.log(dir);
    return;
  }
  console.error(`Shell in ${dir} on ${factory.host.name} — exit to return.`);
  shell(factory.host, dir);
}
