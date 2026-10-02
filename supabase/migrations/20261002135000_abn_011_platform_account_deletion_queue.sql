-- =============================================================================
-- ABN-011 (BEF-115): Plattformkonten ueber die Admin-API loeschen
--
-- Abnahme Jannes, 2026-10-02 (ANN-189): Fristen wie gebaut - das Konto faellt
-- 30 Tage nach dem Ende ALLER seiner Zugaenge, der Ablauf einer Einladung
-- beendet nur einen nie eingeloesten Zugang. Neu ist der Weg: Bisher loeschte
-- der Loeschlauf das Konto per SQL aus auth.users. Das ist am Anmeldedienst
-- vorbei - seine Sitzungen, Identitaeten und Faktoren haengen an Tabellen,
-- deren Aufraeumen er selbst verantwortet. Unterstuetzt ist die Admin-API.
--
-- Jetzt:
--   1. Der Loeschlauf entzieht die Zugaenge wie bisher sofort und gibt einen
--      LOESCHAUFTRAG in public.platform_account_deletions.
--   2. Der Zugangsdienst (Edge Function platform-access, Aufgabe
--      konten_loeschen) holt die Auftraege ab, loescht ueber
--      DELETE /auth/v1/admin/users/{id} und bestaetigt.
--   3. Erst die Bestaetigung schreibt das Loeschjournal - es sagt, was
--      tatsaechlich geloescht ist. Nach einem Restore gibt
--      reapply_deletion_journal fuer jedes wieder aufgetauchte Konto einen
--      neuen Auftrag.
--
-- Scharf erst mit OPS-001: Die Edge Runtime ist fuer produktive Daten noch
-- nicht geprueft (ADR-015 Punkt 20); am Testprojekt zu pruefen.
-- =============================================================================

create table public.platform_account_deletions (
  account_user_id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  run_id          uuid,
  due_at          timestamptz not null,
  reason          text not null check (reason in ('retention', 'unbound', 'reapply')),
  ordered_at      timestamptz not null default now(),
  claimed_at      timestamptz,
  attempts        smallint not null default 0 check (attempts >= 0)
);

comment on table public.platform_account_deletions is
  'Loeschauftraege fuer Plattformkonten beim Anmeldedienst (ABN-011, BEF-115). Der Loeschlauf gibt sie, der Zugangsdienst fuehrt sie ueber die Admin-API aus und bestaetigt; die Bestaetigung schreibt das Loeschjournal und entfernt den Auftrag. Enthaelt nur Kennungen und Fristen. Kein Tabellenrecht, keine Policy: nur ueber die Funktionen dieser Migration.';

revoke all on public.platform_account_deletions from anon, authenticated;
alter table public.platform_account_deletions enable row level security;

insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values
  ('platform_account_deletions', 'plattformzugang', 'keine',
   'Offene Loeschauftraege fuer Plattformkonten. Ein Auftrag verschwindet mit seiner Bestaetigung; was bleibt, ist der Eintrag im Loeschjournal (ABN-011).', 77);

-- -----------------------------------------------------------------------------
-- Auftrag geben (an einer Stelle)
-- -----------------------------------------------------------------------------
create function app.order_platform_account_deletion(
  p_account uuid,
  p_org     uuid,
  p_run     uuid,
  p_due     timestamptz,
  p_reason  text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.platform_account_deletions
    (account_user_id, organization_id, run_id, due_at, reason)
  values (p_account, p_org, p_run, p_due, p_reason)
  on conflict (account_user_id) do nothing
$$;

revoke all on function app.order_platform_account_deletion(uuid, uuid, uuid, timestamptz, text)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Ist das Konto noch zu loeschen? Kein Praxiskonto, kein laufender Zugang.
-- Ein Konto, das seit dem Auftrag wieder eingeladen und gebunden wurde, wird
-- nicht geloescht - der Auftrag faellt.
-- -----------------------------------------------------------------------------
create function app.platform_account_still_due(p_account uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.user_profiles up where up.id = p_account)
     and not exists (
       select 1 from public.platform_accesses a
       where a.account_user_id = p_account
         and a.status <> 'revoked'
         and app.platform_access_ended_at(a.id) is null
     )
$$;

revoke all on function app.platform_account_still_due(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Der Zugangsdienst holt Auftraege ab (nur service_role)
--
-- Ein abgeholter Auftrag ist 15 Minuten vergeben; scheitert der Dienst
-- dazwischen, holt ihn der naechste Aufruf wieder. Doppelt loeschen schadet
-- nicht: Der Anmeldedienst antwortet dann 404, und der Dienst bestaetigt.
-- -----------------------------------------------------------------------------
create function public.claim_platform_account_deletions(p_limit integer default 20)
returns table (account_user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Was nicht mehr faellig ist, faellt aus der Schlange.
  delete from public.platform_account_deletions d
   where not app.platform_account_still_due(d.account_user_id);

  return query
  with frei as (
    select d.account_user_id
    from public.platform_account_deletions d
    where d.claimed_at is null or d.claimed_at < now() - interval '15 minutes'
    order by d.ordered_at, d.account_user_id
    limit greatest(least(coalesce(p_limit, 20), 100), 1)
    for update skip locked
  )
  update public.platform_account_deletions d
     set claimed_at = now(),
         attempts   = d.attempts + 1
    from frei
   where d.account_user_id = frei.account_user_id
  returning d.account_user_id;
end;
$$;

comment on function public.claim_platform_account_deletions(integer) is
  'Gibt dem Zugangsdienst faellige Loeschauftraege fuer Plattformkonten (ABN-011). Nur service_role.';

revoke all on function public.claim_platform_account_deletions(integer) from public, anon, authenticated;
grant execute on function public.claim_platform_account_deletions(integer) to service_role;

-- -----------------------------------------------------------------------------
-- Der Zugangsdienst bestaetigt (nur service_role)
--
-- Bestaetigt wird nur, was beim Anmeldedienst wirklich fort ist: Steht das
-- Konto noch in auth.users, ist die Bestaetigung falsch und wird abgewiesen.
-- -----------------------------------------------------------------------------
create function public.confirm_platform_account_deletion(p_account_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auftrag public.platform_account_deletions%rowtype;
begin
  select * into v_auftrag
  from public.platform_account_deletions d
  where d.account_user_id = p_account_user_id
  for update;

  if not found then
    raise exception 'no deletion order for this account' using errcode = 'P0002';
  end if;

  if exists (select 1 from auth.users u where u.id = p_account_user_id) then
    raise exception 'account still exists' using errcode = '23514';
  end if;

  -- Beim erneuten Anwenden steht der Eintrag schon im Journal.
  if v_auftrag.reason <> 'reapply' then
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    values
      (v_auftrag.organization_id, v_auftrag.run_id, 'auth_users', p_account_user_id,
       'plattformzugang', v_auftrag.due_at);
  end if;

  delete from public.platform_account_deletions d where d.account_user_id = p_account_user_id;
end;
$$;

comment on function public.confirm_platform_account_deletion(uuid) is
  'Bestaetigt die Loeschung eines Plattformkontos beim Anmeldedienst und schreibt das Loeschjournal (ABN-011). Nur service_role; weist ab, solange das Konto noch besteht.';

revoke all on function public.confirm_platform_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.confirm_platform_account_deletion(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- Loeschlauf und Wiederherstellung geben Auftraege statt zu loeschen
-- (Rumpf jeweils aus dem heutigen Stand, die markierten Stellen geaendert).
-- -----------------------------------------------------------------------------

-- ---- app.delete_due_platform_accounts
CREATE OR REPLACE FUNCTION app.delete_due_platform_accounts(p_org uuid, p_run uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_konto  record;
  v_anzahl integer := 0;
begin
  for v_konto in
    select a.account_user_id as id,
           max(app.platform_access_ended_at(a.id)) as ended_at
    from public.platform_accesses a
    where a.organization_id = p_org
      and a.account_user_id is not null
      and exists (select 1 from auth.users u where u.id = a.account_user_id)
      and not exists (select 1 from public.user_profiles up where up.id = a.account_user_id)
    group by a.account_user_id
    -- Jeder Zugang des Kontos ist beendet, auch in anderen Organisationen.
    having bool_and(app.platform_access_ended_at(a.id) is not null)
       and not exists (
         select 1 from public.platform_accesses b
         where b.account_user_id = a.account_user_id
           and b.organization_id <> p_org
           and app.platform_access_ended_at(b.id) is null
       )
       and max(app.platform_access_ended_at(a.id)) + app.platform_read_period() <= now()
  loop
    with entzogen as (
      update public.platform_accesses a
         set status = 'revoked',
             revoked_at = app.platform_access_ended_at(a.id),
             revoked_by = null,
             revoked_reason = 'account_deleted',
             locked_at = null,
             locked_by = null
       where a.account_user_id = v_konto.id and a.status <> 'revoked'
      returning a.id, a.organization_id
    )
    insert into public.audit_log (
      organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
    )
    select e.organization_id, null, 'system', 'platform_access.revoked', 'platform_access', e.id,
           'success', jsonb_build_object('surface', 'scheduler', 'reason', 'account_deleted')
    from entzogen e;

    -- ABN-011 (BEF-115): Geloescht wird ueber die Admin-API des
    -- Anmeldedienstes, nicht per SQL. Der Lauf gibt den Auftrag; der
    -- Zugangsdienst fuehrt ihn aus und bestaetigt, erst dann steht das Konto
    -- im Loeschjournal.
    perform app.order_platform_account_deletion(
      v_konto.id, p_org, p_run, v_konto.ended_at + app.platform_read_period(), 'retention');
    v_anzahl := v_anzahl + 1;
  end loop;

  -- Zweitreview: Ein Konto, das der Zugangsdienst angelegt hat und das nie
  -- gebunden wurde (Einloesen abgebrochen, Aufraeumen gescheitert), traegt
  -- die Marke `platform_account` in den Metadaten des Anmeldedienstes und
  -- faellt 30 Tage nach dem Anlegen. Praxiskonten tragen sie nie. Der Lauf
  -- einer Organisation raeumt nur, wenn er der erste ist: Das Konto gehoert
  -- keiner Organisation, jede Organisation saehe es gleich.
  if p_org = (select min(o.id::text)::uuid from public.organizations o) then
    for v_konto in
      select u.id, u.created_at
      from auth.users u
      where coalesce(u.raw_app_meta_data ->> 'platform_account', '') = 'true'
        and u.created_at + app.platform_read_period() <= now()
        and not exists (select 1 from public.user_profiles up where up.id = u.id)
        and not exists (select 1 from public.platform_accesses a where a.account_user_id = u.id)
    loop
      perform app.order_platform_account_deletion(
        v_konto.id, p_org, p_run, v_konto.created_at + app.platform_read_period(), 'unbound');
      v_anzahl := v_anzahl + 1;
    end loop;
  end if;
  return v_anzahl;
end;
$function$;

-- ---- public.reapply_deletion_journal
CREATE OR REPLACE FUNCTION public.reapply_deletion_journal()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_reihenfolge text[] := array[
    'invoice_payment_reminders',
    'invoice_cancellations',
    'payments',
    'invoice_items',
    'invoices',
    'invoice_recipients',
    'billable_services',
    'treatment_note_versions',
    'treatment_notes',
    'patient_files',
    -- Vor Grundlage und Termin: ein Eintrag zeigt auf beide (on delete set
    -- null) - geloescht wird er vorher, damit nichts umgeschrieben wird
    -- (PRX-001, Zweitreview 5).
    'waitlist_entries',
    -- PRX-012: eine Aufgabe zeigt auf Person und Mitarbeitende (cascade
    -- beziehungsweise set null) - geloescht wird sie vorher.
    'tasks',
    -- TRN-009: das Trainingsprotokoll haengt am Termin (restrict) und faellt
    -- vor ihm - dieselbe Reihenfolge wie im Lauf.
    'training_protocols',
    -- PRX-014: der Anrufstand haengt am Termin und faellt vor ihm.
    'appointment_call_states',
    'treatment_base_items',
    'treatment_bases',
    'appointments',
    'legal_holds',
    'patient_contact_details',
    'patient_care_details',
    'patients',
    -- TRN-EPIC-003 (Zweitreview): Kontaktdaten des Trainings aus der
    -- Teilloeschung. Ihr Schluessel ist das Verhaeltnis, nicht `id`.
    'training_contact_details',
    -- TRN-005: die Vereinbarung nach ihren Terminen (on delete set null) und
    -- vor ihrem Verhaeltnis (restrict) - dieselbe Reihenfolge wie im Lauf
    -- (app.delete_training_relationship). Fehlte seit CAL-026.
    'training_bases',
    -- Vor persons: die Person faellt erst, wenn kein Verhaeltnis mehr auf
    -- sie zeigt - nach einem Restore genauso wie im Lauf (LEI-002).
    'training_relationships',
    'persons',
    'audit_log',
    'staff_account_invitations',
    -- POR-002: der Zugang mit seinen Einladungen (on delete cascade) und das
    -- Konto beim Anmeldedienst. `auth_users` ist kein Tabellenname in
    -- public, sondern die eine Ausnahme unten.
    'platform_accesses',
    'auth_users'
  ];
  v_tabelle   text;
  v_ids       uuid[];
  v_geloescht uuid[];
  v_unbekannt text[];
  v_gesamt    integer := 0;
  v_org       record;
begin
  select array_agg(distinct j.target_table)
    into v_unbekannt
  from public.deletion_journal j
  where not (j.target_table = any (v_reihenfolge));

  if v_unbekannt is not null then
    raise exception 'deletion journal references tables without a reapply order: %', v_unbekannt
      using errcode = '22023';
  end if;

  foreach v_tabelle in array v_reihenfolge
  loop
    select array_agg(j.target_id)
      into v_ids
    from public.deletion_journal j
    where j.target_table = v_tabelle;

    continue when v_ids is null;

    -- Das Konto einer Plattform liegt beim Anmeldedienst (ADR-023 Punkt 5).
    -- ABN-011 (BEF-115): auch hier ueber die Admin-API. Was nach dem Restore
    -- wieder da ist, bekommt einen Loeschauftrag; der Journaleintrag gilt
    -- damit als erneut angewandt.
    if v_tabelle = 'auth_users' then
      select array_agg(u.id) into v_geloescht
      from auth.users u
      where u.id = any (v_ids);
      if v_geloescht is not null then
        perform app.order_platform_account_deletion(
          j.target_id, j.organization_id, null, j.due_at, 'reapply')
        from public.deletion_journal j
        where j.target_table = 'auth_users'
          and j.target_id = any (v_geloescht);
      end if;
    else
    -- Tabellenname aus der festen Liste oben, nie aus Benutzereingabe;
    -- die Kennungen gehen als Parameter, nicht als Text.
    execute format(
      'with g as (delete from public.%I where %I = any($1) returning %I as id) select array_agg(id) from g',
      v_tabelle,
      app.deletion_key_column(v_tabelle),
      app.deletion_key_column(v_tabelle)
    )
    into v_geloescht
    using v_ids;
    end if;

    if v_geloescht is not null then
      update public.deletion_journal
         set reapplied_at = now()
       where target_table = v_tabelle
         and target_id = any (v_geloescht);

      v_gesamt := v_gesamt + array_length(v_geloescht, 1);
    end if;
  end loop;

  if v_gesamt > 0 then
    for v_org in
      select j.organization_id as id, count(*) as anzahl
      from public.deletion_journal j
      where j.reapplied_at = now()
      group by j.organization_id
    loop
      insert into public.audit_log (
        organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
      )
      values (
        v_org.id, null, 'system', 'retention.reapplied', 'organization', v_org.id, 'success',
        jsonb_build_object('surface', 'restore', 'records', v_org.anzahl)
      );
    end loop;
  end if;

  return v_gesamt;
end;
$function$;
