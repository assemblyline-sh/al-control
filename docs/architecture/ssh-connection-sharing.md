# SSH Connection Sharing

The first remote command opens one SSH connection and leaves it running in the background; later commands to the same host reuse it. It closes after 10 minutes unused.

Set in `sshArgs()` (`src/transport.js`): `ControlMaster=auto`, `ControlPersist=10m`, `ControlPath=~/.al/al-control/ssh-<hash>`, where `<hash>` is the first 12 characters of the SHA-256 of the host's `ssh:` value. control-room builds the same name, so the two share a connection.

## Why

- **Speed.** A fresh connection over Tailscale takes ~1s; a call through the shared one ~0.2s (measured over Tailscale). `--watch` calls every second.
- **One auth.** A Tailscale SSH check or key prompt happens when the connection opens, not on every command.

## Socket location

Sockets always live under `$HOME/.al/al-control/`, even when `AL_CONTROL_CONFIG_DIR` points elsewhere. Unix socket paths cap at 104 bytes, and ssh first binds a temporary socket 17 characters longer (`<path>.XXXXXXXXXXXXXXXX`); a deep override dir made ssh fail with `ControlPath too long`. That cap is why the root is the short `.al` ([decision 0007](/docs/decisions/0007-config-root-is-dot-al.md)) and why the name isn't ssh's `%C`, which is always 40 characters. If the `$HOME` path is over 54 characters, sharing is skipped.

## Living with it

- `ps` shows the shared connection as `ssh: …/ssh-<hash> [mux]`. Expected; it is not a leaked command.
- **It is pre-authenticated.** While open, any process running as you can open sessions through the socket (owner-only permissions).
- **It can go stale** after sleep or a network change: the next command may hang briefly or fail once; rerunning opens a fresh connection. The same goes for an edit to the alias in `~/.ssh/config`: calls keep using the open connection until it closes.
- **Close it** — e.g. to force a new Tailscale check:
  ```bash
  ssh -O exit -o ControlPath=$HOME/.al/al-control/ssh-$(printf %s <alias> | shasum -a 256 | cut -c1-12) <alias>
  ```

## Related Notes

- [How a Probe Call Reaches a Remote Host](/docs/architecture/remote-probe-transport.md)
- [Probe Does I/O, Client Does Logic](/docs/architecture/probe-does-io-client-does-logic.md) — why call count matters
