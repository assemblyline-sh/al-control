import { execFileSync } from 'node:child_process';

import { shellQuote, sshArgs } from '../src/transport.js';

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
});
