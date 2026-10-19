# al-control: fork from fob-factory and reshape

## Status: IN PROGRESS (~70%)

al-control is the control room CLI: it watches and operates factories on any host, locally or
over SSH. It is forked from FinOpsBricks' `fob-factory` with a fresh history (the old history
stays in the private FinOpsBricks repo, remote `finopsbricks`). This WIP covers the fork, making
it work on Assembly Line factories, publishing it, and then taking over al-factory's floor
commands so al-factory can be retired.

---

## Problem Statement

fob-factory works only on FinOpsBricks worker repos: it detects `@fob/lib-worker`, reads
`.orchestrator/worker.json`, and its clear guard only recognises `lib-worker:move_files`
conveyors. On an Assembly Line factory the guard silently stops protecting conveyor-fed bins.
Meanwhile al-factory, which is being retired, is still the only way to see a factory's bins
from inside its repo.

## Decisions

- **Fresh history, public repo.** The fob-factory history names customer workers and hosts.
- **Config root `~/.assemblyline/al-control/`** (`config.yml`, SSH sockets). Same family root as
  al-orc (`~/.assemblyline/al-orc/`). The old `~/.fob/fob-factory/config.yml` is not read.
- **`-f/--factory`** names the factory (was `-w/--worker`); hosts list `factories:`.
- **Factories only.** FinOpsBricks worker repos stay with fob-factory.

## Implementation Phases

### Phase 1: Fork and rename ✅
- [x] Copy the working tree without `.git`; rename package, binary, config root, env vars
      (`AL_CONTROL_CONFIG_DIR`, `AL_DEBUG`), flag, resources and vocabulary
- [x] Scrub customer names, hosts and personal paths from docs, comments and tests; drop the
      fob-factory WIPs
- [x] NOTICE credits fob-factory (FinOpsBricks, Apache-2.0); fresh CHANGELOG at 0.1.0
- [x] Tests pass (60)

### Phase 2: Work on Assembly Line factories ✅
- [x] Process detection and `procs start` find `@assemblyline/lib-factory` factories: `factories
      list` and `procs list` find every running factory session, locally and over SSH
- [x] The clear guard skips bins drained by `lib-factory:move_files`, including a `moves`
      array (`src/utils/conveyors.js`, tested). On a scratch factory whose terminal output feeds
      another line's conveyor, al-control skips the bin; fob-factory would have deleted it
- [x] The probe returns `.orchestrator/factory.json` (`tests/probe.test.js`)
- [x] Read-only checks on four real factories: `lines status/list/show`, `stations status`,
      `workpieces count/errors`, dry-run `workpieces clear`

### Phase 3: Publish 🔄
- [x] Final audit (names, hosts, gitleaks) of every commit and of the npm package
- [x] Public repo `assemblyline-sh/al-control`, description, homepage, topics; pushed, tagged
      `v0.1.0`
- [ ] npm `@assemblyline/al-control` 0.1.0

### Phase 4: Take over al-factory's floor commands ❌
- [x] An explicit path as the target: `-f .` (or any path) on the local host, with no config
      entry. Typing the path keeps decision 0003's rule (no silent cwd fallback)
- [x] `workpieces requeue --bin STATION/failed` or `requeue <id>` (tested; tried on a scratch
      factory: failed → input, error files dropped, `requeued` logged)
- Dropped: filtering lines by `FACTORY_LOCATION`. al-factory never did it, and another
  location's lines only show empty bins here, since their bins live on that location's host
- [ ] Factory CLAUDE.md files: `al-factory lines status` → `al-control lines status -f .`
- [ ] Retire al-factory (archive its repo)

### Phase 5: Shared logic ❌
- [ ] The probe computes line state, so control-room (the desktop app) can render it without a
      Rust port; a byte check on the probe copy it vendors

## Related Files

- `src/probe.js` - the one-file probe that runs on each host
- `src/config.js` - config store and target resolution
- `src/cli/workpieces/clear.js` - the guarded clear
- `docs/decisions/` - why it is built this way
