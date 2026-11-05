# 0008 — The move to `~/.al` leaves nothing behind. No `~/.assemblyline` symlink.

- **Status:** Accepted — 2026-11-05. Amends [0007](/docs/decisions/0007-config-root-is-dot-al.md) (the symlink stayed).
- **Decider(s):** Alex
- **Reversibility:** Two-way door
- **Scope:** what the one-time move does at the old path, in al-control, al-orc and control-room

## Decision

The first run of an updated tool renames `~/.assemblyline` to `~/.al` and leaves nothing at the old path. Everything else in 0007 stands.

## Why

There is one config folder, and a second name for it in the home folder is clutter that outlives its use.

## Honest costs

A tool not yet updated finds no config once another tool has moved the folder, and could write a new `~/.assemblyline` beside `~/.al`, which the updated tools ignore. Accepted: update the tools together.

## Revisit when

- A stranded `~/.assemblyline` shows up on a real machine.

## Related

- [0007](/docs/decisions/0007-config-root-is-dot-al.md) — the root and the move
