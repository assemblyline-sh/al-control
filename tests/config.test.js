import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { loadConfig, resolveHost, resolveFactory, resolveFactories, useHost } from '../src/config.js';

function writeConfig(yaml_text) {
  const dir = mkdtempSync(path.join(tmpdir(), 'al-control-cfg-'));
  writeFileSync(path.join(dir, 'config.yml'), yaml_text);
  process.env.AL_CONTROL_CONFIG_DIR = dir;
  return dir;
}

const VALID = `current_host: local
hosts:
  local:
    factories:
      factory-a: ~/factories/factory-a
  prod:
    ssh: prod-box
    factories:
      factory-b: /srv/factory-b
`;

afterEach(() => {
  delete process.env.AL_CONTROL_CONFIG_DIR;
});

describe('loadConfig', () => {
  test('missing file throws with an example config', () => {
    process.env.AL_CONTROL_CONFIG_DIR = mkdtempSync(path.join(tmpdir(), 'al-control-empty-'));
    expect(() => loadConfig()).toThrow(/No config at .*current_host: local/s);
  });

  test('local host must not have ssh', () => {
    writeConfig('hosts:\n  local:\n    ssh: x\n');
    expect(() => loadConfig()).toThrow(/must not have an 'ssh' key/);
  });

  test('remote host needs ssh', () => {
    writeConfig('hosts:\n  prod:\n    factories: {}\n');
    expect(() => loadConfig()).toThrow(/needs an 'ssh' alias/);
  });

  test('ssh alias starting with a dash is rejected', () => {
    writeConfig('hosts:\n  prod:\n    ssh: -oProxyCommand=evil\n');
    expect(() => loadConfig()).toThrow(/invalid ssh alias/);
  });

  test('host without factories gets an empty map', () => {
    writeConfig('hosts:\n  prod:\n    ssh: prod-box\n');
    expect(loadConfig().hosts.prod.factories).toEqual({});
  });
});

describe('resolveHost', () => {
  test('defaults to current_host', () => {
    writeConfig(VALID);
    expect(resolveHost({})).toMatchObject({ name: 'local', is_local: true });
  });

  test('--host overrides current_host', () => {
    writeConfig(VALID);
    expect(resolveHost({ host: 'prod' })).toMatchObject({ name: 'prod', is_local: false, ssh: 'prod-box' });
  });

  test('unknown host lists configured ones', () => {
    writeConfig(VALID);
    expect(() => resolveHost({ host: 'nope' })).toThrow(/Configured: local, prod/);
  });

  test('no current host and no --host', () => {
    writeConfig('hosts:\n  local:\n    factories: {}\n');
    expect(() => resolveHost({})).toThrow(/No host selected/);
  });
});

describe('resolveFactory', () => {
  test('-f is required, even with a single factory', () => {
    writeConfig(VALID);
    expect(() => resolveFactory({})).toThrow(/Specify a factory with -f <name>\. Factories on local: factory-a/);
  });

  test('factory must exist on the target host', () => {
    writeConfig(VALID);
    expect(() => resolveFactory({ factory: 'factory-b' })).toThrow(/No factory 'factory-b' on host local/);
  });

  test('resolves on the overridden host and carries --host in hint flags', () => {
    writeConfig(VALID);
    const w = resolveFactory({ factory: 'factory-b', host: 'prod' });
    expect(w).toMatchObject({ name: 'factory-b', path: '/srv/factory-b', flags: '-f factory-b --host prod' });
    expect(w.host.name).toBe('prod');
  });
});

describe('useHost', () => {
  test('persists current_host', () => {
    const dir = writeConfig(VALID);
    useHost('prod');
    expect(readFileSync(path.join(dir, 'config.yml'), 'utf8')).toMatch(/current_host: prod/);
    expect(resolveHost({}).name).toBe('prod');
  });

  test('unknown host is rejected', () => {
    writeConfig(VALID);
    expect(() => useHost('nope')).toThrow(/No host named 'nope'/);
  });
});

describe('long-form factory entries', () => {
  test('path + keep resolve; short form gets an empty keep list', () => {
    writeConfig('current_host: local\nhosts:\n  local:\n    factories:\n      a: ~/a\n      b:\n        path: ~/b\n        keep: [DI1/done, VM5/output]\n');
    expect(resolveHost({}).factories).toEqual({ a: '~/a', b: '~/b' });
    expect(resolveFactory({ factory: 'b' }).keep).toEqual(['DI1/done', 'VM5/output']);
    expect(resolveFactory({ factory: 'a' }).keep).toEqual([]);
  });

  test('keep entries must be STATION/done or STATION/output', () => {
    writeConfig('hosts:\n  local:\n    factories:\n      b:\n        path: ~/b\n        keep: [DI1/failed]\n');
    expect(() => loadConfig()).toThrow(/must be a path, or \{path, keep/);
  });
});

describe('resolveFactories', () => {
  test('every factory without -f, one with it', () => {
    writeConfig('current_host: local\nhosts:\n  local:\n    factories:\n      a: ~/a\n      b: ~/b\n');
    expect(resolveFactories({}).factories.map((w) => w.name)).toEqual(['a', 'b']);
    expect(resolveFactories({ factory: 'b' }).factories.map((w) => w.name)).toEqual(['b']);
  });
});
