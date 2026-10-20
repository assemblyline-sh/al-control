/**
 * Transport — runs probe queries and pm2 commands on a host.
 *
 * - `local`: probe runs in-process; pm2 via execFileSync.
 * - remote: the system `ssh` binary (so ~/.ssh/config aliases, ProxyJump,
 *   keys and the agent all apply). Probe queries pipe probe.js on stdin to
 *   `node -`, so the host needs only node and pm2 — no al-control install,
 *   no config file, and client and probe are always the same version.
 *
 * The remote command string is interpreted by the host's shell, so every
 * interpolated value goes through shellQuote().
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import { runQuery } from './probe.js';

const PROBE_SOURCE = readFileSync(new URL('./probe.js', import.meta.url), 'utf8');

/**
 * POSIX single-quote a string for the remote shell (works in sh, bash, zsh).
 * @param {string} s
 * @returns {string}
 */
export function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

/**
 * ssh argv up to and including the destination.
 *
 * BatchMode: fail instead of hanging on a password prompt. ControlMaster +
 * ControlPersist: reuse one connection across calls so watch loops don't pay
 * a handshake per tick. `--` stops option parsing before the alias.
 *
 * @param {import('./config.js').HostContext} host
 * @param {{tty?: boolean}} [opts]
 * @returns {string[]}
 */
export function sshArgs(host, { tty = false } = {}) {
  // Sockets live under the home dir even when AL_CONTROL_CONFIG_DIR points
  // elsewhere: unix socket paths cap at 104 bytes, and %C expands to 40 hex
  // chars. If even that is too long, go without multiplexing.
  const socket_dir = path.join(homedir(), '.assemblyline', 'al-control');
  const control_path = path.join(socket_dir, 'ssh-%C');
  const multiplex = control_path.length - 2 + 40 < 104;
  if (multiplex) mkdirSync(socket_dir, { recursive: true });
  return [
    '-o', 'BatchMode=yes',
    ...(multiplex ? ['-o', 'ControlMaster=auto', '-o', `ControlPath=${control_path}`, '-o', 'ControlPersist=10m'] : []),
    ...(tty ? ['-t'] : []),
    '--', host.ssh,
  ];
}

/**
 * Non-interactive SSH shells skip .bashrc/.zshrc, so nvm-installed node/pm2
 * are often off PATH. A configured `node:` path fixes both: its directory is
 * prepended to PATH, and pm2 (a node script) lives alongside it.
 * @param {import('./config.js').HostContext} host
 */
function remoteEnvPrefix(host) {
  return host.node ? `PATH=${shellQuote(path.posix.dirname(host.node))}:"$PATH" ` : '';
}

function remoteNode(host) {
  return host.node ? shellQuote(host.node) : 'node';
}

/**
 * Run a probe query on the host.
 * @param {import('./config.js').HostContext} host
 * @param {import('./probe.js').ProbeQuery} query
 * @returns {any} The query's result
 */
export function probe(host, query) {
  if (host.is_local) return runQuery(query);

  // The query rides in the piped script, not in argv: a long dir list would
  // exceed Linux's 128 KB per-argument limit.
  const remote_cmd = `${remoteEnvPrefix(host)}${remoteNode(host)} --input-type=module -`;
  // stderr goes straight to the terminal: ssh (or Tailscale SSH's check mode)
  // may print an auth prompt / login URL there and wait for the user. Captured,
  // it would look like a hang. It also means ssh's own errors show verbatim.
  const res = spawnSync('ssh', [...sshArgs(host), remote_cmd], {
    input: `${PROBE_SOURCE}\nmain(${JSON.stringify(query)});\n`,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  // EPIPE = ssh exited before reading the probe from stdin; its message is above.
  if (res.error && res.error.code !== 'EPIPE') throw new Error(`Could not run ssh: ${res.error.message}`);
  if (res.status === 255) throw new Error(`ssh to ${host.name} (${host.ssh}) failed — see ssh's message above.`);
  if (res.status === 127) {
    throw new Error(`node not found on ${host.name}. Set 'node:' for this host in the config to its absolute path (e.g. the output of \`which node\` in an interactive shell there).`);
  }

  let envelope;
  try {
    envelope = JSON.parse(res.stdout);
  } catch {
    throw new Error(`Unexpected output from ${host.name} (exit ${res.status}):\n${res.stdout.slice(0, 2000)}`);
  }
  if (!envelope.ok) {
    const err = new Error(`${host.name}: ${envelope.error.message}`);
    err.code = envelope.error.code;
    throw err;
  }
  return envelope.data;
}

/**
 * How to make pm2 reachable on a host.
 * @param {import('./config.js').HostContext} host
 */
export function pm2Hint(host) {
  return host.is_local
    ? 'Install it with `npm i -g pm2`.'
    : `Set 'node:' for host ${host.name} in the config to the node that pm2 was installed with (\`which node\` in an interactive shell there), so its bin dir is on PATH.`;
}

/**
 * Probe a host's processes (`procs` or `factories` query). When pm2 couldn't be
 * queried, pm2-managed factories look like `direct` ones — warn instead of
 * letting that pass silently.
 * @param {import('./config.js').HostContext} host
 * @param {import('./probe.js').ProbeQuery} query
 */
export function probeProcesses(host, query) {
  const result = probe(host, query);
  if (!result.pm2_found) console.error(`Warning: pm2 not found on ${host.name}; pm2-managed factories will show as "direct". ${pm2Hint(host)}`);
  return result;
}

/**
 * The remote command for `pm2 <args>`, run in the user's login shell so the
 * factories pm2 starts get the PATH of a normal ssh session: ~/.profile adds
 * ~/.local/bin (claude, pipx, uv), ~/bin and the like. The `node:` dir goes
 * first, inside the login shell, because nvm loads from .bashrc, which a
 * login shell that isn't interactive skips.
 *
 * @param {import('./config.js').HostContext} host
 * @param {string[]} args - pm2 arguments
 * @param {string} [cwd] - absolute dir on the host
 * @returns {string}
 */
export function remotePm2Command(host, args, cwd) {
  const cd = cwd ? `cd ${shellQuote(cwd)} && ` : '';
  const inner = `${cd}${remoteEnvPrefix(host)}exec pm2 ${args.map(shellQuote).join(' ')}`;
  return `exec "\${SHELL:-/bin/sh}" -lc ${shellQuote(inner)}`;
}

/**
 * Run pm2 on the host with inherited stdio.
 *
 * @param {import('./config.js').HostContext} host
 * @param {string[]} args - pm2 arguments
 * @param {object} [opts]
 * @param {string} [opts.cwd] - absolute dir on the host to run from
 * @param {boolean} [opts.interactive] - long-running / TUI (logs, monit):
 *   Ctrl-C is a normal exit, and remote runs get a tty so it reaches pm2
 */
export function pm2(host, args, { cwd, interactive = false } = {}) {
  if (host.is_local) {
    try {
      execFileSync('pm2', args, { cwd, stdio: 'inherit' });
    } catch (err) {
      if (err.code === 'ENOENT') throw new Error(`pm2 not found. ${pm2Hint(host)}`);
      if (!interactive) throw new Error(`pm2 ${args[0]} failed (exit ${err.status})`);
    }
    return;
  }

  const remote_cmd = remotePm2Command(host, args, cwd);
  const tty = interactive && Boolean(process.stdin.isTTY);
  const res = spawnSync('ssh', [...sshArgs(host, { tty }), remote_cmd], { stdio: 'inherit' });

  if (res.error) throw new Error(`Could not run ssh: ${res.error.message}`);
  if (res.status === 255) throw new Error(`ssh to ${host.name} (${host.ssh}) failed`);
  if (res.status === 127) {
    throw new Error(`pm2 not found on ${host.name}. ${pm2Hint(host)}`);
  }
  if (res.status !== 0 && !interactive) throw new Error(`pm2 ${args[0]} on ${host.name} failed (exit ${res.status})`);
}

/**
 * Interactive login shell on the host, started in `cwd`. Login (`-l`) so the
 * user's PATH and nvm are set up as in a normal ssh session.
 * @param {import('./config.js').HostContext} host
 * @param {string} cwd - absolute dir on the host
 */
export function shell(host, cwd) {
  const remote_cmd = `cd ${shellQuote(cwd)} && exec "\${SHELL:-/bin/sh}" -l`;
  const res = spawnSync('ssh', [...sshArgs(host, { tty: true }), remote_cmd], { stdio: 'inherit' });
  if (res.error) throw new Error(`Could not run ssh: ${res.error.message}`);
  if (res.status === 255) throw new Error(`ssh to ${host.name} (${host.ssh}) failed`);
}
