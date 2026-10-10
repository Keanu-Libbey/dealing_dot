create table if not exists public.game_snapshots (
  game_id uuid primary key references public.games (id) on delete cascade,
  played_at timestamptz not null default now(),
  game jsonb not null
);

alter table public.game_snapshots enable row level security;

drop policy if exists "game_snapshots_select" on public.game_snapshots;
create policy "game_snapshots_select"
on public.game_snapshots
for select
using (true);

drop policy if exists "game_snapshots_insert" on public.game_snapshots;
create policy "game_snapshots_insert"
on public.game_snapshots
for insert
with check (true);

drop policy if exists "game_snapshots_update" on public.game_snapshots;
create policy "game_snapshots_update"
on public.game_snapshots
for update
using (true)
with check (true);

drop policy if exists "game_snapshots_delete" on public.game_snapshots;
create policy "game_snapshots_delete"
on public.game_snapshots
for delete
using (true);
