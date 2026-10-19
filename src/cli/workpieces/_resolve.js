import { resolveWorkpieceQuery, workpieceRelDir } from '../../utils/line-state.js';
import { loadLines } from '../../utils/factory-data.js';

/**
 * The one workpiece an id (or unambiguous substring) names, for commands that
 * act on a single folder. Exits with the candidates when it's ambiguous.
 * @param {import('../../config.js').FactoryContext} factory
 * @param {string} query
 * @returns {{id: string, root: string, rel: string}}
 */
export function resolveOneWorkpiece(factory, query) {
  const { root, lines } = loadLines(factory);
  const found = resolveWorkpieceQuery(query, lines);
  if (!found) {
    console.error(`No workpiece matches "${query}".`);
    process.exit(1);
  }
  if ('ambiguous' in found) {
    const shown = found.ambiguous.slice(0, 10);
    const more = found.ambiguous.length - shown.length;
    console.error(`"${query}" matches ${found.ambiguous.length} workpieces; use the full id:\n  ${shown.join('\n  ')}${more ? `\n  … +${more} more` : ''}`);
    process.exit(1);
  }
  return { id: found.id, root, rel: workpieceRelDir(found.pos, found.id) };
}
