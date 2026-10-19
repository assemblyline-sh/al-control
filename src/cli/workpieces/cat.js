import { probe } from '../../transport.js';
import { resolveOneWorkpiece } from './_resolve.js';

/**
 * `al-control workpieces cat <id> <file> -f <factory>` — one file from the
 * workpiece folder to stdout, byte-for-byte (so `> invoice.pdf` works).
 * Binary output to a terminal is refused.
 *
 * @param {{id: string, file: string}} argv
 * @param {import('../../config.js').FactoryContext} factory
 */
export async function catHandler(argv, factory) {
  const { rel } = resolveOneWorkpiece(factory, argv.id);
  const { encoding, content } = probe(factory.host, { type: 'read', path: factory.path, dir: rel, file: argv.file });
  if (encoding === 'base64' && process.stdout.isTTY) {
    console.error(`${argv.file} is binary. Redirect it to a file: … > ${argv.file.split('/').pop()}`);
    process.exit(1);
  }
  process.stdout.write(Buffer.from(content, encoding));
}
