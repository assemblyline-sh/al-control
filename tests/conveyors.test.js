import { describe, it, expect } from '@jest/globals';
import { conveyorMoves, drainedBins } from '../src/utils/conveyors.js';

const conveyor = (config) => ({ steps: [{ slug: 'lib-factory:move_files', config }] });

describe('conveyorMoves', () => {
  it('reads a single move and a moves array', () => {
    expect(conveyorMoves(conveyor({ source_bin: 'A1/output', target_bin: 'B1/input' }))).toEqual([
      { source_bin: 'A1/output', target_bin: 'B1/input' },
    ]);
    const moves = [
      { source_bin: 'A1/output/approved', target_bin: 'B1/input' },
      { source_bin: 'A2/output', target_bin: 'C1/input' },
    ];
    expect(conveyorMoves(conveyor({ moves }))).toEqual(moves);
  });

  it('ignores other steps and the old lib-worker slug', () => {
    const station = {
      steps: [
        { slug: 'B1_01_check', config: { source_bin: 'A1/output' } },
        { slug: 'lib-worker:move_files', config: { source_bin: 'A1/output' } },
      ],
    };
    expect(conveyorMoves(station)).toEqual([]);
  });
});

describe('drainedBins', () => {
  it('maps every drained STATION/BIN, sub-bins counting as their bin', () => {
    const drained = drainedBins([
      conveyor({ source_bin: 'A1/output', target_bin: 'B1/input' }),
      conveyor({ moves: [{ source_bin: 'B1/output/approved', target_bin: 'C1/input' }, { source_bin: 'B1/done', target_bin: 'D1/input' }] }),
      { steps: [{ slug: 'C1_01_finish', config: {} }] },
    ]);
    expect([...drained]).toEqual([
      ['A1/output', 'B1/input'],
      ['B1/output', 'C1/input'],
      ['B1/done', 'D1/input'],
    ]);
  });
});
