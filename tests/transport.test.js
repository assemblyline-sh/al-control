import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { remotePm2Command, shellQuote, sshArgs } from '../src/transport.js';

describe('shellQuote', () => {
  test.each([
    ['plain'],
    ['/home/a b/factory'],
    ["it's"],
    ['$(touch /tmp/pwned) `id` ; rm -rf ~'],
    [''],
  ])('round-trips %j through sh unchanged', (value) => {
    expect(execFileSync('sh', ['-c', `printf %s ${shellQuote(value)}`], { encoding: 'utf8' })).toBe(value);
  });
});

describe('sshArgs', () => {
  const host = { name: 'prod', is_local: false, ssh: 'prod-box', factories: {} };

  test('batch mode, -- before the destination, destination last', () => {
    const args = sshArgs(host);
    expect(args).toContain('BatchMode=yes');
    expect(args.slice(-2)).toEqual(['--', 'prod-box']);
    expect(args).not.toContain('-t');
  });

  test('tty only when asked', () => {
    expect(sshArgs(host, { tty: true })).toContain('-t');
  });

  describe('socket', () => {
    // Not os.tmpdir(): on macOS it's long enough to skip sharing by itself.
    let home;
    const controlPath = (args) => args.find((a) => a.startsWith('ControlPath='));

    beforeEach(() => {
      home = mkdtempSync('/tmp/al-');
    });
    afterEach(() => {
      rmSync(home, { recursive: true, force: true });
    });

    test('is named by a 12-character hash of the alias, the value control-room also tests', () => {
      expect(controlPath(sshArgs(host, { home }))).toBe(`ControlPath=${home}/.al/al-control/ssh-61399a89f694`);
    });

    test('differs per user on one host', () => {
      const bob = sshArgs({ ...host, ssh: 'bob@prod-box' }, { home });
      const carol = sshArgs({ ...host, ssh: 'carol@prod-box' }, { home });
      expect(controlPath(bob)).not.toBe(controlPath(carol));
    });

    test('is shared up to a 54-character home, where ssh\'s temporary socket is 103', () => {
      const long_home = path.join(home, 'x'.repeat(54 - home.length - 1));
      expect(controlPath(sshArgs(host, { home: long_home }))).toBeDefined();
    });

    test('is skipped past that, so ssh never sees a path it would refuse', () => {
      const long_home = path.join(home, 'x'.repeat(55 - home.length - 1));
      const args = sshArgs(host, { home: long_home });
      expect(controlPath(args)).toBeUndefined();
      expect(args).not.toContain('ControlMaster=auto');
    });
  });
});

describe('remotePm2Command', () => {
  // Runs the command the way sshd would (`sh -c`), against a fake home whose
  // ~/.profile puts ~/.local/bin on PATH and a fake pm2 there that prints its
  // working dir, PATH and args.
  let home;
  const run = (host, args, cwd) =>
    execFileSync('sh', ['-c', remotePm2Command(host, args, cwd)], {
      encoding: 'utf8',
      env: { HOME: home, SHELL: '/bin/sh', PATH: '/usr/bin:/bin' },
    });

  beforeEach(() => {
    home = mkdtempSync(path.join(tmpdir(), 'al-control-home-'));
    mkdirSync(path.join(home, '.local', 'bin'), { recursive: true });
    mkdirSync(path.join(home, 'nvm-bin'));
    mkdirSync(path.join(home, "factory o'brien"));
    writeFileSync(path.join(home, '.profile'), 'PATH="$HOME/.local/bin:$PATH"\n');
    const fake_pm2 = path.join(home, '.local', 'bin', 'pm2');
    writeFileSync(fake_pm2, '#!/bin/sh\necho "cwd=$(pwd)"\necho "path=$PATH"\nfor a in "$@"; do echo "arg=$a"; done\n');
    chmodSync(fake_pm2, 0o755);
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  const host = { name: 'prod', is_local: false, ssh: 'prod-box', factories: {} };

  test("runs pm2 in a login shell, so ~/.profile's PATH (~/.local/bin) reaches the factory", () => {
    const out = run(host, ['start', 'src/index.js', '--name', 'factory-tech']);
    // /etc/profile may add system dirs after it (macOS's path_helper does).
    expect(out).toContain(`path=${home}/.local/bin:`);
    expect(out).toContain('arg=start\narg=src/index.js\narg=--name\narg=factory-tech');
  });

  test("puts the host's node dir first, inside the login shell, and runs from cwd", () => {
    const cwd = path.join(home, "factory o'brien");
    const out = run({ ...host, node: path.join(home, 'nvm-bin', 'node') }, ['start', 'a b.js'], cwd);
    expect(out).toContain(`cwd=${cwd}`);
    expect(out).toContain(`path=${home}/nvm-bin:${home}/.local/bin:`);
    expect(out).toContain('arg=a b.js');
  });

  test('passes shell syntax in arguments through as plain text', () => {
    expect(run(host, ['logs', '$(id); `id`'])).toContain('arg=$(id); `id`');
  });
});
