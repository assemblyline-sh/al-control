/**
 * Config store — ~/.assemblyline/al-control/config.yml — and resolution of which host
 * and factory the current command targets.
 *
 * Shape:
 *   current_host: local
 *   hosts:
 *     local:
 *       factories:
 *         factory-acme: ~/factories/factory-acme
 *     build-box:
 *       ssh: build-box        # alias from ~/.ssh/config
 *       node: /home/me/.nvm/versions/node/v20.11.0/bin/node   # optional
 *       factories:
 *         factory-acme: /home/me/factories/factory-acme
 *         factory-demo:                # long form, to protect bins from `workpieces clear`
 *           path: /home/me/factories/factory-demo
 *           keep: [DI1/done]
 *
 * `local` is reserved for this machine and has no `ssh`. Every other host
 * must have one. Factory paths are paths on that host (`~` expands there).
 *
 * Override the directory with AL_CONTROL_CONFIG_DIR (used by tests).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';

export const LOCAL_HOST = 'local';

/** @returns {string} */
export function configDir() {
  return process.env.AL_CONTROL_CONFIG_DIR || join(homedir(), '.assemblyline', 'al-control');
}

/** @returns {string} */
export function configPath() {
  return join(configDir(), 'config.yml');
}

const EXAMPLE = `current_host: local
hosts:
  local:
    factories:
      factory-acme: ~/path/to/factory-acme
  my-server:
    ssh: my-server              # alias from ~/.ssh/config
    factories:
      factory-acme: /home/me/factories/factory-acme`;

/**
 * @typedef {object} HostConfig
 * @property {string} [ssh] - ssh alias / destination; absent for `local`
 * @property {string} [node] - absolute path to `node` on the host; its dir is
 *   prepended to PATH so `pm2` resolves too
 * @property {Object<string, string|FactoryEntry>} factories - factory name → path
 *   on the host, or the long form
 */

/**
 * @typedef {object} FactoryEntry
 * @property {string} path
 * @property {string[]} [keep] - `STATION/BIN` bins `workpieces clear` refuses
 */

/**
 * Either form of a factory entry, as `{path, keep}`.
 * @param {string|FactoryEntry} entry
 * @returns {{path: string, keep: string[]}}
 */
export function factoryEntry(entry) {
  return typeof entry === 'string' ? { path: entry, keep: [] } : { path: entry.path, keep: entry.keep ?? [] };
}

/**
 * @typedef {object} Config
 * @property {string|null} current_host
 * @property {Object<string, HostConfig>} hosts
 */

/**
 * Load and validate the config. Throws with an example when missing.
 * @returns {Config}
 */
export function loadConfig() {
  const file = configPath();
  if (!existsSync(file)) {
    throw new Error(`No config at ${file}. Create it, for example:\n\n${EXAMPLE}`);
  }
  const raw = yaml.load(readFileSync(file, 'utf8')) || {};
  const cfg = { current_host: raw.current_host ?? null, hosts: raw.hosts ?? {} };

  for (const [name, host] of Object.entries(cfg.hosts)) {
    if (!host || typeof host !== 'object') throw new Error(`Host '${name}' in ${file} must be a mapping.`);
    host.factories = host.factories ?? {};
    if (name === LOCAL_HOST && host.ssh) {
      throw new Error(`Host 'local' in ${file} is this machine and must not have an 'ssh' key.`);
    }
    if (name !== LOCAL_HOST) {
      if (typeof host.ssh !== 'string' || !host.ssh) throw new Error(`Host '${name}' in ${file} needs an 'ssh' alias.`);
      // A leading dash would be parsed by ssh as an option.
      if (host.ssh.startsWith('-')) throw new Error(`Host '${name}' has an invalid ssh alias '${host.ssh}'.`);
    }
    for (const [w, entry] of Object.entries(host.factories)) {
      const ok = typeof entry === 'string'
        || (entry && typeof entry.path === 'string' && (entry.keep === undefined || (Array.isArray(entry.keep) && entry.keep.every((k) => /^[^/]+\/(done|output)$/.test(k)))));
      if (!ok) throw new Error(`Factory '${w}' on host '${name}' in ${file} must be a path, or {path, keep: [STATION/done|output, ...]}.`);
    }
  }
  return cfg;
}

/** @param {Config} cfg */
export function saveConfig(cfg) {
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(configPath(), yaml.dump(cfg), { mode: 0o600 });
}

/**
 * @param {string} name
 * @returns {Config}
 */
export function useHost(name) {
  const cfg = loadConfig();
  if (!cfg.hosts[name]) {
    throw new Error(`No host named '${name}'. Configured: ${Object.keys(cfg.hosts).join(', ') || '(none)'}`);
  }
  cfg.current_host = name;
  saveConfig(cfg);
  return cfg;
}

/**
 * @typedef {object} HostContext
 * @property {string} name
 * @property {boolean} is_local
 * @property {string} [ssh]
 * @property {string} [node]
 * @property {Object<string, string>} factories - factory name → path on the host
 * @property {Object<string, string[]>} keep - factory name → bins to never clear
 */

/**
 * Resolve the target host: `--host` beats `current_host`.
 * @param {{host?: string}} argv
 * @returns {HostContext}
 */
export function resolveHost(argv) {
  const cfg = loadConfig();
  const name = argv.host || cfg.current_host;
  if (!name) {
    throw new Error(`No host selected. Run \`al-control hosts use <name>\` or pass --host. Configured: ${Object.keys(cfg.hosts).join(', ') || '(none)'}`);
  }
  const host = cfg.hosts[name];
  if (!host) {
    throw new Error(`No host named '${name}' in ${configPath()}. Configured: ${Object.keys(cfg.hosts).join(', ') || '(none)'}`);
  }
  const factories = {};
  const keep = {};
  for (const [w, entry] of Object.entries(host.factories)) ({ path: factories[w], keep: keep[w] } = factoryEntry(entry));
  return { name, is_local: name === LOCAL_HOST, ssh: host.ssh, node: host.node, factories, keep };
}

/**
 * @typedef {object} FactoryContext
 * @property {HostContext} host
 * @property {string} name
 * @property {string} path - path on the host as configured (may start with `~`)
 * @property {string[]} keep - bins `workpieces clear` refuses
 * @property {string} flags - `-f <name>` (plus `--host` when overridden), for
 *   "run this next" hints
 */

/**
 * Resolve host + the `-f` factory on it. `-f` is always required — the current
 * directory is never consulted.
 * @param {{host?: string, factory?: string}} argv
 * @returns {FactoryContext}
 */
export function resolveFactory(argv) {
  const host = resolveHost(argv);
  const names = Object.keys(host.factories);
  if (!argv.factory) {
    throw new Error(`Specify a factory with -f <name>. Factories on ${host.name}: ${names.join(', ') || '(none)'}`);
  }
  const p = host.factories[argv.factory];
  if (!p) {
    throw new Error(`No factory '${argv.factory}' on host ${host.name}. Factories on ${host.name}: ${names.join(', ') || '(none)'}`);
  }
  return factoryContext(host, argv.factory, argv.host);
}

/**
 * Every factory on the host when no `-f` is given, else just that one — for
 * commands whose scope is "the host" but that can narrow to a factory.
 * @param {{host?: string, factory?: string}} argv
 * @returns {{host: HostContext, factories: FactoryContext[]}}
 */
export function resolveFactories(argv) {
  if (argv.factory) {
    const factory = resolveFactory(argv);
    return { host: factory.host, factories: [factory] };
  }
  const host = resolveHost(argv);
  return { host, factories: Object.keys(host.factories).map((name) => factoryContext(host, name, argv.host)) };
}

function factoryContext(host, name, host_flag) {
  const flags = `-f ${name}${host_flag ? ` --host ${host_flag}` : ''}`;
  return { host, name, path: host.factories[name], keep: host.keep[name], flags };
}
