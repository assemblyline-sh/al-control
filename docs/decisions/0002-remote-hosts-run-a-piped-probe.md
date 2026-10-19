# 0002 — Remote hosts run a piped probe. Nothing is installed on them.

- **Status:** Accepted — 2026-10-10 (recorded retroactively; the choice was made 2026-10-09)
- **Reversibility:** Two-way door
- **Scope:** how al-control reads and controls factories on SSH hosts

## Decision

For a remote host, al-control pipes `src/probe.js` over the system `ssh` to the host's `node` and reads one JSON envelope back. pm2 actions run as plain `ssh … pm2 …`. The host needs only `node` and `pm2` — no al-control install, no config file.

## Why

- **Nothing to install or upgrade on hosts.** Factory hosts already have `node` and `pm2`; the probe travels with the client, so client and host code can't drift apart.
- **One code path.** Locally the same `runQuery()` runs in-process ([Probe Does I/O, Client Does Logic](/docs/architecture/probe-does-io-client-does-logic.md)).
- **SSH as-is.** Aliases, `ProxyJump`, keys and Tailscale SSH work without new auth.
- Worked first time against build-box (2026-10-09): `factories list`, `lines status`, `workpieces show`, `--watch`, `procs stop/start/restart`.

Rejected:
- **Install al-control on each host, run `ssh host al-control … --json`.** Strongest alternative — the remote CLI is also usable when SSH'd in. Lost on install/upgrade per host and version skew between client and host.
- **A daemon/agent on each host** (HTTP over an SSH tunnel). Faster and could push changes, but adds a process to deploy, supervise and secure. Not needed at current call rates.
- **Mount the remote filesystem (sshfs).** Reads files but can't run pm2 or `ps`.

## Honest costs

- **The probe must stay one dependency-free, Node 18-compatible file.** Accepted.
- **~0.2s per call** even with [connection sharing](/docs/architecture/ssh-connection-sharing.md); polling many factories from the control-room app multiplies this.
- **nvm hosts need a `node:` path in config** ([node and pm2 Over Non-Interactive SSH](/docs/architecture/node-and-pm2-over-non-interactive-ssh.md)).

## Revisit when

- The probe needs a non-built-in dependency.
- control-room polls enough factories that per-call SSH cost is felt in the UI.
- A factory host runs without `node` on any path.

## Review

## Related

- `docs/wip/al-control-cli.md` — the exploration this concludes
- [How a Probe Call Reaches a Remote Host](/docs/architecture/remote-probe-transport.md)
- [0001 — al-control is a separate CLI](/docs/decisions/0001-separate-cli-not-a-reshaped-al-factory.md)
