# 0004 — No commands that delete factory data or run steps.

- **Status:** Superseded in part by [0005](/docs/decisions/0005-guarded-clear-of-done-and-finished.md) (2026-10-10) — clearing done/finished bins is now in. Steps and clearing other bins remain out.
- **Accepted:** 2026-10-10 (recorded retroactively; the choice was made 2026-10-09)
- **Decider(s):** Alex
- **Reversibility:** Two-way door
- **Scope:** which al-factory commands al-control does not carry

## Decision

al-control has no `lines empty-bins`, `stations empty-bins`, `steps list` or `steps run`. Its writes are limited to pm2 process control and its own config.

## Why not

- **empty-bins deletes workpieces**, and this CLI reaches prod hosts from anywhere. One flag away from wiping a prod bin is the wrong default.
- **Steps are a development concern.** Running a step needs the factory's code, `.env` and `node_modules` — the cwd-bound world of `al-factory` ([0001](/docs/decisions/0001-separate-cli-not-a-reshaped-al-factory.md)).

Strongest opposing case: clearing a stuck `failed` bin on prod is a real operational task, and doing it remotely saves an SSH session. Not strong enough yet — it's rare, and `ssh host` + `al-factory` still does it.

## Honest costs

- **Clearing bins on a remote host** means SSH-ing in and using `al-factory` there. Accepted.

## Revisit when

- Clearing prod bins becomes a weekly task.

## Review

## Related

- `docs/wip/al-control-cli.md`
- [0001 — al-control is a separate CLI](/docs/decisions/0001-separate-cli-not-a-reshaped-al-factory.md)
