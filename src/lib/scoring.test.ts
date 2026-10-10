import { describe, expect, it } from 'vitest';

import {
  calcPoints,
  generateForcedBidSet,
  getTotals,
  getWinner,
  type Game,
} from './scoring';

describe('calcPoints', () => {
  it('awards the standard bid bonus and trick points', () => {
    expect(calcPoints(2, 2)).toBe(12);
    expect(calcPoints(3, 2)).toBe(2);
    expect(calcPoints(0, 0)).toBe(10);
  });

  it('treats no trumps the same as normal play', () => {
    expect(calcPoints(2, 2, 'nt')).toBe(12);
  });

  it('applies a misery penalty per trick', () => {
    expect(calcPoints(0, 2, 'misery')).toBe(-8);
    expect(calcPoints(0, 0, 'misery')).toBe(0);
  });
});

describe('getTotals', () => {
  it('sums points across rounds for each player', () => {
    const game: Game = {
      playerIds: ['p1', 'p2'],
      highestRound: 2,
      startedAt: '2026-10-02T00:00:00.000Z',
      rounds: [
        {
          cardCount: 1,
          roundType: 'normal',
          bids: { p1: 1, p2: 0 },
          tricks: { p1: 1, p2: 0 },
        },
        {
          cardCount: 2,
          roundType: 'normal',
          bids: { p1: 1, p2: 2 },
          tricks: { p1: 2, p2: 1 },
        },
      ],
    };

    expect(getTotals(game)).toEqual({ p1: 13, p2: 11 });
  });
});

describe('getWinner', () => {
  it('returns the player with the highest score', () => {
    expect(getWinner({ p1: 20, p2: 33, p3: 13 })).toBe('p2');
    expect(getWinner({ p1: 10, p2: 10 })).toBe('p1');
  });
});

describe('generateForcedBidSet', () => {
  it('uses the predefined 5-player 9-card FBU bids', () => {
    const playerIds = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const bids = generateForcedBidSet(playerIds, 9, 'fbu');

    expect(Object.values(bids).sort((a, b) => a - b)).toEqual([0, 1, 2, 2, 3]);
  });

  it('uses the predefined 5-player 9-card FBO bids', () => {
    const playerIds = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const bids = generateForcedBidSet(playerIds, 9, 'fbo');

    expect(Object.values(bids).sort((a, b) => a - b)).toEqual([1, 2, 2, 2, 3]);
  });

  it('creates a valid FBU bid set that matches the required total', () => {
    const playerIds = ['p1', 'p2', 'p3'];
    const bids = generateForcedBidSet(playerIds, 3, 'fbu');

    const total = Object.values(bids).reduce((sum, value) => sum + value, 0);
    expect(total).toBe(2);
    expect(Object.values(bids).every((bid) => bid >= 0 && bid <= 3)).toBe(true);
  });

  it('creates a valid FBO bid set that matches the required total', () => {
    const playerIds = ['p1', 'p2', 'p3'];
    const bids = generateForcedBidSet(playerIds, 3, 'fbo');

    const total = Object.values(bids).reduce((sum, value) => sum + value, 0);
    expect(total).toBe(4);
    expect(Object.values(bids).every((bid) => bid >= 0 && bid <= 3)).toBe(true);
  });

  it('falls back to the general algorithm for other permutations', () => {
    const playerIds = ['p1', 'p2', 'p3', 'p4'];
    const bids = generateForcedBidSet(playerIds, 5, 'fbu');

    const total = Object.values(bids).reduce((sum, value) => sum + value, 0);
    expect(total).toBe(4);
    expect(Object.values(bids).every((bid) => bid >= 0 && bid <= 3)).toBe(true);
  });
});
