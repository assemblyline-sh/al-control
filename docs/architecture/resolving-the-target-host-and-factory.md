# Resolving the Target Host and Factory

Every command acts on one host; per-factory commands also need one factory. `resolveHost()` / `resolveFactory()` / `resolveFactories()` in `src/config.js`.

## Precedence

- **Host:** `--host` > `current_host` in config. Neither → error listing configured hosts.
- **Factory:** `-f <name>`, looked up in *that host's* `factories` map. No fallback — not the current directory, not a host's only factory.
- **Host-wide commands that narrow** (`workpieces count`, `workpieces errors`): every factory on the host, or only the `-f` one. Still explicit — "all" or "this one", never a guess. A missing factory dir is skipped with a warning when scanning all, an error when named.

## Factory entries

A factory is a path, or `{path, keep}`. `resolveHost()` flattens both into `factories` (name → path) and `keep` (name → `STATION/BIN` list), so only `workpieces clear` sees the difference. `saveConfig()` (via `hosts use`) rewrites the file with `yaml.dump`, which drops comments.

## Paths are host paths

A factory path is interpreted on its host. The client never touches it: the probe resolves `~` and checks existence there, and returns the absolute `root` that later pm2 commands `cd` into. `ghost: ~/nope` errors as `Factory directory does not exist: /Users/me/nope` from the probe, not from config validation.

## Validation that guards the transport

- `local` must not have `ssh`; every other host must.
- An `ssh` alias may not start with `-` — ssh would parse it as an option (`-oProxyCommand=…`).

## Where am I acting?

On a non-local host each command prints `→ host` or `→ host / factory` to stderr before running — visible in a terminal, invisible to `--json` consumers.

Hints printed by handlers ("Run `al-control lines status …`") reuse `factory.flags`: `-f <name>`, plus `--host <name>` when the host was overridden, so a copied hint targets the same place.

## Config dir override

`AL_CONTROL_CONFIG_DIR` replaces `~/.assemblyline/al-control/` for the config file (tests use it). SSH sockets ignore it — see [SSH Connection Sharing](/docs/architecture/ssh-connection-sharing.md).

## Related Notes

- [0003 — One current host; `-f` always required](/docs/decisions/0003-one-current-host-and-w-always-required.md)
- [How a Probe Call Reaches a Remote Host](/docs/architecture/remote-probe-transport.md)
- [Matching Factories to pm2 Processes](/docs/architecture/matching-factories-to-pm2-processes.md)
