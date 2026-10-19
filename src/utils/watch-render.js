/**
 * Watch-mode renderer for snapshot commands (e.g. `al-control lines status --watch`).
 *
 * Renders in place on the main screen. Each tick sends:
 *   `\x1b[2J` — erase the visible display
 *   `\x1b[3J` — erase the scrollback / "saved lines" (xterm DECSED 3)
 *   `\x1b[H`  — home cursor to (1,1)
 *
 * The scrollback erase is the key bit: when a frame is taller than the
 * terminal viewport, the part that overflows scrolls into scrollback. Without
 * `\x1b[3J`, tops of past frames pile up across ticks. With it, scrollback is
 * purged each tick so only the current frame is ever visible.
 *
 * Side effect: any pre-existing scrollback above the command is also wiped
 * each tick. That's the trade-off for staying on the main screen instead of
 * using the alternate-screen buffer (which would hide the last frame on exit).
 *
 * If stdout isn't a TTY (e.g. piped to a file), falls back to plain append.
 *
 * `render` is invoked once per tick and may be async. Errors are not caught —
 * the loop is meant to halt on programmer mistakes, not silently spin.
 */

export const DEFAULT_WATCH_INTERVAL_SECS = 1;

const CLEAR_AND_HOME = '\x1b[2J\x1b[3J\x1b[H';

export async function watchRender({ render, interval_secs = DEFAULT_WATCH_INTERVAL_SECS }) {
  process.on('SIGINT', () => { process.stdout.write('\n'); process.exit(0); });
  let first = true;
  while (true) {
    if (process.stdout.isTTY && !first) {
      process.stdout.write(CLEAR_AND_HOME);
    }
    first = false;
    await render();
    console.log(`\nupdated ${new Date().toLocaleTimeString()} — refresh every ${interval_secs}s (Ctrl-C to stop)`);
    await new Promise((r) => setTimeout(r, interval_secs * 1000));
  }
}
