# al-control

The control room CLI for [Assembly Line](https://assemblyline.sh): watch and operate factories on this machine or on machines you reach over SSH. See what's in every bin, why workpieces failed, and start or stop factory sessions.

```bash
al-control hosts use build-box
al-control factories list
al-control lines status -f factory-globex
al-control workpieces watch inv-35 -f factory-globex
al-control procs restart -f factory-globex
al-control workpieces errors              # why things failed, on every factory
```

**Beta.** [Docs](https://assemblyline.sh/docs) · [About](https://assemblyline.sh) · [Changelog](CHANGELOG.md)

## How it works

```
                    ~/.assemblyline/al-control/config.yml
                    hosts → factories → paths
                               │
                    al-control (your machine)
              resolve host + factory · logic · output
                ┌──────────────┴──────────────┐
          host: local                  host: <ssh alias>
     probe in-process              ssh → node - (probe on stdin)
     pm2 directly                  ssh → pm2
                                   host needs node + pm2, nothing else
```

- **One config, one host at a time.** Like a kubectl context: `hosts use` picks the host, `--host` overrides it once.
- **Factories are named, never inferred.** Per-factory commands take `-f <name>`; the current directory is ignored.
- **Nothing installed on remote hosts.** A small read-only script is piped to the host's `node` over your own `ssh`, so `~/.ssh/config`, keys and Tailscale SSH all just work.

## Install

```bash
npm install -g @assemblyline/al-control
```

Node.js 18+, macOS or Linux.

## Config

`~/.assemblyline/al-control/config.yml`:

```yaml
current_host: local
hosts:
  local:
    factories:
      factory-acme: ~/factories/factory-acme
  build-box:
    ssh: build-box            # alias from ~/.ssh/config
    node: /home/me/.nvm/versions/node/v22.21.0/bin/node   # if node/pm2 come from nvm
    factories:
      factory-globex: ~/factories/factory-globex
      factory-acme:                # long form: bins `workpieces clear` must never touch
        path: ~/factories/factory-acme
        keep: [VM5/output, VM5/done]
```

Factory paths are paths on that host. Remote hosts need key-based SSH (no password prompts). When to set `node:` — see [node and pm2 over non-interactive SSH](docs/architecture/node-and-pm2-over-non-interactive-ssh.md).

## Commands

| Command | Needs `-f` | What it does |
| --- | --- | --- |
| `hosts list` / `use <name>` / `current` | | Configured hosts; set the current one |
| `factories list` | | Configured factories on the host, running or not, with CPU/RAM |
| `lines list` / `show <line>` / `status [line]` | yes | Lines, their stations, live bin counts |
| `stations status <code>` | yes | One station's bins and workpieces |
| `workpieces list` / `show <id>` / `watch [id]` | yes | Where each workpiece is, its journey (and error, files), a live tail |
| `workpieces count [failed\|done\|finished]` / `errors` | optional | Failed, done and finished counts; failures grouped by error. All factories unless `-f` |
| `workpieces cat <id> <file>` / `open <id>` | yes | Read a file from a workpiece folder; open the folder (a shell in it, on a remote host) |
| `workpieces clear --bin done\|finished` / `clear <id>` | yes | Delete done or finished workpieces, or one workpiece's copies; `--older-than <days>`. Dry run unless `--yes`; kept and conveyor-fed bins are skipped |
| `procs list` | | Every factory process on the host |
| `procs start` / `stop` / `restart` / `logs` | yes | pm2 control for one factory |
| `procs monit` | | pm2's interactive monitor on the host |
| `config show` | | Config path, hosts and factories |

`--json` on list/show/status commands; `--watch` on `lines status` and `stations status`. `<command> --help` for every option.

## al-control, al-orc and the `factory` command

- **al-control** watches and operates the floor: bins, workpieces, failures and factory
  sessions, wherever they run. No `steps run`; the only delete is the guarded
  `workpieces clear`.
- **[al-orc](https://github.com/assemblyline-sh/al-orc)** talks to the Orchestrator: line and
  station definitions, runs, work records.
- **`npx factory`** ships with [lib-factory](https://github.com/assemblyline-sh/lib-factory) in
  every factory repo and runs one step locally while you build it.

## Docs

- [`docs/architecture/`](docs/architecture/) — how the pieces work and the constraints to keep (probe rules, SSH transport, pm2 matching).
- [`docs/decisions/`](docs/decisions/) — why it's built this way, and what was rejected.

## License

Apache-2.0
