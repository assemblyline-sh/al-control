# How a Probe Call Reaches a Remote Host

`probe()` and `pm2()` in `src/transport.js` run the system `ssh`. Two command shapes:

```
# probe query — probe.js + "main(<query JSON>);" piped on stdin
ssh <opts> -- <alias> '<PATH=…> <node> --input-type=module -'

# pm2 action — stdio inherited
ssh <opts> [-t] -- <alias> 'cd <root> && <PATH=…> pm2 <args>'
```

## Why each piece

| Piece | Reason |
|---|---|
| System `ssh`, not an SSH library | `~/.ssh/config` aliases, `ProxyJump`, keys, agent and Tailscale SSH all apply unchanged |
| `--input-type=module` | `node -` treats stdin as CommonJS by default; the probe is ESM |
| `main(<query>)` appended by the client | The probe has no self-run guard, so importing it locally runs nothing. The query is a JSON literal in the script, never in argv: it bypasses the remote shell's quoting, and Linux caps one argument at 128 KB — `workpieces list` on a factory with thousands of workpieces exceeded it when the query was an argument |
| `--` before the alias | Ends ssh option parsing; config also rejects aliases starting with `-` |
| `shellQuote()` on every interpolated value | The remote command string is parsed by the host's shell |
| `-t` only when interactive and stdin is a TTY | Ctrl-C reaches remote `pm2 logs` / `monit`; without a local TTY, `-t` only warns |

## Result envelope

`main()` prints exactly one line: `{"ok":true,"data":…}` or `{"ok":false,"error":{"code","message"}}`. Probe errors carry a `code` (`FACTORY_NOT_FOUND`, `BAD_PATH`, `NOT_FOUND`, `TOO_LARGE`, `REFUSED`, `UNSUPPORTED_PLATFORM`, `BAD_QUERY`) instead of a stack trace.

## Exit codes the client maps

| `ssh` exit | Meaning | Shown |
|---|---|---|
| 255 | ssh itself failed (DNS, auth, network) | ssh's own message, then "ssh to … failed" |
| 127 | `node` (or `pm2`) not on the remote PATH | hint to set `node:` — see [node and pm2 Over Non-Interactive SSH](/docs/architecture/node-and-pm2-over-non-interactive-ssh.md) |
| other, non-JSON stdout | probe crashed before `main()` | "Unexpected output" + first 2000 chars |

## stderr is never captured

Only stdout is piped; stderr goes straight to the terminal. Tailscale SSH's check mode prints a login URL on stderr and waits — captured, the command looked hung. Same channel carries ssh's own errors verbatim.

`EPIPE` on the stdin write means ssh exited before reading the probe; its reason is already on the terminal.

## Related Notes

- [Probe Does I/O, Client Does Logic](/docs/architecture/probe-does-io-client-does-logic.md)
- [SSH Connection Sharing](/docs/architecture/ssh-connection-sharing.md)
- [node and pm2 Over Non-Interactive SSH](/docs/architecture/node-and-pm2-over-non-interactive-ssh.md)
- [0002 — Remote hosts run a piped probe](/docs/decisions/0002-remote-hosts-run-a-piped-probe.md)
