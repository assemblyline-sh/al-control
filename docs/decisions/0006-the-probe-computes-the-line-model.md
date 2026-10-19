# 0006 — The probe computes the line model; other apps vendor the probe, not a port.

- **Status:** Accepted — 2026-10-19. Amends [0002](/docs/decisions/0002-remote-hosts-run-a-piped-probe.md) (the probe was I/O only).
- **Decider(s):** Alex
- **Reversibility:** Two-way door
- **Scope:** where station order, terminal stations and line summaries are computed

## Decision

`src/probe.js` holds the line model: `topoSortStations`, `computeTerminal`, `groupLines` and `summarizeCounts`. The `lines` query returns every line's stations in order, terminal, live bin counts, orphan counts and summary, with no workpiece ids. The CLI imports the same functions (`src/utils/line-state.js` adds only the Map view and positions), and other apps run the probe instead of porting the logic.

The package exports the file as `@assemblyline/al-control/probe`. An app that bundles it (the control-room desktop app) pins an al-control version and checks in CI that its copy is byte-identical to that version's `probe.js`.

## Why

- **One copy.** The line model existed in five places (al-factory, fob-factory and vscode-helper in JS, fob-watch in Rust), and the JS copies had already drifted in six functions. A port drifts without anyone noticing; a vendored file with a byte check can't.
- **Cheap to poll.** On a factory with ~9,000 workpieces, `lines` returns 4 KB where `state` returns 403 KB (150 ms against 298 ms over SSH). A desktop rail that refreshes every 2 seconds needs the small one.
- **The probe already runs everywhere.** Locally in-process, remotely over `node -`. Running it for local hosts too costs a desktop app one Node call per refresh, the price 0002 already accepts for remote hosts.

## Rejected

- **Keep the probe I/O-only and port the logic to each client.** That is what drifted.
- **A shared npm package with the line model.** The probe must stay one file with no imports, so it can be piped to a host; a package it imports would break that.

## Consequences

- The probe grows by about 200 lines of pure functions. They follow the probe rules: `node:` built-ins only, plain JSON out, Node 18.
- `lines status` with no line uses `lines`; commands that need workpiece ids still use `state`.
- Error keys and the clear planner can move the same way when control-room needs them.
