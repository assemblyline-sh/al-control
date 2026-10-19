import { errorKey } from '../src/utils/failures.js';

describe('errorKey', () => {
  test.each([
    ['a leading snake_case code', 'gst_state_mismatch: GSTIN is in DL but supply is to MH', 'gst_state_mismatch'],
    ['paths masked', "ENOENT: no such file or directory, open '/home/a/temp/TU1/doing/63AGBoa9x5E0-u1788834697/t.json'", "ENOENT: no such file or directory, open '<path>'"],
    ['id-like tokens and long numbers masked', 'Row 12345 failed for id aB3dE5gH9k', 'Row <n> failed for id <id>'],
    ['short numbers and URLs kept', 'HTTP 500 from https://api.example.com/v1', 'HTTP 500 from https://api.example.com/v1'],
    ['only the first line', 'boom\nat line 2', 'boom'],
  ])('%s', (_, message, key) => {
    expect(errorKey({ message })).toBe(key);
  });

  test('missing error.json and long keys', () => {
    expect(errorKey(null)).toBe('(no error.json)');
    expect(errorKey({ message: 'word '.repeat(50) })).toHaveLength(100);
  });
});
