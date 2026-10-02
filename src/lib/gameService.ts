import { hasSupabaseConfig, supabase } from './supabase';
import type { Player, LeaderboardRow } from '../types';

export async function fetchPlayers(): Promise<Player[]> {
  if (!hasSupabaseConfig || !supabase) {
    return [];
  }

  const { data, error } = await supabase.from('players').select('*').order('name');

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Player[];
}

export async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  if (!hasSupabaseConfig || !supabase) {
    return [];
  }

  const { data, error } = await supabase.from('leaderboard').select('*');

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as LeaderboardRow[];
}

export async function saveGame(
  passcode: string,
  playedAt: string,
  playerScores: Array<{ player_id: string; score: number }>,
): Promise<string> {
  if (!hasSupabaseConfig || !supabase) {
    throw new Error('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to continue.');
  }

  const { data, error } = await supabase.rpc('save_game', {
    p_passcode: passcode,
    p_played_at: playedAt,
    p_scores: playerScores,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as string;
}
