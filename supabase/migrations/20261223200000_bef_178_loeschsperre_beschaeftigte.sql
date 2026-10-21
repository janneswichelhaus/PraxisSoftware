-- =============================================================================
-- BEF-178: Loeschsperre fuer Beschaeftigtendaten (ANN-674, Aenderungspfad von
-- ANN-033)
--
-- ANN-033 liess die Loeschsperre nur fuer Patientenakten zu, weil es fuer
-- Beschaeftigtendaten keine automatische Loeschung gab (ANN-030). Seit den
-- Ueberholungen 7 bis 10 loescht der Lauf Urlaub, Arbeitszeitaenderungen,
-- Zeitkonto und Erstattungen - jeweils an der Grenze, an der ein laufender
-- Streit sie braeuchte. ADR-008 Punkt 7 verlangt, dass eine Sperre die
-- automatische Loeschung waehrend laufender Vorgaenge verhindert.
--
-- Was diese Migration tut:
--
--   1. Gegenstand `staff_member` in public.legal_holds zulassen.
--   2. public.place_staff_legal_hold: owner setzt eine Sperre auf eine Person
--      des Teams, mit Pflichtgrund - wie bei der Akte (ANN-033).
--   3. public.release_legal_hold hebt beide Gegenstaende auf; die Fotos der
--      Akte (ADR-017 Punkt 36) faellt sie nur bei einer Akte.
--   4. public.list_legal_holds nennt die Person auch fuer eine Sperre an
--      Beschaeftigtendaten.
--   5. Die vier Loeschregeln fragen app.under_legal_hold(..., 'staff_member',
--      ...): Solange die Sperre laeuft, faellt nichts von dieser Person -
--      auch nicht Abgelehntes und Zurueckgezogenes, das ein Streit ebenso
--      braucht.
--
-- Was sie NICHT tut: Teamchat, Radflotte und Rueckmeldungen bleiben aussen
-- vor (Auftrag BEF-178). Rueckmeldungen sind ohne Personenbezug gespeichert
-- (Par. 20.2); eine Sperre je Person liesse sich dort gar nicht auswerten,
-- ohne die Anonymitaet aufzuheben.
--
-- Kein Auditeintrag: Wer wann gesperrt und aufgehoben hat, steht an der Sperre
-- selbst (ADR-010 Punkt 15, seit LOG-EPIC-001 auch bei der Akte). Abgewiesene
-- Versuche schreiben wie bisher access.denied mit der Operation
-- legal_hold.placed (G6c); der Katalog bleibt unveraendert.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Gegenstand
-- -----------------------------------------------------------------------------
alter table public.legal_holds drop constraint legal_holds_subject_type_check;
alter table public.legal_holds add constraint legal_holds_subject_type_check
  check (subject_type in ('patient', 'staff_member'));

comment on table public.legal_holds is
  'Loeschsperre fuer laufende rechtliche Vorgaenge (ADR-008 Punkt 7, LOE-001c). Setzt die automatische Loeschung aus, nicht die Zugriffsregeln (ADR-004). Gegenstand: eine Patientenakte (ANN-033) oder die Beschaeftigtendaten einer Person des Teams (ANN-674). Datenklasse: wie der Gegenstand - der Grund ist eine Angabe ueber die betroffene Person.';

-- Zuordnung im Retention Schedule: Eine Sperre an Beschaeftigtendaten bleibt
-- wie der Mitarbeiterdatensatz, dessen Frist offen ist (ANN-030).
insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values
  ('legal_holds', 'beschaeftigtendaten', 'keine',
   'Loeschsperren an Beschaeftigtendaten (BEF-178, ANN-674), laufende und aufgehobene. Bleiben wie der Mitarbeiterdatensatz; Frist offen (ANN-030).', 76);

-- -----------------------------------------------------------------------------
-- 2. place_staff_legal_hold
--
-- Dieselben Pruefungen wie place_legal_hold: angemeldet, owner, eigene
-- Organisation, Pflichtgrund. Eine Person ausserhalb der eigenen Organisation
-- ist von einer unbekannten nicht zu unterscheiden. Auch eine Person, die
-- nicht mehr aktiv ist, laesst sich sperren - gerade nach dem Ausscheiden
-- entsteht der Streit.
-- -----------------------------------------------------------------------------
create function public.place_staff_legal_hold(
  p_staff_member_id uuid,
  p_reason          text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_hold  uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_legal_hold() then
    -- G6c: abgewiesen wird mit einem bestaetigten denied-Eintrag und HTTP 403.
    perform app.record_denied_write(v_actor, 'legal_hold.placed', 'not allowed to manage legal holds');
    return null;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage legal holds' using errcode = '42501';
  end if;

  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'a legal hold needs a reason' using errcode = '22023';
  end if;

  perform 1
  from public.staff_members s
  where s.id = p_staff_member_id
    and s.organization_id = v_org;

  if not found then
    raise exception 'staff member not found' using errcode = 'P0002';
  end if;

  -- Wie bei der Akte (ABN-018): Eine weitere Sperre mit eigenem Grund ist
  -- zulaessig; jede bleibt wirksam, bis sie selbst aufgehoben ist.
  insert into public.legal_holds (
    organization_id, subject_type, subject_id, reason, placed_by
  )
  values (v_org, 'staff_member', p_staff_member_id, btrim(p_reason), v_actor)
  returning id into v_hold;

  return v_hold;
end;
$$;

comment on function public.place_staff_legal_hold(uuid, text) is
  'Setzt eine Loeschsperre auf die Beschaeftigtendaten einer Person des Teams: Urlaub, Arbeitszeitaenderungen, Zeitkonto, Erstattungen (ADR-008 Punkt 7, BEF-178, ANN-674). Nur owner. Nachweis an der Sperre (placed_by, placed_at), kein Auditeintrag.';

revoke all on function public.place_staff_legal_hold(uuid, text) from public, anon;
grant execute on function public.place_staff_legal_hold(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. release_legal_hold
--
-- Unveraendert bis auf den Gegenstand: Die Fotos, die eine Sperre an der Akte
-- gesperrt gehalten hat, fallen sofort (ADR-017 Punkt 36). Beschaeftigtendaten
-- faellt der naechste Loeschlauf.
-- -----------------------------------------------------------------------------
create or replace function public.release_legal_hold(p_hold_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor        uuid;
  v_org          uuid;
  v_subject      uuid;
  v_subject_type text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_legal_hold() then
    -- G6c: abgewiesen wird mit einem bestaetigten denied-Eintrag und HTTP 403.
    perform app.record_denied_write(v_actor, 'legal_hold.released', 'not allowed to manage legal holds');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage legal holds' using errcode = '42501';
  end if;

  select h.subject_id, h.subject_type into v_subject, v_subject_type
  from public.legal_holds h
  where h.id = p_hold_id
    and h.organization_id = v_org
    and h.released_at is null
  for update;

  if not found then
    raise exception 'legal hold not found' using errcode = 'P0002';
  end if;

  update public.legal_holds
     set released_at = now(),
         released_by = v_actor
   where id = p_hold_id;

  -- Punkt 36: Was der Hold gesperrt gehalten hat, faellt, sobald er endet -
  -- nicht erst im naechsten Loeschlauf.
  if v_subject_type = 'patient' then
    perform app.delete_due_patient_photos(
      v_org, v_subject, extensions.gen_random_uuid(), v_actor, 'legal_hold_released'
    );
  end if;
end;
$$;

comment on function public.release_legal_hold(uuid) is
  'Hebt eine laufende Loeschsperre auf, an einer Akte oder an Beschaeftigtendaten (LOE-001c, ANN-674). Die Zeile bleibt als Nachweis bestehen. Nur owner.';

-- -----------------------------------------------------------------------------
-- 4. list_legal_holds
--
-- Der einzige Lesepfad, weiter nur owner. Fuer eine Sperre an
-- Beschaeftigtendaten steht der Name der Person, wie bei der Akte.
-- -----------------------------------------------------------------------------
create or replace function public.list_legal_holds()
returns table (
  id             uuid,
  subject_type   text,
  subject_id     uuid,
  subject_name   text,
  reason         text,
  placed_at      timestamptz,
  placed_by_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_legal_hold() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'legal_holds.read', 'not allowed to manage legal holds');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage legal holds' using errcode = '42501';
  end if;

  return query
    select h.id,
           h.subject_type,
           h.subject_id,
           coalesce(pe.given_name || ' ' || pe.family_name,
                    spe.given_name || ' ' || spe.family_name),
           h.reason,
           h.placed_at,
           up.display_name
    from public.legal_holds h
    left join public.patients p       on p.id = h.subject_id and h.subject_type = 'patient'
                                     and p.organization_id = h.organization_id
    left join public.persons pe       on pe.id = p.person_id
    left join public.staff_members sm on sm.id = h.subject_id and h.subject_type = 'staff_member'
                                     and sm.organization_id = h.organization_id
    left join public.persons spe      on spe.id = sm.person_id
    left join public.user_profiles up on up.id = h.placed_by
    where h.organization_id = v_org
      and h.released_at is null
    order by h.placed_at desc;
end;
$$;

comment on function public.list_legal_holds() is
  'Laufende Loeschsperren der eigenen Organisation samt betroffener Person - Akte oder Beschaeftigtendaten (LOE-001c, ANN-674). Nur owner.';

-- -----------------------------------------------------------------------------
-- 5. Die vier Loeschregeln
--
-- Unveraendert bis auf eine Bedingung je Regel: nicht, solange eine Sperre an
-- den Beschaeftigtendaten der Person laeuft.
-- -----------------------------------------------------------------------------
create or replace function app.delete_due_staff_leave(p_org uuid, p_time_zone text, p_run uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anzahl integer := 0;
  v_teil   integer;
begin
  -- Genehmigt und storniert: drei Jahre ab Ende des Kalenderjahres, in dem
  -- der Urlaub endet. Ein Storno faellt mit seinem Urlaub (cascade).
  with faellig as (
    select r.id, r.organization_id,
           app.retention_due_at(
             make_date(extract(year from r.ends_on)::integer, 12, 31),
             app.retention_interval('urlaub'),
             p_time_zone
           ) as due_at
    from public.staff_leave_requests r
    where r.organization_id = p_org and r.kind = 'leave' and r.status in ('approved', 'cancelled')
      and not exists (
        select 1 from public.staff_leave_requests c
        where c.refers_to = r.id and c.status = 'requested'
      )
      and not app.under_legal_hold(p_org, 'staff_member', r.staff_member_id)
  ),
  geloescht as (
    delete from public.staff_leave_requests r
    using faellig f
    where r.id = f.id and f.due_at <= now()
    returning r.id, r.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run, 'staff_leave_requests', g.id, 'urlaub', f.due_at
  from geloescht g join faellig f on f.id = g.id;
  get diagnostics v_teil = row_count;
  v_anzahl := v_anzahl + v_teil;

  -- Abgelehnt und zurueckgezogen - auch ein abgelehnter oder
  -- zurueckgezogener Storno: ein Jahr nach ihrem Ende.
  with faellig as (
    select r.id, r.organization_id,
           app.retention_due_at(
             (coalesce(r.decided_at, r.withdrawn_at) at time zone p_time_zone)::date,
             app.retention_interval('urlaub_kurz'),
             p_time_zone
           ) as due_at
    from public.staff_leave_requests r
    where r.organization_id = p_org and r.status in ('rejected', 'withdrawn')
      and not app.under_legal_hold(p_org, 'staff_member', r.staff_member_id)
  ),
  geloescht as (
    delete from public.staff_leave_requests r
    using faellig f
    where r.id = f.id and f.due_at <= now()
    returning r.id, r.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run, 'staff_leave_requests', g.id, 'urlaub_kurz', f.due_at
  from geloescht g join faellig f on f.id = g.id;
  get diagnostics v_teil = row_count;
  v_anzahl := v_anzahl + v_teil;

  -- Ansprueche: drei Jahre ab Ende ihres Jahres.
  with faellig as (
    select e.id, e.organization_id,
           app.retention_due_at(
             make_date(e.year, 12, 31),
             app.retention_interval('urlaub'),
             p_time_zone
           ) as due_at
    from public.staff_leave_entitlements e
    where e.organization_id = p_org
      and not app.under_legal_hold(p_org, 'staff_member', e.staff_member_id)
  ),
  geloescht as (
    delete from public.staff_leave_entitlements e
    using faellig f
    where e.id = f.id and f.due_at <= now()
    returning e.id, e.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run, 'staff_leave_entitlements', g.id, 'urlaub', f.due_at
  from geloescht g join faellig f on f.id = g.id;
  get diagnostics v_teil = row_count;
  v_anzahl := v_anzahl + v_teil;

  return v_anzahl;
end;
$$;

create or replace function app.delete_due_working_time_requests(p_org uuid, p_time_zone text, p_run uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anzahl integer := 0;
  v_teil   integer;
begin
  -- Genehmigt: drei Jahre ab Ende des Kalenderjahres, in dem die Aenderung wirkt.
  with faellig as (
    select r.id, r.organization_id,
           app.retention_due_at(
             make_date(extract(year from r.on_date)::integer, 12, 31),
             app.retention_interval('arbeitszeit'),
             p_time_zone
           ) as due_at
    from public.staff_working_time_requests r
    where r.organization_id = p_org and r.status = 'approved'
      and not app.under_legal_hold(p_org, 'staff_member', r.staff_member_id)
  ),
  geloescht as (
    delete from public.staff_working_time_requests r
    using faellig f
    where r.id = f.id and f.due_at <= now()
    returning r.id, r.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run, 'staff_working_time_requests', g.id, 'arbeitszeit', f.due_at
  from geloescht g join faellig f on f.id = g.id;
  get diagnostics v_teil = row_count;
  v_anzahl := v_anzahl + v_teil;

  -- Abgelehnt und zurueckgezogen: ein Jahr nach ihrem Ende.
  with faellig as (
    select r.id, r.organization_id,
           app.retention_due_at(
             (coalesce(r.decided_at, r.withdrawn_at) at time zone p_time_zone)::date,
             app.retention_interval('arbeitszeit_kurz'),
             p_time_zone
           ) as due_at
    from public.staff_working_time_requests r
    where r.organization_id = p_org and r.status in ('rejected', 'withdrawn')
      and not app.under_legal_hold(p_org, 'staff_member', r.staff_member_id)
  ),
  geloescht as (
    delete from public.staff_working_time_requests r
    using faellig f
    where r.id = f.id and f.due_at <= now()
    returning r.id, r.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run, 'staff_working_time_requests', g.id, 'arbeitszeit_kurz', f.due_at
  from geloescht g join faellig f on f.id = g.id;
  get diagnostics v_teil = row_count;
  v_anzahl := v_anzahl + v_teil;

  return v_anzahl;
end;
$$;

create or replace function app.delete_due_time_account_entries(p_org uuid, p_time_zone text, p_run uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anzahl integer := 0;
  v_teil   integer;
begin
  -- Gültige: drei Jahre ab Ende des Jahres ihres Datums. Ihr Saldo bleibt als
  -- Übertrag des Jahres stehen (app.carry_over_time_account_entry); ihre
  -- Abweichung fällt mit (cascade). Überträge bleiben (ANN-030).
  with faellig as (
    select e.id, e.organization_id,
           app.retention_due_at(
             make_date(extract(year from e.on_date)::integer, 12, 31),
             app.retention_interval('zeitkonto'),
             p_time_zone
           ) as due_at
    from public.staff_time_account_entries e
    where e.organization_id = p_org and e.status = 'valid' and e.kind <> 'carryover'
      and not app.under_legal_hold(p_org, 'staff_member', e.staff_member_id)
  ),
  geloescht as (
    -- Erneut geprüft: Wird ein Eintrag während des Laufs zurückgewiesen
    -- oder zurückgenommen, fällt er hier nicht als gültiger (Zweitreview
    -- Runde 2).
    delete from public.staff_time_account_entries e
    using faellig f
    where e.id = f.id and f.due_at <= now() and e.status = 'valid'
    returning e.id, e.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run, 'staff_time_account_entries', g.id, 'zeitkonto', f.due_at
  from geloescht g join faellig f on f.id = g.id;
  get diagnostics v_teil = row_count;
  v_anzahl := v_anzahl + v_teil;

  -- Zurückgewiesen und zurückgenommen: ein Jahr nach ihrem Ende.
  with faellig as (
    select e.id, e.organization_id,
           app.retention_due_at(
             (coalesce(e.rejected_at, e.withdrawn_at) at time zone p_time_zone)::date,
             app.retention_interval('zeitkonto_kurz'),
             p_time_zone
           ) as due_at
    from public.staff_time_account_entries e
    where e.organization_id = p_org and e.status in ('rejected', 'withdrawn')
      and not app.under_legal_hold(p_org, 'staff_member', e.staff_member_id)
  ),
  geloescht as (
    delete from public.staff_time_account_entries e
    using faellig f
    where e.id = f.id and f.due_at <= now()
    returning e.id, e.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run, 'staff_time_account_entries', g.id, 'zeitkonto_kurz', f.due_at
  from geloescht g join faellig f on f.id = g.id;
  get diagnostics v_teil = row_count;
  v_anzahl := v_anzahl + v_teil;

  return v_anzahl;
end;
$$;

create or replace function app.delete_due_reimbursements(p_org uuid, p_time_zone text, p_run uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anzahl integer := 0;
  v_teil   integer;
begin
  -- Ausgezahlt: acht Jahre ab Ende des Jahres der Auszahlung (Par. 147 AO).
  -- Die Belege fallen mit (cascade), ihre Objekte über den Löschauftrag.
  with faellig as (
    select r.id, r.organization_id,
           app.retention_due_at(
             make_date(extract(year from (r.paid_at at time zone p_time_zone))::integer, 12, 31),
             app.retention_interval('erstattung'),
             p_time_zone
           ) as due_at
    from public.staff_reimbursements r
    where r.organization_id = p_org and r.status = 'paid'
      and not app.under_legal_hold(p_org, 'staff_member', r.staff_member_id)
  ),
  geloescht as (
    -- Erneut geprüft wie beim Zeitkonto: nur, was noch ausgezahlt ist.
    delete from public.staff_reimbursements r
    using faellig f
    where r.id = f.id and f.due_at <= now() and r.status = 'paid'
    returning r.id, r.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run, 'staff_reimbursements', g.id, 'erstattung', f.due_at
  from geloescht g join faellig f on f.id = g.id;
  get diagnostics v_teil = row_count;
  v_anzahl := v_anzahl + v_teil;

  -- Abgelehnt und zurückgezogen: ein Jahr nach ihrem Ende.
  with faellig as (
    select r.id, r.organization_id,
           app.retention_due_at(
             (coalesce(r.decided_at, r.withdrawn_at) at time zone p_time_zone)::date,
             app.retention_interval('erstattung_kurz'),
             p_time_zone
           ) as due_at
    from public.staff_reimbursements r
    where r.organization_id = p_org and r.status in ('rejected', 'withdrawn')
      and not app.under_legal_hold(p_org, 'staff_member', r.staff_member_id)
  ),
  geloescht as (
    delete from public.staff_reimbursements r
    using faellig f
    where r.id = f.id and f.due_at <= now() and r.status in ('rejected', 'withdrawn')
    returning r.id, r.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run, 'staff_reimbursements', g.id, 'erstattung_kurz', f.due_at
  from geloescht g join faellig f on f.id = g.id;
  get diagnostics v_teil = row_count;
  v_anzahl := v_anzahl + v_teil;

  return v_anzahl;
end;
$$;
