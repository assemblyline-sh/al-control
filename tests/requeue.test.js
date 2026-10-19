import { describe, it, expect } from '@jest/globals';
import { planRequeue } from '../src/cli/workpieces/requeue.js';

const bins = (entries = {}) => ({ input: null, doing: null, output: null, done: null, failed: null, ...entries });
const lines = {
  EX: {
    code: 'EX',
    stations: ['EX0', 'EX1'],
    terminal: 'EX1',
    bins: {
      EX0: bins({ done: new Map([['a-1', 'a-1']]) }),
      EX1: bins({ failed: new Map([['b-1', 'b-1'], ['b-2', 'sub/b-2']]), done: new Map([['a-1', 'a-1'], ['c-9', 'c-9']]) }),
    },
  },
};

describe('planRequeue', () => {
  it('--bin STATION/failed takes every failed workpiece, sub-bins included', () => {
    expect(planRequeue(lines, { bin: 'EX1/failed' })).toEqual([
      { id: 'b-1', from: 'EX1/failed', rel: 'EX1/failed/b-1' },
      { id: 'b-2', from: 'EX1/failed', rel: 'EX1/failed/sub/b-2' },
    ]);
  });

  it('--bin refuses anything but a failed bin, and unknown stations', () => {
    expect(() => planRequeue(lines, { bin: 'EX1/done' })).toThrow(/STATION\/failed/);
    expect(() => planRequeue(lines, { bin: 'ZZ/failed' })).toThrow(/Station "ZZ" not found/);
  });

  it('an id finds one workpiece in failed or done, by exact id or unique substring', () => {
    expect(planRequeue(lines, { id: 'c-9' })).toEqual([{ id: 'c-9', from: 'EX1/done', rel: 'EX1/done/c-9' }]);
    expect(planRequeue(lines, { id: 'b-2' })).toEqual([{ id: 'b-2', from: 'EX1/failed', rel: 'EX1/failed/sub/b-2' }]);
  });

  it('refuses an ambiguous substring, no match, or an id in two bins', () => {
    expect(() => planRequeue(lines, { id: 'b-' })).toThrow(/matches 2 workpieces/);
    expect(() => planRequeue(lines, { id: 'zzz' })).toThrow(/No failed or done workpiece/);
    expect(() => planRequeue(lines, { id: 'a-1' })).toThrow(/EX0\/done and EX1\/done/);
  });
});
