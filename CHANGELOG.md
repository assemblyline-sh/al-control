# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
