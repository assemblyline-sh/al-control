# Matching Factories to pm2 Processes

## pm2 name = factory directory name

The pm2 process name is the basename of the factory's resolved root, not its config name. `al-factory procs start` and the control-room app use the same rule, so a factory started by any of them is recognised by the others. A config name that differs from the directory (`globex: ~/…/factory-globex`) still maps to pm2 `factory-globex`.

## Running = matched by cwd or name

A configured factory counts as running when a process row has `cwd === root` or `pm2 === basename(root)`.

Process rows come from the probe (logic from al-factory's `factory-processes.js`):

- **pm2 rows** from `pm2 jlist`'s `pm_cwd` — not `ps` text, because pm2 rewrites the process title and `ps` argv can come back corrupted. Only `online` apps count; a `stopped` app shows as `stopped`.
- **direct rows** from `ps`: a `node` process whose cwd is a factory repo (`@assemblyline/lib-factory` dependency + `main`) and whose command contains `main`. `node --watch` supervisors are skipped; cwds already claimed by pm2 are skipped, so a pm2 app wrapping `npm start` isn't counted twice.

## `start` after `stop` reuses the pm2 entry

`procs start` runs `pm2 start <main> --name <dir>` from the root. When a stopped entry with that name exists, pm2 applies `restartProcessId` to it — same id, same saved settings, no duplicate. Observed 2026-10-09 locally and on build-box (`factory-globex`, id 6).

## Not checked: two copies of one factory

al-control does not compare `FACTORY_LOCATION` across hosts. A local checkout of a prod factory often has the prod location in its `.env`; starting it locally makes it compete with prod for the same work.

## Related Notes

- [node and pm2 Over Non-Interactive SSH](/docs/architecture/node-and-pm2-over-non-interactive-ssh.md) — when pm2 can't be queried
- [Code Copied From al-factory](/docs/architecture/code-copied-from-al-factory.md)
- [Resolving the Target Host and Factory](/docs/architecture/resolving-the-target-host-and-factory.md)
