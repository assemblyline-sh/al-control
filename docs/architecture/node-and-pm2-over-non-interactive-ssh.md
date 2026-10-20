# node and pm2 Over Non-Interactive SSH

`ssh host <cmd>` runs a non-interactive shell that skips `.bashrc` / `.zshrc`. nvm-installed `node` and `pm2` are usually not on its `PATH`.

On build-box: `/usr/bin/node` (v18) is on PATH, so the probe runs — but `pm2` exists only in `~/.nvm/versions/node/v22.21.0/bin`.

## Fix: per-host `node:`

```yaml
build-box:
  ssh: build-box
  node: /home/me/.nvm/versions/node/v22.21.0/bin/node
```

The probe runs with that `node`, and its directory is prepended to `PATH` for both probe and pm2 commands. pm2 must therefore live in the same bin dir — true for `npm i -g pm2` under that nvm version. Find the value with `which node` in an interactive shell on the host.

## pm2 runs in a login shell too

A login shell alone doesn't find nvm's node: `bash -lc` reads `.profile`, which typically
sources `.bashrc`, whose first lines return early for non-interactive shells, before nvm
loads. `bash -ic` prints job-control warnings without a TTY. So `node:` stays the way to
find node and pm2.

But a login shell is what gives a factory the PATH of a normal ssh session. `.profile`
adds `~/.local/bin` (where claude's installer, `pip install --user`, pipx and uv put their
binaries) and `~/bin`. A factory inherits the PATH of the `pm2 start` that launched it, so
without this, a step that runs `claude` fails with ENOENT on the host while working in your
own ssh session there. So pm2 commands run as:

```sh
exec "${SHELL:-/bin/sh}" -lc 'cd <root> && PATH=<dir of node:>:"$PATH" exec pm2 start …'
```

The `node:` dir goes inside the login shell, after `.profile` has run, so it stays first.
The probe doesn't need this and runs without it.

`restart` passes `--update-env`, or pm2 would restart with the environment it saved at the
first start. `start` and `restart` end with `pm2 save`, so the host's pm2 brings the factory
back after a reboot with the same environment.

## pm2 missing is never silent

Without pm2, `pm2 jlist` fails and pm2-managed factories are indistinguishable from directly-run `node` processes — they show as `running (direct)` with no CPU/RAM. The probe returns `pm2_found`:

- `factories list`, `procs list` → warning on stderr with the `node:` hint.
- `procs start / stop / restart / logs` → refuse, so nothing acts on a wrong reading.

## Related Notes

- [How a Probe Call Reaches a Remote Host](/docs/architecture/remote-probe-transport.md) — exit 127 handling
- [Matching Factories to pm2 Processes](/docs/architecture/matching-factories-to-pm2-processes.md)
