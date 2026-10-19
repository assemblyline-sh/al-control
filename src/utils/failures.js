/**
 * Grouping key for a failed workpiece's error, so failures with the same
 * cause count together even when their messages differ by an id or path.
 *
 * - A leading snake_case code (`gst_state_mismatch: …`) is the key.
 * - Otherwise the message's first line with paths, id-like tokens and long
 *   numbers masked, capped at KEY_MAX.
 */

const KEY_MAX = 100;

/**
 * @param {{name?: string|null, message?: string|null}|null} err - error.json summary
 * @returns {string}
 */
export function errorKey(err) {
  if (!err) return '(no error.json)';
  const first = String(err.message || err.name || '').split('\n')[0].trim();
  const code = first.match(/^([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/);
  if (code) return code[1];
  const masked = first
    .replace(/(?<![\w:/])(?:\/[^\s'"`/<>]+)+\/?/g, '<path>')
    .replace(/\b(?=[\w-]*\d)(?=[\w-]*[A-Za-z])[\w-]{8,}\b/g, '<id>')
    .replace(/\b\d{4,}\b/g, '<n>');
  return masked.length > KEY_MAX ? `${masked.slice(0, KEY_MAX - 1)}…` : masked;
}
