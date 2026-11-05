# 0007 — The config root is `~/.al`. Not `.assemblyline`, `.aline` or `.line`.

- **Status:** Accepted — 2026-11-05
- **Decider(s):** Alex
- **Reversibility:** Two-way door
- **Scope:** the folder holding every al-<tool>'s config and al-control's SSH sockets, in al-control, al-orc and control-room

## Decision

Every al-<tool> keeps its config under `~/.al/<tool>/`. The first run of an updated tool moves `~/.assemblyline` to `~/.al` in one rename and leaves a `~/.assemblyline` symlink. If `~/.al` already exists, nothing moves.

## Why

- **The SSH socket needs the length.** ssh binds `<ControlPath>.XXXXXXXXXXXXXXXX` before renaming it, and macOS allows 103 characters. With `/Users/alex.vazhatharayil` as home, that path is 112 under `.assemblyline`, 105 under `.aline`, 104 under `.line` and 102 under `.al`. Only `.al` connects. A shorter socket name would lift this limit on the folder name, but `.al` stands on its own for the next reason.
- **It matches the family.** The tools are `al-<tool>` and their env vars `AL_*`.
- **The move is automatic** because the folder holds al-orc's credentials: without it, an update looks like a lost login.
- **The symlink stays** because the three tools update separately, and one still on the old path would otherwise find no config.

## Honest costs

- `.al` leaves one character to spare on that Mac. A home path two characters longer still fails until sockets get a shorter name (control-room `docs/wip/ssh-socket-path-too-long.md`).
- The move is written three times, in two languages, because the tools share no package. Accepted: it is a few lines and stops mattering once machines have moved.
- A `~/.al` made by some other program stops the move, and the tools then find no config. Not seen; judged acceptable.

## Revisit when

- Every machine has moved: delete the move and the symlink.
