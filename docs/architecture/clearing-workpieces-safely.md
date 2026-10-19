# Clearing Workpieces Safely

`workpieces clear` is the only command that deletes factory data. The guards sit in two places, so a bug in one still leaves the other.

## Client (`src/cli/workpieces/clear.js`) picks and skips

- **Which bins:** `--bin done` → every station's `done`; `--bin finished` → each line's terminal `output` only. `--station` naming a non-terminal station with `finished` is an error, not a silent no-op.
- **One workpiece:** `clear <id>` (exact or unique substring) instead of `--bin` takes every `done` and terminal-`output` copy of that id. The match runs only over clearable bins, so an id that's still in flight is "no match", never a delete.
- **Age:** `--older-than <days>` drops anything active within that many days. Activity is the probe's `ages` query: the later of the folder's and its `log.jsonl`'s mtime — a move into `done` is a rename, which doesn't touch the folder's own mtime, but the station appends to the log. A folder that's gone by then is kept, not guessed at.
- **Kept bins:** `STATION/BIN` entries in the factory's config `keep` list are listed as `kept` and skipped.
- **Conveyor-drained bins:** any `STATION/BIN` that a `lib-factory:move_files` step names as `source_bin` (sub-bin included, matched on its first two segments) is skipped. Terminal is computed per line, but conveyors cross lines — factory-hooli moves `HI4/output` into line CI.
- **Dry run by default.** The table printed with and without `--yes` is the same; `--yes` only adds the delete.

## Probe (`remove` query) refuses

Checked for every dir before any is deleted; one bad dir fails the whole batch:

- inside `temp/stations/`;
- bin segment is `done` or `output`;
- not in the `keep` list the client sends;
- has a `pointer.json` — so a sub-bin or a stray dir is never removed as if it were a workpiece.

The probe can't know which `output` is terminal or which bins conveyors read — that needs the line model. Those two checks are client-only.

## Orphans are never cleared

A failed folder without `pointer.json` (seen in practice on several factories) is reported by the probe's `state` as `orphans` and shown by `count` and `errors`. `clear` can't reach it twice over: it's in `failed`, and the probe refuses any dir without `pointer.json`. Removing one is a deliberate act on the host.

## What counts doesn't match

`workpieces count` and `lines status` call terminal output FINISHED even when a conveyor still drains it, so `clear --bin finished` may delete fewer than `count` shows.

## Related Notes

- [0005 — Guarded clear of done and finished](/docs/decisions/0005-guarded-clear-of-done-and-finished.md)
- [Probe Does I/O, Client Does Logic](/docs/architecture/probe-does-io-client-does-logic.md)
- [Resolving the Target Host and Factory](/docs/architecture/resolving-the-target-host-and-factory.md)
