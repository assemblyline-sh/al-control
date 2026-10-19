// @ts-check

/**
 * Conveyors: `lib-factory:move_files` steps, which move workpieces from one station's bin to
 * another's. The step takes either one move (`source_bin`, `target_bin`) or a `moves` array of
 * them, so every reader goes through here.
 */

export const CONVEYOR_SLUG = 'lib-factory:move_files';

/**
 * @typedef {object} ConveyorMove
 * @property {string} source_bin - `STATION/BIN`, possibly with a sub-bin (`VM3/output/approved`)
 * @property {string} target_bin
 * @property {string} [mode]
 */

/**
 * Every move a station's conveyor steps make.
 *
 * @param {{ steps?: any[] }} station - A station definition
 * @returns {ConveyorMove[]}
 */
export function conveyorMoves(station) {
  const moves = [];
  for (const step of station.steps || []) {
    if (step.slug !== CONVEYOR_SLUG || !step.config) continue;
    for (const move of step.config.moves ?? [step.config]) {
      if (move?.source_bin) moves.push(move);
    }
  }
  return moves;
}

/**
 * `STATION/BIN` → the bin a conveyor moves it to, for every bin some conveyor drains. A sub-bin
 * source counts as its station bin. Clearing must skip these bins: another line still reads them.
 *
 * @param {{ steps?: any[] }[]} stations - Station definitions
 * @returns {Map<string, string>}
 */
export function drainedBins(stations) {
  const drained = new Map();
  for (const station of stations) {
    for (const move of conveyorMoves(station)) {
      drained.set(move.source_bin.split('/').slice(0, 2).join('/'), move.target_bin || '?');
    }
  }
  return drained;
}
