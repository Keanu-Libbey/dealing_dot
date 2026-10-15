# dealing_dot

A mobile-first PWA for tracking Nomo games and saving the final scores to Supabase.

## Shared incomplete games

Completed games and leaderboard entries already come from Supabase. To make Save for later shared across devices too, run the SQL in [supabase/incomplete_games.sql](supabase/incomplete_games.sql) in your Supabase SQL editor once.

To make completed game score-sheets viewable from Game history too, also run [supabase/game_snapshots.sql](supabase/game_snapshots.sql).

To enable the app's season reset button, also run [supabase/season_reset.sql](supabase/season_reset.sql).

To enable deleting individual completed games from Game history, run [supabase/delete_game_record.sql](supabase/delete_game_record.sql).

This creates a shared `incomplete_games` table used by the app for:
- saving drafts from one phone
- resuming them from another phone
- keeping incomplete drafts out of leaderboard averages until the game is finished

It also creates a shared `game_snapshots` table used by the app for:
- viewing completed game score-sheets from history
- showing totals for each player under the saved score-sheet

And it creates a `clear_season_data()` RPC used by the app to clear the current season after export.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Add your Supabase values:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the app:
   ```bash
   npm run dev
   ```

## Production build

```bash
npm run build
```

This outputs the production bundle to the `dist` directory, which is suitable for deployment on Cloudflare Pages.

## Environment variables

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```
