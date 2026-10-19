# 0003 — One current host; `-f` always required. The current directory is never used.

- **Status:** Accepted — 2026-10-10 (recorded retroactively; the choice was made 2026-10-09)
- **Decider(s):** Alex
- **Reversibility:** Two-way door
- **Scope:** how every command picks its host and factory

## Decision

- Commands target one host: `current_host` from config (`hosts use`), or `--host` for a single command. No command spans hosts.
- Per-factory commands require `-f <name>`. No inference from the current directory, no default when a host has one factory.

## Why

- **Same answer from anywhere.** A command means the same thing whichever directory you run it in — necessary once the factory may be on another machine.
- **No silent wrong target.** Inference rules (cwd → only factory → error) were judged too much to hold in your head when the target may be prod.
- **kubectl's model:** one context at a time is familiar and keeps output about one machine.

Rejected: a precedence chain of `-f`, then the cwd repo, then the host's only factory. Strongest case — inside a factory repo on `local`, typing `-f` is redundant. Lost because which rule fired is invisible, and with `current_host` pointing at prod, a cwd match could act on the wrong machine.

## Honest costs

- **More typing:** `-f <name>` on every per-factory command, even with one factory configured. Accepted.
- **No fleet view:** seeing all hosts at once takes one command per host.

## Revisit when

- A routine task needs the same command run across several hosts.

## Review

## Related

- [Resolving the Target Host and Factory](/docs/architecture/resolving-the-target-host-and-factory.md)
- `docs/wip/al-control-cli.md`
