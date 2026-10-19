/**
 * Shared yargs helpers.
 */

/**
 * Register a command's own "Options:" group so it renders *above* the inherited
 * "Global Options:". yargs merges an instance's groups before the preserved
 * global ones, and otherwise materialises the default "Options:" group last — so
 * pre-creating it on the command instance is what fixes the order. Call at the
 * start of a command's builder; ungrouped options then fall into this group.
 */
export function localOptions(yargs) {
  return yargs.group([], 'Options:');
}
