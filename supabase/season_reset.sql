create or replace function public.clear_season_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.results where true;
  delete from public.game_snapshots where true;
  delete from public.incomplete_games where true;
  delete from public.games where true;
  delete from public.players where true;
end;
$$;

revoke all on function public.clear_season_data() from public;
grant execute on function public.clear_season_data() to anon, authenticated;
