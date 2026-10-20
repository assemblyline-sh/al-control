# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.1] - 2026-10-21

### Fixed
- Factories started on a remote host now get the PATH of a normal ssh session: pm2 runs in
  the user's login shell, so `~/.profile` adds `~/.local/bin` and the like. Before, a
  factory step calling `claude` (or anything in `~/.local/bin`) failed with ENOENT.
- `procs restart` passes `--update-env`, so a restart picks up the current environment
  instead of the one saved at the first start.
- `procs start` and `procs restart` run `pm2 save`, so the host brings the factory back
  after a reboot.

## [0.3.0] - 2026-10-19

The first npm release after 0.1.0; it includes 0.2.0.

### Added
- Probe query `lines`: every line's stations in order, terminal, live bin counts, orphan counts
  and summary, with no workpiece ids. The probe now holds the line model (station order,
  terminal, summary); the CLI imports it instead of keeping a copy (decision 0006).
- `@assemblyline/al-control/probe` export, so an app that bundles the probe can vendor it and
  byte-check its copy against a pinned version.

### Changed
- `lines status` with no line uses the `lines` query: same output, a fraction of the data over
  SSH.

## [0.2.0] - 2026-10-19

### Added
- `-f <path>`: name a factory by its folder. `-f .` is the factory you're in, on this machine,
  with no config needed; a configured local factory at that path keeps its name and `keep`
  bins. With `--host`, the path is on that host.
- `workpieces requeue --bin STATION/failed` or `requeue <id>`: move failed workpieces (or one
  failed or done workpiece) back to their station's input. Dry run unless `--yes`.

## [0.1.0] - 2026-10-19

First release as `@assemblyline/al-control`, forked from `fob-factory` 0.1.0 (FinOpsBricks).
The history starts fresh here.

### Changed
- **BREAKING:** package `@assemblyline/al-control`, binary `al-control`.
- **BREAKING:** config at `~/.assemblyline/al-control/config.yml` (override with
  `AL_CONTROL_CONFIG_DIR`); each host lists `factories:`. SSH connection sockets live in the
  same folder.
- **BREAKING:** `-f/--factory` names the factory (was `-w/--worker`); `factories list` (was
  `workers list`). Debug output with `AL_DEBUG=1`.
- **BREAKING:** works on factory repos built on `@assemblyline/lib-factory`: process
  detection, `procs start`, and the conveyor guard on `workpieces clear`
  (`lib-factory:move_files`). The probe returns the factory's `.orchestrator/factory.json`.

### Fixed
- The conveyor guard on `workpieces clear` (and `lines show`) reads `move_files` steps that
  use a `moves` array, not only a single `source_bin`; fob-factory missed those and would
  offer their source bins for clearing.

### Carried over from fob-factory
- Hosts, local or over SSH with a piped probe (nothing installed on the host).
- `lines`, `stations status`, `workpieces list/show/watch/count/errors/cat/open/clear`,
  `procs list/start/stop/restart/logs/monit`, `config show`, `--json`, `--watch`.
- Guarded `workpieces clear` of `done` and finished output only: dry run unless `--yes`,
  `keep` bins, conveyor-fed bins skipped, and the probe re-checks every folder.
- Probe queries `counts` and `requeue`.
