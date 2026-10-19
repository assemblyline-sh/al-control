# 0005 — `workpieces clear` deletes done and finished workpieces, behind a dry run.

- **Status:** Accepted — 2026-10-10. Supersedes the empty-bins part of [0004](/docs/decisions/0004-no-destructive-or-step-running-commands.md).
- **Decider(s):** Alex
- **Reversibility:** Two-way door for the command; each delete is one-way
- **Scope:** which workpieces al-control may delete, and how

## Decision

`workpieces clear --bin done|finished -f <factory>` deletes workpiece folders from `done` bins or from a line's terminal-station `output`. It prints what it would delete and stops; `--yes` deletes. `-f` is required. `input`, `doing`, `failed` and non-terminal `output` can't be cleared.

Bins a factory depends on are protected by a per-factory `keep` list in the central config, and bins a conveyor still drains are skipped automatically. Mechanics: [Clearing Workpieces Safely](/docs/architecture/clearing-workpieces-safely.md).

## Why

- **Clearing is now routine.** Done bins and end-station outputs grow on prod; reviewing and clearing them periodically was 0004's revisit trigger.
- **Usually, nothing reads these bins.** `done` is a receipt of a forward move; terminal `output` is the end of a line. `failed` is excluded — it's the triage queue.
- **"Usually" isn't always, so there are guards.** Checked 2026-10-10: factory-initech dedups against `DI1/done/<sha>`; factory-acme's `VM5/output` is the only copy of each transcript; factory-hooli conveys `HI4/output` into another line. Hence the keep list and the conveyor check.
- **The probe refuses on its own.** Even a client bug can't delete outside `temp/stations/`, a folder without `pointer.json`, or anything not under `done`/`output`.

Rejected:
- **Archive (move to `temp/archive/`).** Undoable, but just moves the pile — disk still fills and something must clear the archive. Decided against.
- **Clear `failed` too.** Strongest case: a known-bad batch you've given up on. Lost because failed workpieces are the evidence `errors` and `show` read; deleting them should stay a deliberate act on the host.
- **Interactive y/N prompt.** Doesn't script; dry run + `--yes` does, and the dry run is the same output you'd read before typing `y`.
- **The factory declares its kept bins** (e.g. `assemblyline.keep_bins` in its `package.json`). Strongest case: the knowledge lives with the code, and every host gets it. Deferred, not rejected — the central config was quicker to land; revisit below.

## Honest costs

- **No undo.** A wrong `--yes` on prod loses those folders. Mitigated by the dry run, `-f` required, and the host banner.
- **The keep list lives apart from the code that needs it.** A new factory that uses `done` as a ledger isn't protected until someone adds it to each host's config.
- **Terminal output may be someone's inbox.** If a person reviews end-station output by hand, clearing it before review loses that. Clear `finished` only after review.

## Revisit when

- A bin is cleared that a factory reads in a way neither guard sees (not a `move_files` source, not in `keep`) — then the guards need a third rule.
- Periodic clearing needs age filters (`--older-than`).
- A keep list is missing on some host, or a second factory needs one — move it into the factory (`assemblyline.keep_bins`).

## Review

- 2026-10-10: `--older-than <days>` added (one revisit trigger above), and `clear <id>` for a single workpiece. Same guards; the decision stands.

## Related

- [0004 — No commands that delete factory data or run steps](/docs/decisions/0004-no-destructive-or-step-running-commands.md)
- `docs/wip/workpiece-triage-and-clearing.md`
