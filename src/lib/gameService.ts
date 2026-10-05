import { hasSupabaseConfig, supabase } from './supabase';
import type { Player, LeaderboardRow, SavedGameRecord } from '../types';

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

export async function fetchGames(): Promise<SavedGameRecord[]> {
  if (!hasSupabaseConfig || !supabase) {
    console.log('[fetchGames] Supabase not configured');
    return [];
  }

  try {
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('id,played_at')
      .order('played_at', { ascending: false });

    if (gamesError) {
      console.error('[fetchGames] games query error:', gamesError);
      throw new Error(gamesError.message);
    }

    console.log('[fetchGames] games fetched:', games?.length ?? 0);

    if (!games || games.length === 0) {
      return [];
    }

    const gameIds = games.map((g: any) => g.id);

    // Fetch results and players separately to avoid join permission issues
    const { data: results, error: resultsError } = await supabase
      .from('results')
      .select('game_id,player_id,score')
      .in('game_id', gameIds);

    if (resultsError) {
      console.error('[fetchGames] results query error:', resultsError);
      throw new Error(resultsError.message);
    }

    console.log('[fetchGames] results fetched:', results?.length ?? 0);

    const { data: playersData, error: playersError } = await supabase
      .from('players')
      .select('id,name');

    if (playersError) {
      console.error('[fetchGames] players query error:', playersError);
      throw new Error(playersError.message);
    }

    console.log('[fetchGames] players fetched:', playersData?.length ?? 0);

    const playerMap = Object.fromEntries(
      (playersData ?? []).map((p: any) => [p.id, p.name]),
    );

    const resultsByGame: Record<string, typeof results> = {};
    (results ?? []).forEach((r: any) => {
      if (!resultsByGame[r.game_id]) {
        resultsByGame[r.game_id] = [];
      }
      resultsByGame[r.game_id].push(r);
    });

    const gameRecords = games.map((g: any) => ({
      id: g.id,
      played_at: g.played_at,
      scores: (resultsByGame[g.id] ?? []).map((r: any) => ({
        player_id: r.player_id,
        name: playerMap[r.player_id] ?? 'Unknown',
        score: r.score,
      })),
    })) as SavedGameRecord[];

    console.log('[fetchGames] returning:', gameRecords.length, 'games');
    return gameRecords;
  } catch (error) {
    console.error('[fetchGames] fatal error:', error);
    throw error;
  }
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
  playedAt: string,
  playerScores: Array<{ player_id: string; score: number }>,
): Promise<string> {
  if (!hasSupabaseConfig || !supabase) {
    throw new Error('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to continue.');
  }

  const isUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

  // Resolve any non-UUID player identifiers (assumed to be names) to real player IDs.
  const namesToResolve = Array.from(
    new Set(playerScores.filter((p) => !isUuid(p.player_id)).map((p) => p.player_id)),
  );

  const nameToId: Record<string, string> = {};

  if (namesToResolve.length > 0) {
    // Fetch any existing players matching these names (case-sensitive on DB side).
    const { data: existing, error: fetchErr } = await supabase
      .from('players')
      .select('id,name')
      .in('name', namesToResolve);

    if (fetchErr) {
      throw new Error(fetchErr.message);
    }

    (existing ?? []).forEach((row: any) => {
      nameToId[row.name] = row.id;
    });

    // Determine which names still need creating.
    const missing = namesToResolve.filter((n) => !nameToId[n]);

    if (missing.length > 0) {
      // Insert missing players. Use upsert-like behavior by inserting and
      // returning representation; if concurrent insert caused conflict,
      // a subsequent fetch will pick it up.
      const toInsert = missing.map((n) => ({ name: n }));
      const { data: inserted, error: insertErr } = await supabase
        .from('players')
        .insert(toInsert)
        .select('id,name');

      if (insertErr) {
        // If insertion failed due to unique constraint, try to fetch again.
        const { data: recheck, error: recheckErr } = await supabase
          .from('players')
          .select('id,name')
          .in('name', missing);

        if (recheckErr) {
          throw new Error(recheckErr.message);
        }

        (recheck ?? []).forEach((row: any) => {
          nameToId[row.name] = row.id;
        });
      } else {
        (inserted ?? []).forEach((row: any) => {
          nameToId[row.name] = row.id;
        });
      }
    }
  }

  // Build final scores with real UUIDs where possible.
  const finalScores = playerScores.map((p) => {
    if (isUuid(p.player_id)) {
      return p;
    }

    const resolved = nameToId[p.player_id];
    return {
      player_id: resolved ?? p.player_id,
      score: p.score,
    };
  });

  // Verify all resolved IDs are UUIDs before sending to RPC.
  const invalid = finalScores.filter((p) => !isUuid(p.player_id));
  if (invalid.length > 0) {
    throw new Error('Player IDs are invalid for this save. Re-select players from the database or re-load the app.');
  }
  const { data, error } = await supabase.rpc('save_game', {
    p_played_at: playedAt,
    p_scores: finalScores,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as string;
}
