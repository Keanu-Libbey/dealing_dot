export type RoundType = 'normal' | 'nt' | 'fbu' | 'fbo' | 'misery';

export type Round = {
  cardCount: number;
  roundType: RoundType;
  bids: Record<string, number>;
  tricks: Record<string, number>;
};

export type Game = {
  playerIds: string[];
  highestRound: number;
  rounds: Round[];
  startedAt: string;
};

export function calcPoints(
  bid: number,
  tricksWon: number,
  roundType: RoundType = 'normal',
): number {
  if (roundType === 'misery') {
    return tricksWon === 0 ? 0 : -4 * tricksWon;
  }

  const trickPoints = tricksWon;
  const bonus = bid === tricksWon ? 10 : 0;
  return trickPoints + bonus;
}

export function getTotals(game: Game): Record<string, number> {
  const totals: Record<string, number> = Object.fromEntries(
    game.playerIds.map((playerId) => [playerId, 0]),
  );

  for (const round of game.rounds) {
    for (const playerId of game.playerIds) {
      const bid = round.bids[playerId] ?? 0;
      const tricksWon = round.tricks[playerId] ?? 0;
      totals[playerId] += calcPoints(bid, tricksWon, round.roundType);
    }
  }

  return totals;
}

export function getWinner(totals: Record<string, number>): string | null {
  const entries = Object.entries(totals);

  if (entries.length === 0) {
    return null;
  }

  let winnerId = entries[0][0];
  let winnerScore = entries[0][1];

  for (let index = 1; index < entries.length; index += 1) {
    const [playerId, score] = entries[index];
    if (score > winnerScore) {
      winnerId = playerId;
      winnerScore = score;
    }
  }

  return winnerId;
}

export function generateForcedBidSet(
  playerIds: string[],
  cardCount: number,
  roundType: 'fbu' | 'fbo',
): Record<string, number> {
  const maxBid = 3;
  const targetTotal = roundType === 'fbu' ? cardCount - 1 : cardCount + 1;
  const totalPlayerCount = playerIds.length;

  if (targetTotal < 0 || targetTotal > totalPlayerCount * maxBid) {
    throw new Error(
      `Cannot generate valid ${roundType.toUpperCase()} bids for ${totalPlayerCount} players and ${cardCount} cards.`,
    );
  }

  const bids: Record<string, number> = Object.fromEntries(
    playerIds.map((playerId) => [playerId, 0]),
  );

  const remaining = [...playerIds];
  let remainingTotal = targetTotal;

  while (remaining.length > 0) {
    const playerId = remaining.shift();

    if (!playerId) {
      break;
    }

    const minForPlayer = Math.max(
      0,
      remainingTotal - (remaining.length * maxBid),
    );
    const maxForPlayer = Math.min(maxBid, remainingTotal);

    const bid =
      minForPlayer +
      Math.floor(Math.random() * (maxForPlayer - minForPlayer + 1));

    bids[playerId] = bid;
    remainingTotal -= bid;
  }

  if (remainingTotal !== 0) {
    throw new Error(
      `Generated forced bid total mismatch: expected ${targetTotal}, got ${targetTotal - remainingTotal}.`,
    );
  }

  return bids;
}
