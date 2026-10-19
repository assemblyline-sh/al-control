/**
 * CLI entry point.
 *
 * Pattern: al-control <resource> <action> [target] [-f <factory>] [--host <host>]
 *
 * One host at a time (`hosts use`, or `--host` per command). Commands about a
 * single factory require `-f`; the current directory is never consulted.
 */

import { readFileSync } from 'node:fs';
import yargs from 'yargs';

import { resolveHost, resolveFactory, resolveFactories } from '../config.js';
import { localOptions } from './_helpers.js';

import { listHostsHandler, useHostHandler, currentHostHandler, showConfigHandler } from './hosts.js';
import { listFactoriesHandler } from './factories/list.js';
import { listLinesHandler } from './lines/list.js';
import { showLineHandler } from './lines/show.js';
import { statusLineHandler } from './lines/status.js';
import { statusStationHandler } from './stations/status.js';
import { listWorkpiecesHandler } from './workpieces/list.js';
import { showWorkpieceHandler } from './workpieces/show.js';
import { watchHandler } from './workpieces/watch.js';
import { countWorkpiecesHandler } from './workpieces/count.js';
import { errorsHandler } from './workpieces/errors.js';
import { catHandler } from './workpieces/cat.js';
import { openHandler } from './workpieces/open.js';
import { clearHandler } from './workpieces/clear.js';
import { listProcsHandler } from './procs/list.js';
import {
  startFactoryHandler,
  stopFactoryHandler,
  restartFactoryHandler,
  logsFactoryHandler,
  monitHandler,
} from './procs/actions.js';

const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

/**
 * On a non-local host, say where the command is about to act — on stderr so
 * `--json` stays parseable. Guards against operating on prod by accident.
 */
function banner(host, factory_name) {
  if (!host.is_local) console.error(`→ ${host.name}${factory_name ? ` / ${factory_name}` : ''}`);
}

/**
 * Wrap a handler that needs a `-f` factory: resolve it, print the banner,
 * optionally frame human output with separator lines.
 */
function withFactory(handler, { frame = true } = {}) {
  return async (argv) => {
    if (argv.getYargsCompletions) return;
    const factory = resolveFactory(argv);
    banner(factory.host, factory.name);
    if (!frame || argv.json) return handler(argv, factory);
    console.log('='.repeat(60));
    await handler(argv, factory);
    console.log('='.repeat(60));
  };
}

/** Wrap a host-level handler (no `-f`). */
function withHost(handler) {
  return async (argv) => {
    if (argv.getYargsCompletions) return;
    const host = resolveHost(argv);
    banner(host);
    return handler(argv, host);
  };
}

/**
 * Wrap a handler whose scope is every factory on the host, or just the `-f`
 * one when given.
 */
function withFactories(handler) {
  return async (argv) => {
    if (argv.getYargsCompletions) return;
    const scope = resolveFactories(argv);
    banner(scope.host, argv.factory);
    return handler(argv, scope);
  };
}

function optionalFactoryOption(yargs) {
  return localOptions(yargs).option('factory', {
    alias: 'f',
    describe: 'Only this factory (default: every factory on the host)',
    type: 'string',
  });
}

function factoryOption(yargs) {
  return localOptions(yargs).option('factory', {
    alias: 'f',
    describe: 'Factory name on the current host (required)',
    type: 'string',
  });
}

const jsonOption = { describe: 'Output raw JSON', type: 'boolean' };
const watchOptions = (yargs) => yargs
  .option('watch', { describe: 'Re-render on an interval. Mutually exclusive with --json.', type: 'boolean' })
  .option('interval', { describe: 'Watch refresh interval in seconds (default 1)', type: 'number' });
const scopeOptions = (yargs) => yargs
  .option('line', { describe: 'Scope to a single line (e.g. VM)', type: 'string' })
  .option('bin', { describe: 'Scope to a specific bin (STATION/BIN, e.g. VM3/failed)', type: 'string' })
  .option('match', { describe: 'Substring filter on workpiece id', type: 'string' });

/**
 * Build and run CLI
 * @param {string[]} args
 */
export function run(args) {
  const cli = yargs(args)
    .scriptName('al-control')
    .usage('$0 <resource> <action> [options]')
    .option('host', { describe: 'Target host for this command (overrides current_host)', type: 'string', global: true })
    .command('hosts', 'Configured hosts; pick the one commands target', (yargs) => yargs
      .usage('$0 hosts <action>')
      .command('list', 'List configured hosts', (y) => localOptions(y).option('json', jsonOption), listHostsHandler)
      .command('use <name>', 'Set the current host', (y) => y.positional('name', { describe: 'Host name from the config', type: 'string' }), useHostHandler)
      .command('current', 'Print the current host', {}, currentHostHandler)
      .demandCommand(1, 'Specify an action: list, use, current'))
    .command('factories', 'Factories configured on the current host', (yargs) => yargs
      .usage('$0 factories <action>')
      .command('list', 'Configured factories and whether each is running', (y) => localOptions(y).option('json', jsonOption), withHost(listFactoriesHandler))
      .demandCommand(1, 'Specify an action: list'))
    .command('lines', 'Inspect a factory\'s assembly lines', (yargs) => yargs
      .usage('$0 lines <action> -f <factory> [options]')
      .command('list', 'Lines and their stations (definitional)', (y) => factoryOption(y).option('json', jsonOption), withFactory(listLinesHandler))
      .command(
        'show <line>',
        'Stations in dependency order + conveyor topology (definitional)',
        (y) => factoryOption(y.positional('line', { describe: 'Line code (e.g. VM)', type: 'string' })).option('json', jsonOption),
        withFactory(showLineHandler),
      )
      .command(
        'status [line]',
        'Live bin counts. No line = per-line summary.',
        (y) => watchOptions(factoryOption(y.positional('line', { describe: 'Line code to drill into', type: 'string' })).option('json', jsonOption)),
        withFactory(statusLineHandler),
      )
      .demandCommand(1, 'Specify an action: list, show, status'))
    .command('stations', 'Inspect a factory\'s station bins', (yargs) => yargs
      .usage('$0 stations <action> -f <factory> [options]')
      .command(
        'status <id>',
        'One station\'s bins and the workpieces in them',
        (y) => watchOptions(factoryOption(y.positional('id', { describe: 'Station short_code (e.g. VM3)', type: 'string' })).option('json', jsonOption)),
        withFactory(statusStationHandler),
      )
      .demandCommand(1, 'Specify an action: status'))
    .command('workpieces', 'Inspect a factory\'s workpieces', (yargs) => yargs
      .usage('$0 workpieces <action> -f <factory> [options]')
      .command('list', 'Workpieces on disk: position, last event, folder', (y) => scopeOptions(factoryOption(y)).option('json', jsonOption), withFactory(listWorkpiecesHandler))
      .command(
        'show <id>',
        'One workpiece and its journey (a substring matching several shows the list)',
        (y) => factoryOption(y.positional('id', { describe: 'Workpiece id (exact or substring)', type: 'string' })).option('json', jsonOption),
        withFactory(showWorkpieceHandler),
      )
      .command(
        'watch [id]',
        'Live tail: bin moves and new log events',
        (y) => scopeOptions(factoryOption(y.positional('id', { describe: 'Workpiece id (exact or substring)', type: 'string' })))
          .option('interval', { describe: 'Poll interval in seconds (default 2)', type: 'number' }),
        withFactory(watchHandler, { frame: false }),
      )
      .command(
        'count [bin]',
        'FAILED / DONE / FINISHED counts per factory, line or station (all factories unless -f)',
        (y) => optionalFactoryOption(y.positional('bin', { describe: 'Only this count', choices: ['failed', 'done', 'finished'] }))
          .option('by', { describe: 'Roll up to this level', choices: ['factory', 'line', 'station'], default: 'station' })
          .option('json', jsonOption),
        withFactories(countWorkpiecesHandler),
      )
      .command(
        'errors',
        'Failed workpieces grouped by error, most common first (all factories unless -f)',
        (y) => optionalFactoryOption(y)
          .option('line', { describe: 'Only this line', type: 'string' })
          .option('station', { describe: 'Only this station', type: 'string' })
          .option('json', jsonOption),
        withFactories(errorsHandler),
      )
      .command(
        'cat <id> <file>',
        'Print one file from a workpiece folder (binary-safe when redirected)',
        (y) => factoryOption(y
          .positional('id', { describe: 'Workpiece id (exact or unique substring)', type: 'string' })
          .positional('file', { describe: 'Path inside the workpiece folder (e.g. error.json)', type: 'string' })),
        withFactory(catHandler, { frame: false }),
      )
      .command(
        'open <id>',
        'Open the workpiece folder: Finder locally, a shell in it on a remote host',
        (y) => factoryOption(y.positional('id', { describe: 'Workpiece id (exact or unique substring)', type: 'string' })),
        withFactory(openHandler, { frame: false }),
      )
      .command(
        'clear [id]',
        'Delete workpieces from done bins or terminal outputs (--bin), or one workpiece\'s (id). Dry run unless --yes.',
        (y) => factoryOption(y.positional('id', { describe: 'One workpiece (exact or unique substring): its done and finished copies', type: 'string' }))
          .option('bin', { describe: 'done = every done bin; finished = each line\'s terminal output', choices: ['done', 'finished'] })
          .option('line', { describe: 'Only this line', type: 'string' })
          .option('station', { describe: 'Only this station', type: 'string' })
          .option('older-than', { describe: 'Only workpieces with no activity for this many days', type: 'number' })
          .option('yes', { describe: 'Actually delete (default: dry run)', type: 'boolean' })
          .check((a) => {
            if (!a.id && !a.bin) throw new Error('Give --bin done|finished, or a workpiece id.');
            if (a.olderThan !== undefined && !(a.olderThan >= 0)) throw new Error('--older-than takes a number of days (0 or more).');
            return true;
          }),
        withFactory(clearHandler, { frame: false }),
      )
      .demandCommand(1, 'Specify an action: list, show, watch, count, errors, cat, open, clear'))
    .command('procs', 'Factory processes on the current host (pm2)', (yargs) => yargs
      .usage('$0 procs <action> [-f <factory>]')
      .command('list', 'Every running factory on the host', (y) => localOptions(y).option('json', jsonOption), withHost(listProcsHandler))
      .command('start', 'Start a factory under pm2', factoryOption, withFactory(startFactoryHandler, { frame: false }))
      .command('stop', 'Stop a pm2-managed factory', factoryOption, withFactory(stopFactoryHandler, { frame: false }))
      .command('restart', 'Restart a pm2-managed factory', factoryOption, withFactory(restartFactoryHandler, { frame: false }))
      .command('logs', 'Tail a factory\'s pm2 logs (Ctrl-C to stop)', factoryOption, withFactory(logsFactoryHandler, { frame: false }))
      .command('monit', 'pm2\'s interactive CPU/RAM monitor on the host', {}, withHost(monitHandler))
      .demandCommand(1, 'Specify an action: list, start, stop, restart, logs, monit'))
    .command('config', 'Show the al-control config', (yargs) => yargs
      .usage('$0 config <action>')
      .command('show', 'Config path, current host, hosts and factories', {}, showConfigHandler)
      .demandCommand(1, 'Specify an action: show'))
    .completion('completion', 'Generate shell completion script', (current, argv) => {
      const ACTIONS = {
        hosts: ['list', 'use', 'current'],
        factories: ['list'],
        lines: ['list', 'show', 'status'],
        stations: ['status'],
        workpieces: ['list', 'show', 'watch', 'count', 'errors', 'cat', 'open', 'clear'],
        procs: ['list', 'start', 'stop', 'restart', 'logs', 'monit'],
        config: ['show'],
      };
      // Drop the partial word being completed so `args` holds completed words only.
      const words = argv._.slice(1).filter((a) => a !== '');
      const done = current && words[words.length - 1] === current ? words.slice(0, -1) : words;
      const startsWithCurrent = (list) => (current ? list.filter((c) => c.startsWith(current)) : list);
      if (done.length === 0) return startsWithCurrent(Object.keys(ACTIONS));
      if (done.length === 1) return startsWithCurrent(ACTIONS[done[0]] ?? []);
      return [];
    })
    .demandCommand(1, 'Specify a resource: hosts, factories, lines, stations, workpieces, procs, config')
    .strictCommands()
    .help()
    .version(version)
    .alias('h', 'help')
    .alias('v', 'version')
    .group(['host', 'help', 'version'], 'Global Options:')
    .wrap(process.stdout.columns || 100)
    .fail((msg, err, yargs) => {
      if (err) {
        console.error(`Error: ${err.message}`);
        if (process.env.DEBUG) console.error(err.stack);
      } else {
        console.error(msg);
        console.error('');
        yargs.showHelp();
      }
      process.exit(1);
    });

  cli.parse();
}
