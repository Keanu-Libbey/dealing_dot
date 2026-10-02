# Project: Nomo scorer (PWA)

Mobile-first PWA for scoring the card game "nomo" among a fixed group of friends - Keanu, Isabelle, Jane, Paul, Dan, Suzie, Sean. Live scoring (the "dealing dot") runs entirely on-device. Only final raw scores are saved to Supabase at the end of a game.

## Stack
- Vite + React + TypeScript, plain CSS (no UI library)
- @supabase/supabase-js, vite-plugin-pwa
- Hosting: Cloudflare Pages. Backend: Supabase Postgres.
- Primary target: iPhone Safari, installed to Home Screen. Use safe-area insets, `viewport-fit=cover`, and large tap targets.

## Rules for you (Copilot)
- Work one step at a time and stop after each for review.
- Keep it simple: no state libraries, no routing library (a `screen` state variable is enough), no extra dependencies without asking.
- Strict TypeScript. No `any`.
- Never hardcode secrets. Use `import.meta.env.VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Derive totals from `rounds`; never store them.

## Data model (already created in Supabase)
- `players(id uuid, name text unique)`: fixed list, read-only from the app
- `games(id uuid, played_at timestamptz)`
- `results(game_id, player_id, score int)`, primary key (game_id, player_id)
- Tables are read-only to the anon key (RLS). Writes only via RPC:
  `save_game(p_passcode text, p_played_at timestamptz, p_scores jsonb)` returns uuid
  where `p_scores` = `[{ "player_id": "<uuid>", "score": <int> }, ...]`
- View `leaderboard(name, games, wins, avg_score)`
- No edit or delete in the app.

## Local game state (the dealing dot)
```ts
type Round = {
  dealerIndex: number;
  cardCount: number;
  roundType: 'normal' | 'nt' | 'fbu' | 'fbo' | 'misery';
  bids: Record<string, number>;
  tricks: Record<string, number>;
};
type Game = {
  playerIds: string[];
  highestRound: number;
  rounds: Round[];
  startedAt: string;
};
```
- Persist the in-progress `Game` to `localStorage` on every change; restore on load.
- Totals = sum of `points` per player across rounds.
- `calcPoints(bid: number, tricksWon: number): number` lives in `src/lib/scoring.ts` as a pure function with a unit test. Rules to implement:
  **Game**
- Winner = **highest** total.
- The layout of the game is as follows:
- A grid, with one column per player, and each row has the number of cards which will be dealt for that round.
- The first round is 1, then each row increases up to a maximum, and the highest round is played 4 times, and these are all "joker" rounds - No trumps, force bids under, force bids over, misery.
- So, for example, if there are all 7 players playing, the dealing dot rows would look like this:
    Keanu   Isabelle    Jane    Paul    Dan     Suzie   Sean
1   
2           
3                       
4                               
5
6
7 NT
7 FBU
7 FBO
7 M
6
5
4
3
2
1
7
7

- The dealing dot also has a dot "." on each row to signify who deals that round. The dot will always be in the same place, on round one, it will be in person 1's column, in the second round, it will be in person 2's column etc.
- The dealer dot is purely visual and does not affect the score or game logic.
- Before the game begins, the user must specify both:
  - which players are in the game
  - the chosen `highestRound` for the dealing dot
- The app should allow the user to enter the `highestRound` manually before the game starts. This is the maximum round number used in the dealing dot sequence, and the special rounds always appear as the four consecutive rounds at that peak card count.
- I want to be able to input into the UI:
    What each player's bid was
    How many tricks each player won

**Scoring Rules**
- Player's get 1pt per trick won, and a bonus 10pts if their bid matches the number of tricks they won. For example, if a player bid 2 and won 2, they get 12pts. If a player bid 3 and got 2, they get 2pts.
- on the "joker" round rules are slightly different. No trumps (NT) is the same. but the rules are as follows for the other rounds:
- Force bid under (FBU): Each player is assigned a forced bid between 0 and 3. The sum of all the bids must be 1 less than the number of the cards in the round
- Force bid over (FBO): Same as above, but the sum of all bids must be 1 more than the number of cards in the round
- Misery (M) - each player has to bid 0, and they have a 4pt penalty for each trick they win.
- For FBU/FBO rounds, the app should generate a random valid forced-bid set for the players that satisfies the required total, and the UI should display the generated bids for confirmation. The generated bid set must always satisfy the rules; it should not allow arbitrary invalid totals.
- After all rounds have been played, the points are totalled and the highest score wins.

**League table**
- I want there to be an option to submit scores after each game has been finished, and for this to contribute to a cumulative league table.
- We run a league every 3 months which takes the score of each player from each game they play, and normalises their score from 0-1 for that game - the loser gets 0, the winner gets 1, and everyone else falls inbetween according to their raw score in the game.
- The league table simply ranks each player by their average normalised score
- If a player doesn't play a particular game, this should not affect their score

**Stipulations**
- In the app, I want to:
- be able to input the names of the players above each column myself
- specify how many players are playing before the game begins - this determines how high the round numbers in the dealing dot go. For example, if all 7 players are playing, the highest round number is 7. If only 5 are playing, the highest round number is 9.
- be able to set the `highestRound` manually before the game starts, independent of the number of players, so the dealing dot can run at a chosen peak (for example, set 7, 8, or 9 as desired)
- the `highestRound` value is the card count at which the four special rounds are inserted: `NT`, `FBU`, `FBO`, `M`.

## Steps

### Step 1: Scaffold
- Create the Vite React-TS app and install dependencies.
- Add `.env.local` (gitignored) and `.env.example`.
- Add `src/lib/supabase.ts` exporting the client.

### Step 2: Game logic
- `src/lib/scoring.ts`: `calcPoints`, `getTotals(game)`, `getWinner(totals)`, with Vitest tests.
- `src/hooks/useGame.ts`: state, localStorage persistence, actions: `startGame(playerIds)`, `addRound(round)`, `undoLastRound()`, `resetGame()`.
- Add `startGame(playerIds, highestRound)` and store `highestRound` in the game state; generate the dealing-dot rounds from this input.
- Implement a helper to generate a valid random forced-bid set for `FBU` and `FBO` rounds based on the chosen `highestRound` and player count.

### Step 3: Screens
- **Setup:** fetch `players`, multi-select who is playing, allow manual `highestRound` input, Start.
- **Round entry:** per player, enter bid then tricks won (or points); show the computed points; Confirm adds the round.
- **Scoreboard:** running totals, current round number, Undo last round, Finish game.
- **Finish:** final totals, winner, "Save game" button, "Discard" with confirm.

### Step 4: Save flow
- On first save, prompt for the group passcode and store it in `localStorage`.
- Call `supabase.rpc('save_game', ...)`.
- On success: clear the draft and go to History.
- On failure (including offline or wrong passcode): keep the draft, show a clear error, allow retry.

### Step 5: History and stats
- History: list games (date, players, scores, winner), newest first.
- Leaderboard: query the `leaderboard` view.

### Step 6: PWA
- Configure `vite-plugin-pwa`: manifest (`display: standalone`, name, theme colour, 192/512 icons), service worker with offline app shell.
- Add the `apple-touch-icon` (180x180) and the `apple-mobile-web-app-capable` meta tag in `index.html`.

### Step 7: Deploy
- Add a README with env vars and the build command (`npm run build`, output `dist`) for Cloudflare Pages.
- Add `.github/workflows/keepalive.yml`: weekly cron that `curl`s `$SUPABASE_URL/rest/v1/players?select=id&limit=1` with the `apikey` header from repo secrets.

## Done when
- A full game can be played offline, survives a page refresh mid-game, saves successfully, and appears in History and Leaderboard.