# Code Copied From al-factory

The read and pm2 logic is copied from [`al-factory`](https://github.com/assemblyline-sh/al-factory/tree/main/src), not imported. Either CLI may be retired independently, and the [CLI standard](https://github.com/alexjv89/engineering-standards/blob/main/cli/README.md) prefers copying proven files over a shared package.

**Consequence: fixes don't propagate.** A bug fixed in one copy of the line-state rules (position priority, terminal detection, sub-bin scan depth) likely exists in the other.

## Where each piece went

| al-factory | al-control |
|---|---|
| `utils/station-files.js` (read functions) | `src/probe.js` |
| `utils/line-state.js` — bin scan, log read | `src/probe.js` |
| `utils/line-state.js` — topo sort, terminal, positions, summaries | `src/utils/line-state.js` |
| `utils/factory-processes.js` | `src/probe.js` (`listRunningFactories`) |
| `utils/format.js`, `utils/watch-render.js`, `cli/_helpers.js` | same paths |
| `cli/lines/*`, `cli/stations/status.js`, `cli/workpieces/*`, `cli/procs/*` | same paths; handlers take `(argv, factory)` |

Every `process.cwd()` became an explicit factory root.

## Output parity

`--json` of `lines status`, `lines list`, `lines show <line>`, `lines status <line>`, `stations status <code>` was byte-identical to al-factory's on factory-acme (2026-10-09). Deliberate differences:

- `workpieces list/show --json`: `link` → `folder`. On a remote host it's `host:/abs/path`, not a `file://` URL.
- `--watch` has no `-f` alias; `-f` is `--factory`.
- No `.env` loading — nothing here reads the factory's environment.

## Related Notes

- [Probe Does I/O, Client Does Logic](/docs/architecture/probe-does-io-client-does-logic.md)
- [Matching Factories to pm2 Processes](/docs/architecture/matching-factories-to-pm2-processes.md)
- [0001 — al-control is a separate CLI](/docs/decisions/0001-separate-cli-not-a-reshaped-al-factory.md)
