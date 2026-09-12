-- =============================================================================
-- Mitteilungsvermerk am Termin (CAL-012)
--
-- In der Terminliste der Akte soll auf einen Blick stehen, OB und ueber WELCHEN
-- Weg ein Termin der Patient:in mitgeteilt wurde - und der Vermerk soll
-- verfallen, sobald der Termin sich aendert. Ohne das ruft die Praxis im
-- Zweifel zweimal an oder gar nicht.
--
-- WICHTIGE ABGRENZUNG: Die Anwendung VERSENDET WEITERHIN NICHTS. B15 ist
-- vorlaeufig entschieden (Jannes, 2026-09-08): in Stufe 1 und 2 keine
-- automatische Terminerinnerung, die Anrufliste bleibt der Weg. Dieser Vermerk
-- haelt fest, was die Praxis SELBST getan hat - Zettel ausgehaendigt,
-- angerufen, persoenlich gesagt, selbst eine E-Mail geschrieben. Das ist eine
-- Notiz ueber einen Vorgang ausserhalb der Anwendung, kein Versandweg, kein
-- neuer Dienstleister und keine Einwilligung (PROJECT_PRINCIPLES.md 3.5).
-- Die Wahl des Kanals bleibt Sache der Praxis und ihrer Datenschutzunterlagen;
-- die Anwendung bewertet sie nicht (ANN-040).
--
-- Vier Festlegungen dahinter:
--
--   * DER VERMERK VERFAELLT VON SELBST. Gueltig ist er nur, solange
--     notified_at >= appointments.updated_at. Jede Aenderung am Termin bumpt
--     updated_at und macht ihn damit still ungueltig - ohne dass etwas
--     geloescht wird. Genau das verlangt der Alltag: Wer die Uhrzeit
--     verschiebt, hat die neue Zeit noch nicht mitgeteilt.
--   * DIE HISTORIE BLEIBT. Ein alter Vermerk wird nicht entfernt, sondern
--     ungueltig. "Wir haben ueber die alte Zeit informiert" bleibt damit
--     nachvollziehbar, und die Zeile traegt Zeitpunkt und Person.
--   * EIGENE TABELLE, NICHT SPALTEN AM TERMIN. Spalten an public.appointments
--     waeren ein zweiter Schreibweg auf dieselbe Zeile - und schlimmer: Das
--     Setzen wuerde updated_at anfassen und den Vermerk im selben Zug selbst
--     ungueltig machen.
--   * KEIN KANAL OHNE SCHREIBER. 'sms' und 'messenger' stehen NICHT im
--     Wertebereich: Messenger ist nach B15 ausgeschlossen, SMS gibt es nicht.
--     Ein Wert, den niemand setzen kann, waere Vorbau (ADR-014).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- appointment_notifications
--
-- Datenklasse wie der Termin selbst: organisatorische Behandlungsdaten. Der
-- Vermerk sagt nichts ueber den Inhalt einer Behandlung, nur darueber, dass
-- ein Termin besprochen wurde. ON DELETE CASCADE, weil er ohne seinen Termin
-- keine Bedeutung hat - der Loeschlauf entfernt ihn damit mit dem Termin, ohne
-- eine eigene Regel im Retention Schedule (ADR-008).
-- -----------------------------------------------------------------------------
create table public.appointment_notifications (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  appointment_id  uuid not null references public.appointments (id) on delete cascade,

  -- 'slip'      Terminzettel ausgehaendigt (CAL-011)
  -- 'phone'     telefonisch mitgeteilt
  -- 'in_person' persoenlich gesagt, meist am Termin davor
  -- 'email'     die Praxis hat selbst eine E-Mail geschrieben
  channel         text not null
                    check (channel in ('slip', 'phone', 'in_person', 'email')),

  notified_at     timestamptz not null default now(),
  notified_by     uuid
);

comment on table public.appointment_notifications is
  'Vermerk, dass ein Termin der Patient:in mitgeteilt wurde, und auf welchem Weg (CAL-012, ANN-040). Die Anwendung versendet nichts - der Vermerk beschreibt einen Vorgang ausserhalb (B15). Gueltig nur, solange notified_at >= appointments.updated_at. Datenklasse: organisatorische Behandlungsdaten, faellt mit dem Termin.';
comment on column public.appointment_notifications.channel is
  'Weg der Mitteilung. Kein automatischer Versand: auch ''email'' heisst, dass die Praxis die Nachricht selbst geschrieben hat (B15).';
comment on column public.appointment_notifications.notified_at is
  'Zeitpunkt der Mitteilung. Liegt er VOR appointments.updated_at, ist der Vermerk ungueltig - der Termin hat sich seitdem geaendert.';

create index appointment_notifications_appointment_idx
  on public.appointment_notifications (appointment_id, notified_at desc);

-- -----------------------------------------------------------------------------
-- Rechte und RLS
--
-- Dasselbe Muster wie bei public.appointments: ausschliesslich lesend fuer die
-- Praxisrollen der eigenen Organisation, geschrieben wird nur ueber die
-- Serverfunktionen unten. Patientenkonten bekommen in diesem Stand keinen
-- Zugriff (ADR-004).
-- -----------------------------------------------------------------------------
alter table public.appointment_notifications enable row level security;

revoke all on public.appointment_notifications from anon, authenticated;
grant select on public.appointment_notifications to authenticated;

create policy appointment_notifications_select_staff_only
  on public.appointment_notifications for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and app.is_staff()
  );

-- -----------------------------------------------------------------------------
-- Retention Schedule: die Tabelle bekommt ihre Datenklasse (ADR-008)
--
-- Keine eigene Frist: Der Vermerk gehoert zum Termin und faellt mit ihm (FK on
-- delete cascade). Die Sortierung setzt ihn VOR die Termine derselben Klasse -
-- er ist ihr Kind, und der Lauf loescht Kinder zuerst.
--
-- Die Zuordnung ist keine Formalie: `pnpm test:db` verlangt fuer JEDE Tabelle
-- in `public` eine Klasse, und ohne diesen Eintrag scheitert der Lauf.
-- -----------------------------------------------------------------------------
insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values
  ('appointment_notifications', 'patientenakte', 'ueber_elterndatensatz',
   'Vermerk, dass ein Termin mitgeteilt wurde. Faellt mit dem Termin (FK on delete cascade); keine eigene Frist.', 45);

-- -----------------------------------------------------------------------------
-- Auditkatalog um appointment.notified erweitern (ADR-010)
--
-- Ein Ereignis, nicht zwei: Gesetzt wird immer die vollstaendige Menge der
-- gueltigen Kanaele. Eine leere Menge im Kontext heisst "Vermerk
-- zurueckgenommen" und ist damit genauso nachvollziehbar wie das Setzen.
--
-- Muss deckungsgleich mit AUDIT_ACTIONS in src/features/audit/actions.ts
-- bleiben; ein Datenbanktest prueft beides gegeneinander.
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
    'prescription.viewed',
    'prescription.created',
    'prescription.updated',
    'prescription.deleted',
    'text_snippet.created',
    'text_snippet.updated',
    'text_snippet.deleted'
  ));

-- -----------------------------------------------------------------------------
-- Die gueltigen Kanaele eines Termins
--
-- "Gueltig" heisst: seit der letzten Aenderung am Termin vermerkt. Sortiert,
-- damit die Oberflaeche eine stabile Reihenfolge bekommt und ein Test sie
-- vergleichen kann.
-- -----------------------------------------------------------------------------
create function app.appointment_notification_channels(p_appointment_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct n.channel order by n.channel), array[]::text[])
  from public.appointment_notifications n
  join public.appointments a on a.id = n.appointment_id
  where n.appointment_id = p_appointment_id
    and n.notified_at >= a.updated_at
$$;

comment on function app.appointment_notification_channels(uuid) is
  'Die seit der letzten Terminaenderung vermerkten Mitteilungswege (CAL-012). Nur fuer die serverseitigen Lese- und Schreibpfade.';

revoke all on function app.appointment_notification_channels(uuid)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- set_appointment_notification: setzt die gueltigen Kanaele eines Termins
--
-- Setzen statt Ergaenzen, weil die Oberflaeche eine Mehrfachauswahl ist: Was
-- angehakt ist, gilt; was nicht, gilt nicht. Eine leere Liste nimmt den
-- Vermerk zurueck - das ist der Fall "Drucker ging nicht".
--
-- Entfernt werden ausschliesslich die GUELTIGEN Zeilen. Was vor der letzten
-- Terminaenderung vermerkt wurde, bleibt stehen: Es ist wahr geblieben, nur
-- nicht mehr aktuell.
-- -----------------------------------------------------------------------------
create function public.set_appointment_notification(
  p_appointment_id uuid,
  p_channels       text[]
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid;
  v_org      uuid;
  v_patient  uuid;
  v_stand    timestamptz;
  v_kanaele  text[];
  v_kanal    text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Der Vermerk gehoert zur Terminorganisation und traegt dasselbe Recht wie
  -- das Aendern eines Termins (ADR-004).
  if not app.can_update_appointment() then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  select a.patient_id, a.updated_at
    into v_patient, v_stand
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  -- Doppelte Angaben sind kein Fehler, aber auch kein zweiter Vermerk.
  v_kanaele := (
    select coalesce(array_agg(distinct k order by k), array[]::text[])
    from unnest(coalesce(p_channels, array[]::text[])) as k
    where k is not null
  );

  foreach v_kanal in array v_kanaele loop
    if v_kanal not in ('slip', 'phone', 'in_person', 'email') then
      raise exception 'unknown notification channel' using errcode = '22023';
    end if;
  end loop;

  -- Nur die gueltigen Zeilen weichen; die aelteren bleiben als Historie.
  delete from public.appointment_notifications n
  where n.appointment_id = p_appointment_id
    and n.notified_at >= v_stand;

  insert into public.appointment_notifications
    (organization_id, appointment_id, channel, notified_by)
  select v_org, p_appointment_id, k, v_actor
  from unnest(v_kanaele) as k;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'appointment.notified', 'appointment', p_appointment_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_patient,
      -- Die Wege, kein Inhalt: was gesagt oder geschrieben wurde, steht hier
      -- ausdruecklich nicht (ADR-010 Punkt 3, ADR-011).
      'channels', to_jsonb(v_kanaele)
    )
  );

  return v_kanaele;
end;
$$;

comment on function public.set_appointment_notification(uuid, text[]) is
  'Setzt die gueltigen Mitteilungswege eines Termins auf genau diese Menge; eine leere Liste nimmt den Vermerk zurueck (CAL-012).';

revoke all on function public.set_appointment_notification(uuid, text[]) from public, anon;
grant execute on function public.set_appointment_notification(uuid, text[]) to authenticated;

-- -----------------------------------------------------------------------------
-- add_appointment_notification: EINEN Weg bei MEHREREN Terminen ergaenzen
--
-- Der Terminzettel listet alle bevorstehenden Termine auf einem Blatt. Wer ihn
-- druckt, teilt sie alle auf einmal mit - und soll sie nicht einzeln abhaken
-- muessen.
--
-- KEINE eigene Fachlogik: ruft je Termin set_appointment_notification mit der
-- Vereinigung aus bisherigen und neuem Weg auf. Damit gelten Rollenpruefung,
-- Wertebereich und Auditeintrag unveraendert - dasselbe Muster wie
-- cancel_staff_day (CAL-009) und create_appointment_series (CAL-007).
--
-- ALLES ODER NICHTS: Scheitert ein Termin, faellt die ganze Transaktion
-- zurueck. Ein halb vermerkter Zettel waere schlimmer als keiner.
-- -----------------------------------------------------------------------------
create function public.add_appointment_notification(
  p_appointment_ids uuid[],
  p_channel         text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     uuid;
  v_anzahl integer := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Die aufgerufene Funktion prueft dasselbe Recht noch einmal. Hier steht es,
  -- damit die Meldung die Ursache trifft, statt auf halbem Weg zu scheitern.
  if not app.can_update_appointment() then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  if p_appointment_ids is null or array_length(p_appointment_ids, 1) is null then
    return 0;
  end if;

  if array_length(p_appointment_ids, 1) > 50 then
    raise exception 'too many appointments at once' using errcode = '22023';
  end if;

  foreach v_id in array p_appointment_ids loop
    perform public.set_appointment_notification(
      v_id,
      (select coalesce(array_agg(distinct k order by k), array[]::text[])
       from unnest(
         app.appointment_notification_channels(v_id) || array[p_channel]
       ) as k)
    );
    v_anzahl := v_anzahl + 1;
  end loop;

  return v_anzahl;
end;
$$;

comment on function public.add_appointment_notification(uuid[], text) is
  'Ergaenzt einen Mitteilungsweg bei mehreren Terminen in einem Vorgang, ohne vorhandene zu verlieren (CAL-012). Ruft je Termin set_appointment_notification auf; alles oder nichts.';

revoke all on function public.add_appointment_notification(uuid[], text) from public, anon;
grant execute on function public.add_appointment_notification(uuid[], text) to authenticated;

-- -----------------------------------------------------------------------------
-- appointment_directory: die gueltigen Wege am Termin
--
-- Als Unterabfrage in der Sicht und nicht ueber einen zweiten Lesepfad: Die
-- Detailansicht liest den Termin ohnehin, und ein eigener Aufruf fuer ein
-- Feld waere eine zweite Runde ohne Gewinn. security_invoker bleibt - welche
-- Zeilen sichtbar sind, entscheidet unveraendert die RLS der Basistabellen,
-- und die neue Tabelle hat ihre eigene Policy.
-- -----------------------------------------------------------------------------
drop view public.appointment_directory;

create view public.appointment_directory
with (security_invoker = true) as
select
  a.id,
  a.organization_id,
  a.patient_id,
  a.staff_member_id,
  a.location_id,
  a.appointment_type,
  a.status,
  a.starts_at,
  a.ends_at,
  a.visit_street,
  a.visit_house_number,
  a.visit_postal_code,
  a.visit_city,
  a.updated_at,
  a.cancelled_at,
  a.cancellation_reason,
  a.completed_at,
  a.no_show_recorded_at,
  a.no_show_fee,
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
  ) as notification_channels
from public.appointments a
join public.patients p      on p.id  = a.patient_id
join public.persons pp      on pp.id = p.person_id
join public.staff_members sm on sm.id = a.staff_member_id
join public.persons sp      on sp.id = sm.person_id
join public.organizations o on o.id  = a.organization_id
left join public.locations l on l.id = a.location_id;

comment on view public.appointment_directory is
  'Terminsicht fuer die Anwendung. security_invoker: RLS der Basistabellen gilt unveraendert. Enthaelt nur organisatorische Angaben. Die vermerkende Person bleibt aussen vor - Akteure stehen im Auditlog (ADR-010).';

revoke all on public.appointment_directory from anon, authenticated;
grant select on public.appointment_directory to authenticated;

-- -----------------------------------------------------------------------------
-- list_patient_upcoming_appointments: die Wege in der Terminliste der Akte
--
-- Genau die Liste, um die es geht: "ist dieser Termin schon mitgeteilt?" wird
-- dort gefragt, nicht im Kalender. Der Kalender bleibt deshalb unveraendert -
-- eine Kachel mit vier moeglichen Zeichen waere dort Rauschen.
--
-- Der Rumpf ist bis auf die Spalte unveraendert aus
-- 20260910120000_patient_upcoming_appointments.sql uebernommen; die Signatur
-- des Rueckgabetyps aendert sich, deshalb drop und neu.
-- -----------------------------------------------------------------------------
drop function public.list_patient_upcoming_appointments(uuid, integer);

create function public.list_patient_upcoming_appointments(
  p_patient_id uuid,
  p_limit      integer default 5
)
returns table (
  id                     uuid,
  starts_at              timestamptz,
  ends_at                timestamptz,
  appointment_type       text,
  status                 text,
  staff_given_name       text,
  staff_family_name      text,
  notification_channels  text[],
  organization_time_zone text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_limit integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

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

  v_limit := least(greatest(coalesce(p_limit, 5), 1), 20);

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
      o.time_zone
    from public.appointments a
    join public.staff_members sm on sm.id = a.staff_member_id
    join public.persons sp       on sp.id = sm.person_id
    join public.organizations o  on o.id  = a.organization_id
    where a.organization_id = v_org
      and a.patient_id      = p_patient_id
      and a.starts_at > now()
      and a.status <> 'cancelled'
    order by a.starts_at, a.id
    limit v_limit;
end;
$$;

comment on function public.list_patient_upcoming_appointments(uuid, integer) is
  'Die naechsten Termine einer Patientin fuer die Akte (UX-006), mit den seit der letzten Aenderung vermerkten Mitteilungswegen (CAL-012). Ohne Adresse und ohne klinische Inhalte.';

revoke all on function public.list_patient_upcoming_appointments(uuid, integer)
  from public, anon;
grant execute on function public.list_patient_upcoming_appointments(uuid, integer)
  to authenticated;
