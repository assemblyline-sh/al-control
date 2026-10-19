# Probe Does I/O, Client Does Logic

Every read of a host's filesystem or process table — and the one write, `remove` — goes through `src/probe.js`. Everything else — line grouping, topo order, positions, summaries, formatting — runs on the client.

The split exists so the probe can be shipped to a remote host verbatim (see [How a Probe Call Reaches a Remote Host](/docs/architecture/remote-probe-transport.md)). Locally the client calls the same `runQuery()` in-process, so local and remote share one code path.

## Rules for `src/probe.js`

- **Imports only `node:` built-ins.** Nothing from this package, nothing from `node_modules`. The file runs alone on the host; an import fails at load, before `main()` can write an envelope, and surfaces as `Unexpected output from <host> (exit 1)`.
- **Returns plain JSON.** No `Map`s, no class instances, no formatted strings. `buildLineState()` in `src/utils/line-state.js` turns bin listings back into `Map`s client-side.
- **Writes nothing to stdout** except the envelope from `main()`. stdout is the data channel.
- **Stays Node 18-compatible.** A host's `/usr/bin/node` can be old (a stock Ubuntu one is v18).
- **Contains every path.** Workpiece dirs go through `stationsPath()` (must stay under `temp/stations/`); file reads must stay inside the workpiece dir. Paths come from the client, and a probe bug is a prod bug.
- **Re-checks before it writes.** `remove` doesn't trust the client's selection — see [Clearing Workpieces Safely](/docs/architecture/clearing-workpieces-safely.md).
- **Resolves `~` itself.** Config paths are host paths; only the host knows its home dir. The resolved `root` comes back in every factory query.

## Round trips

Each `probe()` call is one `ssh` exec on a remote host (~0.2s with [connection sharing](/docs/architecture/ssh-connection-sharing.md)). Batch instead of looping:

- `logs` takes a list of workpiece dirs — `workpieces list` reads every log in one call.
- `factories` returns configured roots *and* the process list — `procs start/stop` need one call to decide.
- `workpieces watch` costs two calls per tick: `state`, then `logs` for the tracked set.
- `counts` covers several factories in one call and returns only numbers — for pollers (control-room's rail refreshes it every ~2s), not used by the CLI.
- `workpieces errors` reads every failed workpiece's `error.json` in one `errors` call per factory — summaries only (no stack, message capped), since a single error can carry a whole HTML page.

## Adding a query

Add a `case` to `runQuery()`, extend the `ProbeQuery` typedef, call it via `probe(host, query)`. `tests/probe.test.js` runs queries both in-process and through `node -` on stdin — cover the new one in both.

## Related Notes

- [How a Probe Call Reaches a Remote Host](/docs/architecture/remote-probe-transport.md)
- [Code Copied From al-factory](/docs/architecture/code-copied-from-al-factory.md)
- [Clearing Workpieces Safely](/docs/architecture/clearing-workpieces-safely.md)
- [0002 — Remote hosts run a piped probe](/docs/decisions/0002-remote-hosts-run-a-piped-probe.md)
