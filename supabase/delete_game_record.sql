create or replace function public.delete_game_record(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.results where game_id = p_game_id;
  delete from public.game_snapshots where game_id = p_game_id;
  delete from public.games where id = p_game_id;
end;
$$;

revoke all on function public.delete_game_record(uuid) from public;
grant execute on function public.delete_game_record(uuid) to anon, authenticated;
