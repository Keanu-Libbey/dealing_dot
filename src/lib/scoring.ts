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

  const order = [...playerIds];
  let remainingTotal = targetTotal;

  for (let index = 0; index < order.length; index += 1) {
    const playerId = order[index];
    const remainingPlayers = order.length - index - 1;
    const minForPlayer = Math.max(
      0,
      remainingTotal - remainingPlayers * maxBid,
    );
    const maxForPlayer = Math.min(
      maxBid,
      remainingTotal,
    );

    let bid = minForPlayer;
    if (maxForPlayer > minForPlayer) {
      const spread = maxForPlayer - minForPlayer + 1;
      const bias = index % 2 === 0 ? 0.5 : 0.25;
      bid = minForPlayer + Math.floor((Math.random() + bias) * spread);
      if (bid > maxForPlayer) {
        bid = maxForPlayer;
      }
    }

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
