import { hasSupabaseConfig } from '../lib/supabase';
import { useCallback, useEffect, useState } from 'react';

import type { Game, Round, RoundType } from '../lib/scoring';

const STORAGE_KEY = 'dealing-dot:game';
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function buildDealingDotLayout(
  playerCount: number,
  highestRound: number,
): Array<{ cardCount: number; roundType: RoundType; dealerIndex: number }> {
  if (highestRound < 1) {
    throw new Error('highestRound must be at least 1');
  }

  if (playerCount < 1) {
    throw new Error('playerCount must be at least 1');
  }

  const rows: Array<{ cardCount: number; roundType: RoundType; dealerIndex: number }> = [];

  for (let cardCount = 1; cardCount < highestRound; cardCount += 1) {
    rows.push({
      cardCount,
      roundType: 'normal',
      dealerIndex: rows.length % playerCount,
    });
  }

  const specialRounds: RoundType[] = ['nt', 'fbu', 'fbo', 'misery'];

  for (const roundType of specialRounds) {
    rows.push({
      cardCount: highestRound,
      roundType,
      dealerIndex: rows.length % playerCount,
    });
  }

  for (let cardCount = highestRound - 1; cardCount >= 1; cardCount -= 1) {
    rows.push({
      cardCount,
      roundType: 'normal',
      dealerIndex: rows.length % playerCount,
    });
  }

  rows.push({
    cardCount: highestRound,
    roundType: 'normal',
    dealerIndex: rows.length % playerCount,
  });

  rows.push({
    cardCount: highestRound,
    roundType: 'normal',
    dealerIndex: rows.length % playerCount,
  });

  return rows;
}

export function useGame() {
  const [game, setGame] = useState<Game | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Game | null;
        if (
          parsed &&
          Array.isArray(parsed.playerIds) &&
          Array.isArray(parsed.rounds) &&
          (!hasSupabaseConfig || parsed.playerIds.every((playerId) => typeof playerId === 'string' && isUuid(playerId)))
        ) {
          setGame(parsed);
        } else {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch (error) {
      console.warn('Unable to restore draft game from localStorage', error);
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      setIsReady(true);
    }
  }, []);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (!game) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
  }, [game, isReady]);

  const startGame = useCallback((playerIds: string[], highestRound: number) => {
    const uniquePlayerIds = [...new Set(playerIds.filter(Boolean))];

    if (uniquePlayerIds.length === 0) {
      throw new Error('At least one player is required to start a game.');
    }

    setGame({
      playerIds: uniquePlayerIds,
      highestRound: Math.max(1, Number(highestRound) || 1),
      rounds: [],
      startedAt: new Date().toISOString(),
    });
  }, []);

  const addRound = useCallback((round: Round) => {
    setGame((previousGame) => {
      if (!previousGame) {
        return previousGame;
      }

      return {
        ...previousGame,
        rounds: [...previousGame.rounds, round],
      };
    });
  }, []);

  const undoLastRound = useCallback(() => {
    setGame((previousGame) => {
      if (!previousGame) {
        return previousGame;
      }

      return {
        ...previousGame,
        rounds: previousGame.rounds.slice(0, -1),
      };
    });
  }, []);

  const resetGame = useCallback(() => {
    setGame(null);
  }, []);

  return {
    game,
    isReady,
    startGame,
    addRound,
    undoLastRound,
    resetGame,
  };
}
