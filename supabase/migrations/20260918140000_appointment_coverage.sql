-- CAL-022: Ueber das Kontingent hinaus planen - sichtbar, nicht still
--
-- Zu einer Behandlungsgrundlage duerfen mehr Termine geplant werden, als auf
-- ihr moeglich sind: So funktionieren Dauertermine ueber das Verordnungsende
-- hinaus (docs/development/CAL-EPIC-004.md, CAL-022). Die Datenbank liess das
-- bisher schon zu - `create_appointment` prueft kein Kontingent -, aber sie
-- sagte es niemandem. Eine stille Ueberplanung ist genau der Abrechnungsfehler,
-- den PROJECT_PRINCIPLES.md 13 ausschliesst.
--
-- Diese Migration macht daraus eine Auskunft:
--
--   * **Die Grenze, die bleibt.** `prescription_items_used_within_prescribed`
--     (`used_quantity <= prescribed_quantity`) wird NICHT angefasst. Planen ist
--     nicht Verbrauchen; die Constraint schuetzt die Abrechnung (ADR-020
--     Punkt 5, ADR-009), nicht den Kalender.
--   * **Gedeckt und ungedeckt** als gerechnete Groesse: Die nicht abgesagten
--     Termine einer Grundlage werden nach Beginn geordnet; die ersten
--     `appointment_count` sind gedeckt, der Rest ist geplant, aber ungedeckt
--     (ANN-067). Die Zahl steht an der Grundlage, das Kennzeichen am Termin.
--   * **Uebertragen** als eigener, protokollierter Vorgang: Ungedeckte Termine
--     wandern auf eine andere Grundlage derselben Patient:in - alles oder
--     nichts, serverseitig geprueft, nie mit abgerechnetem Termin (ANN-068).
--
-- Kein Zukunftsvorbau: Leistungen, Preise und Rechnungen bleiben aussen vor
-- (ABR-EPIC-001, ADR-014 Paragraf 11).

-- -----------------------------------------------------------------------------
-- 1. Die Deckung eines einzelnen Termins
--
-- Welcher Termin gedeckt ist, muss fuer jeden Lesepfad dieselbe Antwort haben,
-- sonst zeigt die Akte etwas anderes als der Kalender. Deshalb steht die Regel
-- an genau einer Stelle - und sie ist deterministisch: geordnet wird nach
-- Beginn, bei gleichem Beginn nach der Kennung.
--
-- SECURITY DEFINER, weil die Antwort sonst davon abhinge, wie viele Termine
-- der Grundlage der Lesende sehen darf: Ein Patientenkonto zaehlte dieselbe
-- Grundlage anders als die Praxis. Geliefert wird ein Wahrheitswert, kein
-- Inhalt - dieselbe Bauart wie app.appointment_notification_channels.
-- -----------------------------------------------------------------------------

create or replace function app.appointment_is_covered(p_appointment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    -- Ein abgesagter Termin verbraucht nichts und blockiert nichts. Er ist
    -- weder gedeckt noch ungedeckt, und "null" sagt das ehrlicher als ein
    -- Kennzeichen, das an ihm haengen bliebe.
    when a.status = 'cancelled' then null
    else (
      select count(*)
      from public.appointments frueher
      where frueher.treatment_basis_id  = a.treatment_basis_id
        and frueher.organization_id     = a.organization_id
        and frueher.status             <> 'cancelled'
        and (frueher.starts_at, frueher.id) <= (a.starts_at, a.id)
    ) <= b.appointment_count
  end
  from public.appointments a
  -- Ohne Grundlage keine Deckung: Der Join liefert dann keine Zeile, und die
  -- Funktion gibt null zurueck. Ein Ereignis (Fehlzeit, Besprechung) faellt
  -- ueber denselben Weg heraus - es haengt nie an einer Grundlage.
  join public.treatment_bases b on b.id = a.treatment_basis_id
  where a.id = p_appointment_id
$$;

comment on function app.appointment_is_covered(uuid) is
  'Deckt die Behandlungsgrundlage diesen Termin? (CAL-022, ANN-067) Gezaehlt werden die nicht abgesagten Termine der Grundlage bis einschliesslich dieses Termins, geordnet nach Beginn und Kennung; gedeckt sind die ersten appointment_count. null heisst: keine Grundlage oder abgesagt - dann gibt es keine Aussage.';

-- Anders als die uebrigen app.*-Helfer wird diese Funktion ausgefuehrt, wo der
-- Aufrufer selbst steht: `appointment_directory` ist security_invoker, und ein
-- Entzug hiesse, dass die Terminsicht ihre Deckung nicht lesen kann. Vergeben
-- wird nur, was `app.can_read_appointments` ohnehin erlaubt - die Zeile selbst
-- filtert weiter die RLS der Basistabelle, und geliefert wird ein
-- Wahrheitswert ohne Inhalt. Dieselbe Bauart wie bei `app.can_*` in den
-- Policies (ADR-004).
revoke all on function app.appointment_is_covered(uuid) from public, anon;
grant execute on function app.appointment_is_covered(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Die Zahlen der Grundlage
--
-- Zwei neue Ausgaben neben verordnet/genutzt/verplant/offen. Sie ergeben sich
-- aus den vorhandenen: gedeckt ist der kleinere Wert aus moeglich und verplant,
-- ungedeckt der Ueberhang. Beides gehoert hierher und nicht in den Client -
-- die Akte, die Serienplanung und die Terminliste sollen dieselbe Zahl nennen.
--
-- OUT-Parameter sind Teil des Ergebnistyps: `create or replace` kann sie nicht
-- erweitern, die Funktion wird deshalb ersetzt. Auf sie zeigt keine Policy und
-- kein Trigger; die Aufrufer stehen unten und werden allesamt neu erstellt.
-- -----------------------------------------------------------------------------

drop function app.treatment_basis_slot_counts(uuid, uuid);

create function app.treatment_basis_slot_counts(
  p_treatment_basis_id uuid,
  p_organization_id uuid,
  OUT prescribed integer,
  OUT used integer,
  OUT planned integer,
  OUT remaining integer,
  OUT covered integer,
  OUT uncovered integer
)
returns record
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Die Terminzahl kommt aus der Grundlage selbst (ANN-064).
  select b.appointment_count
    into prescribed
  from public.treatment_bases b
  where b.id = p_treatment_basis_id
    and b.organization_id = p_organization_id;

  -- Auch "genutzt" ist eine Terminzahl: Ein Termin nutzt jedes Heilmittel der
  -- Grundlage einmal, deshalb zaehlt die am weitesten fortgeschrittene
  -- Position und nicht die Summe.
  select coalesce(max(i.used_quantity), 0)
    into used
  from public.treatment_base_items i
  where i.treatment_basis_id = p_treatment_basis_id;

  select count(*)
    into planned
  from public.appointments a
  where a.treatment_basis_id = p_treatment_basis_id
    and a.organization_id = p_organization_id
    and a.status <> 'cancelled';

  remaining := greatest(coalesce(prescribed, 0) - greatest(coalesce(used, 0), planned), 0);

  -- CAL-022: Gedeckt sind hoechstens so viele Termine, wie die Grundlage
  -- moeglich macht; alles darueber ist geplant, aber ungedeckt. "Offen" und
  -- "ungedeckt" sind nie beide groesser als null - die eine Zahl sagt, was
  -- noch hineinpasst, die andere, was schon darueber hinausgeht.
  covered   := least(coalesce(prescribed, 0), planned);
  uncovered := greatest(planned - coalesce(prescribed, 0), 0);
end;
$$;

comment on function app.treatment_basis_slot_counts(uuid, uuid) is
  'Kontingent einer Behandlungsgrundlage, gezaehlt in Terminen (VER-EPIC-002, ANN-064): moegliche Termine aus appointment_count, genutzte aus der groessten Positionsmenge, verplante aus den nicht abgesagten Terminen, offen ist die Differenz zum groesseren der beiden (ANN-038). Seit CAL-022 dazu gedeckt und ungedeckt (ANN-067). Nur fuer die serverseitigen Lese- und Schreibpfade.';

revoke all on function app.treatment_basis_slot_counts(uuid, uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Die Lesepfade
--
-- Drei Stellen sagen "ungedeckt": die Grundlage in der Akte, der Termin selbst
-- und die Terminliste. Jede liest ihre eigene Funktion; keine rechnet.
-- Rueckgabetypen aendern sich, deshalb wird jede Funktion ersetzt und ihre
-- Rechte werden neu vergeben.
-- -----------------------------------------------------------------------------

-- Der Termin selbst: die Detailansicht liest `appointment_directory`.
-- security_invoker bleibt - die RLS der Basistabellen gilt unveraendert; nur
-- das Zaehlen der Geschwistertermine laeuft ueber die Funktion aus Abschnitt 1.
create or replace view public.appointment_directory
with (security_invoker = true) as
select
  a.id,
  a.organization_id,
  a.patient_id,
  a.staff_member_id,
  a.location_id,
  a.treatment_basis_id,
  a.appointment_type,
  a.kind,
  a.title,
  a.event_group_id,
  a.event_series_id,
  a.status,
  a.starts_at,
  a.ends_at,
  a.updated_at,
  a.visit_street,
  a.visit_house_number,
  a.visit_postal_code,
  a.visit_city,
  a.completed_at,
  a.cancellation_reason,
  a.cancellation_received_at,
  a.fee_basis,
  a.no_show_recorded_at,
  a.no_show_protocol_confirmed,
  pp.given_name  as patient_given_name,
  pp.family_name as patient_family_name,
  sp.given_name  as staff_given_name,
  sp.family_name as staff_family_name,
  l.name         as location_name,
  o.time_zone    as organization_time_zone,
  -- Nur die Wege, nicht wer wann vermerkt hat: Akteure stehen im Auditlog
  -- (ADR-010), und die Detailansicht zeigt sie auch sonst nicht.
  coalesce(
    (select array_agg(distinct n.channel order by n.channel)
     from public.appointment_notifications n
     where n.appointment_id = a.id
       and n.notified_at >= a.updated_at),
    array[]::text[]
  ) as notification_channels,
  app.appointment_is_covered(a.id) as treatment_basis_covered
from public.appointments a
left join public.patients p  on p.id  = a.patient_id
left join public.persons pp  on pp.id = p.person_id
join public.staff_members sm on sm.id = a.staff_member_id
join public.persons sp       on sp.id = sm.person_id
join public.organizations o  on o.id  = a.organization_id
left join public.locations l on l.id = a.location_id;

comment on view public.appointment_directory is
  'Terminsicht fuer die Anwendung, Behandlungen wie Ereignisse. security_invoker: RLS der Basistabellen gilt unveraendert. Enthaelt nur organisatorische Angaben. Die vermerkende Person bleibt aussen vor - Akteure stehen im Auditlog (ADR-010). Seit CAL-017 mit der Gruppenkennung des Ereignisses, seit CAL-018 mit der Protokollbestaetigung des Nichtantreffens, seit CAL-021 mit der Serienkennung der Dauerfehlzeit, seit GRD-001 mit der Behandlungsgrundlage statt der Verordnung, seit CAL-022 mit ihrer Deckung (null: keine Grundlage oder abgesagt).';

revoke all on public.appointment_directory from anon, authenticated;
grant select on public.appointment_directory to authenticated;


-- Die Grundlage in der Akte.
drop function public.list_patient_treatment_basis_slots(uuid);

create function public.list_patient_treatment_basis_slots(p_patient_id uuid)
returns TABLE(treatment_basis_id uuid, prescribed integer, used integer, planned integer, upcoming integer, remaining integer, covered integer, uncovered integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_treatment_bases() then
    raise exception 'not allowed to read treatment_bases' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read treatment_bases' using errcode = '42501';
  end if;

  if p_patient_id is null then
    raise exception 'patient is required' using errcode = '22023';
  end if;

  return query
    select
      p.id,
      zahlen.prescribed,
      zahlen.used,
      zahlen.planned,
      (
        select count(*)::integer
        from public.appointments a
        where a.treatment_basis_id = p.id
          and a.organization_id = v_org
          and a.status <> 'cancelled'
          and a.starts_at > now()
      ),
      zahlen.remaining,
      zahlen.covered,
      zahlen.uncovered
    from public.treatment_bases p
    cross join lateral app.treatment_basis_slot_counts(p.id, v_org) zahlen
    where p.organization_id = v_org
      and p.patient_id = p_patient_id
    order by p.issued_on desc, p.id desc;
end;
$$;

comment on function public.list_patient_treatment_basis_slots(uuid) is
  'Terminzahlen je Behandlungsgrundlage einer Patient:in (AKTE-002, ANN-064): moeglich, genutzt, verplant, noch bevorstehend, offen und seit CAL-022 gedeckt/ungedeckt. Rein organisatorisch - die klinischen Felder bleiben list_patient_treatment_bases_clinical vorbehalten.';

revoke all on function public.list_patient_treatment_basis_slots(uuid) from public, anon;
grant execute on function public.list_patient_treatment_basis_slots(uuid) to authenticated;


-- Die Serienplanung: sie plant seit CAL-022 auch ueber das Kontingent hinaus
-- und muss dabei sagen koennen, was das kostet.
drop function public.get_treatment_basis_slots(uuid);

create function public.get_treatment_basis_slots(p_treatment_basis_id uuid)
returns TABLE(patient_id uuid, frequency_note text, prescribed integer, used integer, planned integer, remaining integer, covered integer, uncovered integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_zahlen record;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_treatment_bases() then
    raise exception 'not allowed to read treatment_bases' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read treatment_bases' using errcode = '42501';
  end if;

  select p.patient_id, p.frequency_note
    into patient_id, frequency_note
  from public.treatment_bases p
  where p.id = p_treatment_basis_id
    and p.organization_id = v_org;

  if not found then
    raise exception 'treatment basis not found' using errcode = 'P0002';
  end if;

  select * into v_zahlen from app.treatment_basis_slot_counts(p_treatment_basis_id, v_org);
  prescribed := v_zahlen.prescribed;
  used       := v_zahlen.used;
  planned    := v_zahlen.planned;
  remaining  := v_zahlen.remaining;
  covered    := v_zahlen.covered;
  uncovered  := v_zahlen.uncovered;
  return next;
end;
$$;

comment on function public.get_treatment_basis_slots(uuid) is
  'Terminzahl und Frequenz einer Behandlungsgrundlage fuer die Serienplanung (CAL-007, ANN-064), seit CAL-022 mit gedeckt und ungedeckt. Ohne klinische Felder.';

revoke all on function public.get_treatment_basis_slots(uuid) from public, anon;
grant execute on function public.get_treatment_basis_slots(uuid) to authenticated;


-- Die Terminliste der Akte.
drop function public.list_patient_appointments(uuid, boolean, integer, timestamp with time zone, uuid, uuid);

create function public.list_patient_appointments(
  p_patient_id uuid,
  p_upcoming boolean DEFAULT false,
  p_limit integer DEFAULT 20,
  p_after_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_after_id uuid DEFAULT NULL::uuid,
  p_treatment_basis_id uuid DEFAULT NULL::uuid
)
returns TABLE(id uuid, starts_at timestamp with time zone, ends_at timestamp with time zone, appointment_type text, status text, staff_given_name text, staff_family_name text, notification_channels text[], treatment_basis_id uuid, treatment_basis_kind text, treatment_basis_issued_on date, treatment_basis_covered boolean, organization_time_zone text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org      uuid;
  v_upcoming boolean := coalesce(p_upcoming, false);
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft.
  if not app.can_read_appointments() then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  if p_patient_id is null then
    raise exception 'patient is required' using errcode = '22023';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'limit out of range' using errcode = '22023';
  end if;

  -- Der Cursor besteht aus beiden Teilen oder gar nicht.
  if (p_after_starts_at is null) <> (p_after_id is null) then
    raise exception 'cursor is incomplete' using errcode = '22023';
  end if;

  return query
    select
      a.id,
      a.starts_at,
      a.ends_at,
      a.appointment_type,
      a.status,
      sp.given_name,
      sp.family_name,
      app.appointment_notification_channels(a.id),
      a.treatment_basis_id,
      -- GRD-001: Die Bauart kommt mit, weil die Liste die Grundlage benennen
      -- soll und nicht raten darf, ob sie eine Verordnung ist (ADR-020 Punkt
      -- 7). Sie ist organisatorisch - eine Diagnose steht hier nicht.
      pr.treatment_basis_kind,
      pr.issued_on,
      -- CAL-022: Ungedeckt heisst sichtbar - auch in der Liste, nicht nur an
      -- der Grundlage.
      app.appointment_is_covered(a.id),
      o.time_zone
    from public.appointments a
    join public.staff_members sm  on sm.id = a.staff_member_id
    join public.persons sp        on sp.id = sm.person_id
    join public.organizations o   on o.id  = a.organization_id
    left join public.treatment_bases pr on pr.id = a.treatment_basis_id
    where a.organization_id = v_org
      and a.patient_id      = p_patient_id
      and (p_treatment_basis_id is null or a.treatment_basis_id = p_treatment_basis_id)
      and (
        case when v_upcoming then a.starts_at > now() else a.starts_at <= now() end
      )
      and (
        p_after_starts_at is null
        or (
          case
            when v_upcoming then (a.starts_at, a.id) > (p_after_starts_at, p_after_id)
            else (a.starts_at, a.id) < (p_after_starts_at, p_after_id)
          end
        )
      )
    -- Die Richtung steckt in der Sortierung: In jedem Lauf sind zwei der vier
    -- Ausdruecke fuer JEDE Zeile null und damit wirkungslos - uebrig bleibt
    -- genau das Paar der gewaehlten Richtung. Das ist billiger als zwei
    -- Rumpfvarianten derselben Abfrage, die getrennt gepflegt werden muessten.
    order by
      case when v_upcoming then a.starts_at end asc,
      case when v_upcoming then a.id end asc,
      case when not v_upcoming then a.starts_at end desc,
      case when not v_upcoming then a.id end desc
    limit p_limit;
end;
$$;

comment on function public.list_patient_appointments(uuid, boolean, integer, timestamp with time zone, uuid, uuid) is
  'Termine einer Patient:in fuer die Akte (AKTE-001): kommend oder vergangen, alle Zustaende, mit Mitteilungsvermerk und Bezug zur Behandlungsgrundlage samt ihrer Bauart und - seit CAL-022 - ihrer Deckung, geblaettert ueber einen Keyset-Cursor. Rein organisatorisch, ohne Anschrift und ohne klinische Inhalte.';

revoke all on function public.list_patient_appointments(uuid, boolean, integer, timestamp with time zone, uuid, uuid) from public, anon;
grant execute on function public.list_patient_appointments(uuid, boolean, integer, timestamp with time zone, uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Uebertragen auf eine andere Grundlage
--
-- Der Auditwert tritt NEBEN die vorhandenen; keine Zeile wird umgeschrieben
-- (ADR-010, ADR-020 Punkt 8). Subjekt ist die Zielgrundlage - dort landet der
-- Vorgang, und dort sucht ihn spaeter jemand.
-- -----------------------------------------------------------------------------

alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in (
    'patient_record.viewed',
    'audit_log.read',
    'patient.created',
    'patient.updated',
    'patient.status_changed',
    'patient.care_concluded',
    'patient.care_reopened',
    'legal_hold.placed',
    'legal_hold.released',
    'retention.applied',
    'retention.reapplied',
    'appointment.created',
    'appointment.updated',
    'appointment.rescheduled',
    'appointment.cancelled',
    'appointment.no_show',
    'appointment.completed',
    'appointment.documented',
    'appointment.reopened',
    'appointment.notified',
    'organization.appointment_grid_changed',
    'organization.documentation_deadline_changed',
    'staff_working_hours.created',
    'staff_working_hours.updated',
    'staff_working_hours.removed',
    'staff_working_hour_exception.created',
    'staff_working_hour_exception.updated',
    'staff_working_hour_exception.removed',
    'staff_member.created',
    'staff_member.updated',
    'staff_member.status_changed',
    'staff_account.invited',
    'staff_account.invitation_revoked',
    'staff_account.invitation_accepted',
    'staff_account.roles_changed',
    'staff_account.locked',
    'staff_account.unlocked',
    'staff_account.password_reset_requested',
    'account.password_changed',
    'account.sessions_ended',
    'account.mfa_enrolled',
    'account.mfa_removed',
    'treatment_note.created',
    'treatment_note.updated',
    'treatment_note.viewed',
    'treatment_note.finalized',
    'treatment_note.auto_finalized',
    'treatment_note.revised',
    'treatment_note.addendum_created',
    'treatment_note.history_viewed',
    -- Bis GRD-001 geschrieben, seitdem nur noch gelesen (ADR-020 Punkt 8).
    'prescription.viewed',
    'prescription.created',
    'prescription.updated',
    'prescription.deleted',
    'treatment_basis.viewed',
    'treatment_basis.created',
    'treatment_basis.updated',
    'treatment_basis.deleted',
    -- CAL-022: ein Ereignis je Uebertragung, nicht je Termin.
    'treatment_basis.appointments_transferred',
    'patient_file.uploaded',
    'patient_file.link_issued',
    'patient_file.deleted',
    'patient_file.type_corrected',
    'storage_deletion.claimed',
    'storage_deletion.receipted',
    'text_snippet.created',
    'text_snippet.updated',
    'text_snippet.deleted'
  ));


create or replace function public.transfer_appointments_to_treatment_basis(
  p_treatment_basis_id uuid,
  p_appointment_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org       uuid;
  v_actor     uuid := auth.uid();
  v_patient   uuid;
  v_anzahl    integer;
  v_geschickt integer;
  v_quellen   uuid[];
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Uebertragen aendert einen Termin, nicht die Grundlage: Es ist dasselbe
  -- Recht wie das Umplanen (ADR-004). Wer eine Verordnung schreiben darf, hat
  -- es ohnehin; das Office plant Termine und darf deshalb auch uebertragen.
  if not app.can_update_appointment() then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  if p_treatment_basis_id is null then
    raise exception 'treatment basis is required' using errcode = '22023';
  end if;

  if p_appointment_ids is null or cardinality(p_appointment_ids) = 0 then
    raise exception 'appointments must be a non-empty array' using errcode = '22023';
  end if;

  -- Die Zielgrundlage bestimmt die Patient:in. Sie wird hier gelesen und nicht
  -- vom Aufrufer entgegengenommen: Eine mitgeschickte Patientenkennung waere
  -- eine zweite Wahrheit, die auseinanderlaufen kann.
  select p.patient_id
    into v_patient
  from public.treatment_bases p
  where p.id = p_treatment_basis_id
    and p.organization_id = v_org;

  if not found then
    raise exception 'treatment basis not found' using errcode = 'P0002';
  end if;

  -- Alles oder nichts: Erst wird gezaehlt, was die Bedingungen erfuellt, dann
  -- geschrieben. Eine Kennung, die durchfaellt - fremde Organisation, andere
  -- Patient:in, abgesagt, abgerechnet oder ein Ereignis ohne Patient:in -,
  -- laesst den ganzen Vorgang scheitern.
  v_geschickt := cardinality(array(select distinct unnest(p_appointment_ids)));

  select count(*), array_agg(distinct a.treatment_basis_id)
    into v_anzahl, v_quellen
  from public.appointments a
  where a.id = any(p_appointment_ids)
    and a.organization_id = v_org
    and a.patient_id      = v_patient
    and a.status not in ('cancelled', 'invoiced');

  if v_anzahl <> v_geschickt then
    raise exception 'appointments are not transferable' using errcode = '22023';
  end if;

  -- Der Termin behaelt Tag, Zeit, Person und Ort. `updated_at` bleibt deshalb
  -- unberuehrt: Der Mitteilungsvermerk haengt daran (CAL-012) und gilt weiter -
  -- mitgeteilt wurde ein Zeitpunkt, keine Grundlage.
  update public.appointments a
     set treatment_basis_id = p_treatment_basis_id
   where a.id = any(p_appointment_ids)
     and a.organization_id = v_org;

  -- Ein Ereignis je Uebertragung (CAL-022), ohne klinischen Inhalt: wer, wann,
  -- welche Termine, von welcher Grundlage auf welche.
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'treatment_basis.appointments_transferred', 'treatment_basis',
    p_treatment_basis_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_patient,
      'appointment_ids', to_jsonb(p_appointment_ids),
      'from_treatment_basis_ids', to_jsonb(coalesce(v_quellen, array[]::uuid[])),
      'appointment_count', v_anzahl
    )
  );

  return v_anzahl;
end;
$$;

comment on function public.transfer_appointments_to_treatment_basis(uuid, uuid[]) is
  'Uebertraegt Termine auf eine andere Behandlungsgrundlage derselben Patient:in (CAL-022, ANN-068): alles oder nichts, die Patient:in kommt aus der Zielgrundlage, abgesagte und abgerechnete Termine sind ausgeschlossen. Kein Kontingentabbruch - ueber das Kontingent hinaus zu planen ist zulaessig und wird als ungedeckt angezeigt. Protokolliert ein Ereignis je Vorgang (ADR-010).';

revoke all on function public.transfer_appointments_to_treatment_basis(uuid, uuid[]) from public, anon;
grant execute on function public.transfer_appointments_to_treatment_basis(uuid, uuid[]) to authenticated;
