# 0001 — al-control is a separate CLI. al-factory is not reshaped.

- **Status:** Accepted — 2026-10-10 (recorded retroactively; the choice was made 2026-10-09)
- **Decider(s):** Alex
- **Reversibility:** Two-way door
- **Scope:** where multi-host watching and pm2 control live

## Decision

Watching and operating factories across hosts is a new CLI, `al-control`. [`al-factory`](https://github.com/assemblyline-sh/al-factory) stays as it is: the in-repo tool for developing and running steps. Both coexist until one is retired; which one is not decided.

## Why

- `al-factory` is built around the current directory — steps, `.env`, `node_modules/@assemblyline/lib-factory`, `temp/` all resolve from `process.cwd()`. Reaching other hosts and naming factories explicitly changes its core assumption, not a flag.
- `al-factory` is published and used for step development. Reshaping it risks that workflow for a use case whose shape was still unclear.
- A separate CLI can drop what doesn't belong in a remote operations tool (see [0004](/docs/decisions/0004-no-destructive-or-step-running-commands.md)).

Rejected: adding `-f` / `--host` to `al-factory`. Strongest case for it — one tool to learn, no duplicated code. Lost because the cwd assumption runs through steps and `.env` loading, and the reshaped tool would serve two audiences badly.

## Honest costs

- **Two CLIs overlap** on lines, stations, workpieces and procs; users must know which to reach for.
- **Duplicated code by copy** — fixes don't propagate ([Code Copied From al-factory](/docs/architecture/code-copied-from-al-factory.md)). Accepted.

## Revisit when

- Either CLI goes a month without use for its overlapping commands.
- A line-state bug is fixed in one copy and found again in the other.

## Review

## Related

- `docs/wip/al-control-cli.md` — the exploration this concludes
- [0002 — Remote hosts run a piped probe](/docs/decisions/0002-remote-hosts-run-a-piped-probe.md)
