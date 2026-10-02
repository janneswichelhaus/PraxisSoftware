-- =============================================================================
-- ABN-012 (BEF-118): Wiederherstellung per Mail nur nach bestaetigtem Postfach
--
-- Abnahme Jannes, 2026-10-02 (ANN-191, B13): Eine Wiederherstellung per Mail
-- gibt es fuer ein Plattformkonto nur, wenn das Postfach TATSAECHLICH per
-- Link bestaetigt wurde. Der Bestaetigungsstatus, den der Zugangsdienst beim
-- Anlegen setzt (email_confirm, damit die Anmeldung geht), zaehlt nicht und
-- braucht ein eigenes Merkmal. Ohne Bestaetigung gibt es einen neuen Code
-- nach Identitaetspruefung vor Ort (ADR-023 Punkt 10). Jede Adressaenderung
-- verlangt eine neue Bestaetigung. Die Sperre gilt im Server UND im
-- Anmeldedienst - nicht nur in der Oberflaeche.
--
-- Hier: das Merkmal und die eine Regel. Im Anmeldedienst wirkt sie ueber den
-- Mail-Hook des Zugangsdienstes (supabase/functions/platform-access/
-- authmail.ts): Der Anmeldedienst fragt vor jeder Mail
-- public.auth_email_allowed und verschickt einen Wiederherstellungslink an
-- ein Plattformkonto nur mit dem Merkmal. Den Hook schaltet OPS-001 mit dem
-- Versanddienst aus B13 ein (ANN-218).
-- =============================================================================

create table public.platform_mailbox_confirmations (
  account_user_id uuid primary key references auth.users (id) on delete cascade,
  email           text not null check (email = lower(btrim(email)) and length(email) between 3 and 254),
  confirmed_at    timestamptz not null default now(),
  confirmed_via   text not null check (confirmed_via in ('link'))
);

comment on table public.platform_mailbox_confirmations is
  'Eigenes Merkmal: Das Postfach eines Plattformkontos ist per Link bestaetigt, fuer genau diese Adresse (ABN-012, BEF-118). Der Bestaetigungsstatus des Anmeldedienstes zaehlt nicht. Faellt mit dem Konto. Kein Tabellenrecht, keine Policy.';

revoke all on public.platform_mailbox_confirmations from anon, authenticated;
alter table public.platform_mailbox_confirmations enable row level security;

insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values
  ('platform_mailbox_confirmations', 'plattformzugang', 'ueber_elterndatensatz',
   'Bestaetigtes Postfach eines Plattformkontos. Faellt mit dem Konto beim Anmeldedienst (on delete cascade, ABN-012).', 78);

-- -----------------------------------------------------------------------------
-- Ist das ein Plattformkonto? Ein Zugang zeigt auf es, oder der Zugangsdienst
-- hat es angelegt (Marke platform_account, ANN-189).
-- -----------------------------------------------------------------------------
create function app.is_platform_account(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_accesses a where a.account_user_id = p_user)
      or exists (
           select 1 from auth.users u
           where u.id = p_user
             and coalesce(u.raw_app_meta_data ->> 'platform_account', '') = 'true'
         )
$$;

revoke all on function app.is_platform_account(uuid) from public, anon, authenticated;

-- Bestaetigt gilt das Postfach nur fuer die Adresse, die das Konto HEUTE
-- traegt: Eine Aenderung der Adresse verlangt eine neue Bestaetigung.
create function app.platform_mailbox_confirmed(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_mailbox_confirmations c
    join auth.users u on u.id = c.account_user_id
    where c.account_user_id = p_user
      and c.email = lower(btrim(u.email))
  )
$$;

revoke all on function app.platform_mailbox_confirmed(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Die eine Regel, gefragt vom Anmeldedienst vor jeder Mail (nur service_role)
--
-- Praxiskonten: unveraendert. Plattformkonten: Der Anmeldedienst verschickt
-- ihnen nur den Wiederherstellungslink, und den nur mit bestaetigtem
-- Postfach. Anmelden per Mail-Link gibt es fuer sie nicht (ADR-023 Punkt 18);
-- Einladungen kommen ueber den eigenen Versand des Zugangsdienstes.
-- -----------------------------------------------------------------------------
create function public.auth_email_allowed(p_user_id uuid, p_action text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_user_id is null or p_action is null then false
    when not app.is_platform_account(p_user_id) then true
    when p_action = 'recovery' then app.platform_mailbox_confirmed(p_user_id)
    else false
  end
$$;

comment on function public.auth_email_allowed(uuid, text) is
  'Darf der Anmeldedienst diese Mail an dieses Konto schicken? Praxiskonten ja; Plattformkonten nur den Wiederherstellungslink und nur mit per Link bestaetigtem Postfach fuer die aktuelle Adresse (ABN-012, BEF-118, ANN-218). Nur service_role (Mail-Hook des Zugangsdienstes).';

revoke all on function public.auth_email_allowed(uuid, text) from public, anon, authenticated;
grant execute on function public.auth_email_allowed(uuid, text) to service_role;

-- -----------------------------------------------------------------------------
-- Zweitreview B4: Jede Adressaenderung verlangt eine neue Bestaetigung - auch
-- die Rueckkehr zu einer frueher bestaetigten Adresse. Das Merkmal faellt mit
-- jeder Aenderung von auth.users.email.
-- -----------------------------------------------------------------------------
create function app.drop_mailbox_confirmation_on_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    delete from public.platform_mailbox_confirmations c where c.account_user_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function app.drop_mailbox_confirmation_on_email_change() from public, anon, authenticated;

create trigger platform_mailbox_confirmation_follows_email
  after update of email on auth.users
  for each row execute function app.drop_mailbox_confirmation_on_email_change();
