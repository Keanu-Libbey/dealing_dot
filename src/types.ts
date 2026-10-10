import type { Game } from './lib/scoring';

export type Player = {
  id: string;
  name: string;
};

export type LeaderboardRow = {
  name: string;
  games: number;
  wins: number;
  avg_score: number;
};

export type SavedGameRecord = {
  id: string;
  played_at: string;
  game?: Game | null;
  scores: Array<{
    player_id: string;
    name: string;
    score: number;
  }>;
};

export type IncompleteGameRecord = {
  id: string;
  saved_at: string;
  game: Game;
};
