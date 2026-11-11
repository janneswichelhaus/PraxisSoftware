-- Ein Code zum neuen Kennwort gilt nur für die Bereiche, die das Konto beim Ausstellen hatte
-- (§4.8, ADR-023 Punkt 10): Bekommt das Konto einen weiteren Zugang, verfallen seine offenen
-- Codes. Neu ausstellen darf dann nur, wer auch den neuen Bereich verwaltet.

create function app.platform_accesses_end_open_resets()
returns trigger
language plpgsql security definer
set search_path to ''
as $$
begin
  if tg_op = 'UPDATE' and old.account_user_id is not distinct from new.account_user_id then
    return null;
  end if;
  update public.platform_access_invitations i
     set status = 'revoked', revoked_at = now()
   where i.status = 'pending'
     and i.purpose = 'reset'
     and i.platform_access_id in (
       select a.id
         from public.platform_accesses a
        where a.account_user_id = new.account_user_id
          and a.id <> new.id
     );
  return null;
end;
$$;

revoke all on function app.platform_accesses_end_open_resets() from public, anon, authenticated;

comment on function app.platform_accesses_end_open_resets() is
  'Trigger: Wird ein Zugang an ein Konto gebunden, verfallen die offenen Codes zum neuen Kennwort der übrigen Zugänge dieses Kontos (§4.8). Sie galten nur für die Bereiche beim Ausstellen.';

create trigger platform_accesses_end_open_resets
after insert or update of account_user_id on public.platform_accesses
for each row
when (new.account_user_id is not null)
execute function app.platform_accesses_end_open_resets();
