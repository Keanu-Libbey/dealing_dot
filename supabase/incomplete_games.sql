create table if not exists public.incomplete_games (
  id text primary key,
  saved_at timestamptz not null default now(),
  game jsonb not null
);

alter table public.incomplete_games enable row level security;

-- Public read access so all players using the shared app can resume drafts.
drop policy if exists "incomplete_games_select" on public.incomplete_games;
create policy "incomplete_games_select"
on public.incomplete_games
for select
using (true);

-- Public insert access for shared group drafts.
drop policy if exists "incomplete_games_insert" on public.incomplete_games;
create policy "incomplete_games_insert"
on public.incomplete_games
for insert
with check (true);

-- Public update access so saving the same draft again replaces it.
drop policy if exists "incomplete_games_update" on public.incomplete_games;
create policy "incomplete_games_update"
on public.incomplete_games
for update
using (true)
with check (true);

-- Public delete access so completed drafts can be removed.
drop policy if exists "incomplete_games_delete" on public.incomplete_games;
create policy "incomplete_games_delete"
on public.incomplete_games
for delete
using (true);
