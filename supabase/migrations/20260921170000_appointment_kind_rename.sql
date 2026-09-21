-- -----------------------------------------------------------------------------
-- CAL-027: Die Bestandswerte von appointments.kind heissen wie die Bereiche
--
-- ADR-022 Punkt 2 legt fest: eine Spalte, drei Kontexte, kein zweites Feld -
-- und fuer die Bezeichner gilt die Sprachregelung aus ADR-021 Punkt 9, die
-- Bereiche heissen `therapy` und `training`. Ob dafuer die Bestandswerte
-- umbenannt werden, ueberlaesst der ADR ausdruecklich dem SPEC (ADR-014: das
-- konkrete Schema ist nicht Gegenstand eines ADR); die offene Folgefrage
-- lautet dort woertlich, ob auf `therapy` und `internal` umbenannt wird.
--
-- FESTLEGUNG (keine Annahme im Sinne von PROJECT_PRINCIPLES.md 15.1: was ein
-- ADR dem SPEC ueberlaesst, ist eine Festlegung und steht hier - wie bei
-- CAL-024 und LEI-EPIC-001): Ja.
--   treatment -> therapy
--   event     -> internal
-- `training` steht seit CAL-024 richtig und bleibt.
--
-- CAL-024 hatte die Umbenennung abgelehnt, und die Begruendung stimmt heute
-- noch: Sie traegt keinen fachlichen Gehalt und loest die Gefahr nicht, um die
-- es geht - `where kind <> 'internal'` faengt den Trainingstermin so falsch
-- ein wie `where kind <> 'event'`. Sie war damals aber auch kein Nichts: Sie
-- haette den Loop verdoppelt, der den dritten Wert einfuehrt. Getrennt ist
-- sie das, was sie ist - eine mechanische Aenderung ohne Verhaltensaenderung,
-- die mit jedem Loop teurer wird, der den alten Wert in eine neue Abfrage
-- schreibt (dieselbe Abwaegung wie `scheduled -> confirmed`, ADR-018 Punkt 6).
-- Der Zeitpunkt ist der einzige, an dem sie billig ist: Die Datenbank traegt
-- ausschliesslich synthetische Daten, und `training` ist gerade erst dazu-
-- gekommen. `event` heisst ab hier so, wie der ADR die Sache nennt - intern.
--
-- Was diese Migration NICHT tut:
--   - Kein Bezeichner wird umbenannt. `event_group_id`, `event_series_id`,
--     `event_groups`, `appointments_event_type`, `create_appointment_event`,
--     `list_event_participants` und die uebrigen Namen bleiben. Umbenannt
--     werden die Werte; ein RPC-Name ist der Vertrag zur Oberflaeche, und ein
--     Vertragsbruch ohne fachlichen Gewinn ist kein Aufraeumen.
--   - Keine Auditzeile wird umgeschrieben. ADR-022 haelt fest: Auditzeilen
--     werden nie umgeschrieben, die bestehenden Werte bleiben gueltig. Ein
--     Ereignis, das als `kind: event` protokolliert wurde, ist genau das
--     gewesen; ab jetzt schreiben dieselben Pfade `kind: internal`.
--   - Kein Ausnahmetext aendert sich. `raise exception 'event cannot ...'`
--     bleibt Wort fuer Wort stehen: Die Oberflaeche liest diese Texte, und
--     eine Textaenderung waere eine Verhaltensaenderung in einem Loop, der
--     ausdruecklich keine hat.
--   - `billable_services.item_kind` bleibt unberuehrt. Das `'treatment'` dort
--     ist eine Rechnungspositionsart (ADR-009), eine andere Spalte mit einer
--     anderen Bedeutung.
--
-- Geprueft wird die Umbenennung nicht an dieser Migration, sondern daran,
-- dass die Datenbanktests unveraendert gruen bleiben, nachdem sie die neuen
-- Werte schreiben: Wenn eine Stelle vergessen waere, faende sie kein Ergebnis
-- mehr oder liefe in eine Constraint.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 1. Der Riegel aus ADR-022 Punkt 10 gilt dem Kontextwechsel, nicht der
--    Schreibweise
--
-- `appointments_context_guard` verbietet jede Aenderung an `kind` - genau
-- dafuer steht er. Ein Behandlungstermin, der `therapy` statt `treatment`
-- heisst, ist derselbe Termin an demselben Rechtsverhaeltnis mit derselben
-- Frist; was der Riegel meint, ist der Wechsel des Kontexts, und der findet
-- hier nicht statt. Deshalb wird er fuer diesen einen Schritt ausgesetzt und
-- unmittelbar danach wieder scharf gestellt - und nicht etwa umgeschrieben.
-- -----------------------------------------------------------------------------
alter table public.appointments disable trigger appointments_context_guard;

-- -----------------------------------------------------------------------------
-- 2. Was den alten Wert nennt, faellt zuerst
--
-- Sechs Constraints und ein Teilindex; ohne diesen Schritt scheitert das
-- `update` an der ersten von ihnen.
-- -----------------------------------------------------------------------------
alter table public.appointments drop constraint appointments_kind_values;
alter table public.appointments drop constraint appointments_kind_fields;
alter table public.appointments drop constraint appointments_event_type;
alter table public.appointments drop constraint appointments_event_group;
alter table public.appointments drop constraint appointments_event_series;
alter table public.appointments drop constraint appointments_fee_basis_values;

drop index public.appointments_event_group_idx;

-- -----------------------------------------------------------------------------
-- 3. Der Wert selbst
-- -----------------------------------------------------------------------------
alter table public.appointments alter column kind set default 'therapy';

update public.appointments
   set kind = case kind
                when 'treatment' then 'therapy'
                when 'event'     then 'internal'
              end
 where kind in ('treatment', 'event');

alter table public.appointments enable trigger appointments_context_guard;

-- -----------------------------------------------------------------------------
-- 4. Dieselben Regeln, derselbe Wortlaut, neue Werte
--
-- Jede der sechs Constraints steht hier so, wie sie vorher stand; geaendert
-- ist ausschliesslich der Wert. Wer sie vergleichen will, findet sie in
-- 20260921100000_appointment_context.sql (Punkt 3 und 4),
-- 20260912210000_appointment_events.sql (Kanal),
-- 20260913100000_event_groups.sql (Gruppe),
-- 20260918110000_event_series.sql (Serie) und
-- 20260912220000_event_guards.sql (Gebuehrenanlass).
-- -----------------------------------------------------------------------------
alter table public.appointments
  add constraint appointments_kind_values check (kind in ('therapy', 'internal', 'training'));

alter table public.appointments
  add constraint appointments_kind_fields check (
    (kind = 'therapy'
      and patient_id               is not null
      and training_relationship_id is null
      and title                    is null)
    or (kind = 'internal'
      and patient_id               is null
      and training_relationship_id is null
      and treatment_basis_id       is null
      and title                    is not null
      and length(btrim(title)) between 1 and 120)
    or (kind = 'training'
      and patient_id               is null
      and training_relationship_id is not null
      and treatment_basis_id       is null
      and title                    is null)
  );

comment on constraint appointments_kind_fields on public.appointments is
  'Je Kontext genau ein Verhaeltnis, beim internen Termin keines (ADR-022 Punkt 3); die Behandlungsgrundlage bleibt ausserhalb von therapy leer (Punkt 4).';

alter table public.appointments
  add constraint appointments_event_type check (
    kind <> 'internal' or appointment_type in ('practice', 'video')
  );

alter table public.appointments
  add constraint appointments_event_group check (
    (kind = 'internal' and event_group_id is not null)
    or (kind <> 'internal' and event_group_id is null)
  );

alter table public.appointments
  add constraint appointments_event_series check (
    event_series_id is null or kind = 'internal'
  );

alter table public.appointments
  add constraint appointments_fee_basis_values check (
    fee_basis is null
    or (kind = 'therapy'
        and ((fee_basis = 'late_cancellation' and status = 'cancelled')
          or (fee_basis = 'no_show'           and status = 'no_show')))
  );

create index appointments_event_group_idx
  on public.appointments (organization_id, event_group_id)
  where kind = 'internal';

comment on column public.appointments.kind is
  'Terminkontext (ADR-022 Punkt 2): therapy = Behandlungstermin mit Patient:in; internal = internes Ereignis des Praxisbetriebs ohne Gegenueber; training = Trainingstermin an einem Trainingsverhaeltnis. Genau ein Kontext je Termin, unveraenderlich ab Anlage (Punkt 10). Die Bestandswerte treatment und event heissen seit CAL-027 wie die Bereiche (ADR-021 Punkt 9).';

-- -----------------------------------------------------------------------------
-- 5. Die Funktionen, die den Wert lesen oder schreiben
--
-- Achtzehn Ruempfe aus acht Migrationen, wortgleich uebernommen bis auf den
-- Wert - `create or replace` behaelt OID, Rechte und Kommentar, also stehen
-- hier weder `grant` noch `comment on function` erneut. PostgreSQL kennt kein
-- teilweises Ersetzen einer Funktion; dass der Rumpf lang ist, ist der Preis
-- dafuer und kein Hinweis auf eine weitergehende Aenderung. Die Herkunft
-- steht je Funktion darueber.
-- -----------------------------------------------------------------------------

-- Herkunft: 20260912210000_appointment_events.sql

create or replace function public.complete_appointment(
  p_appointment_id      uuid,
  p_expected_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_alt   record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_complete_appointment() then
    raise exception 'not allowed to complete appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to complete appointments' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.staff_member_id, a.status, a.kind, a.updated_at
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_alt.kind = 'internal' then
    raise exception 'event cannot be completed' using errcode = '22023';
  end if;

  if v_alt.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be completed' using errcode = '22023';
  end if;

  if v_alt.status = 'no_show' then
    raise exception 'no-show appointment must be reopened first' using errcode = '22023';
  end if;

  if v_alt.status <> 'confirmed' then
    raise exception 'appointment is already completed' using errcode = '22023';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  update public.appointments
     set status       = 'completed',
         completed_at = now(),
         completed_by = v_actor,
         updated_at   = now()
   where id = p_appointment_id
     and updated_at = p_expected_updated_at
     and status = 'confirmed';

  if not found then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'appointment.completed', 'appointment', p_appointment_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_alt.patient_id,
      'staff_member_id', v_alt.staff_member_id
    )
  );

  return p_appointment_id;
end;
$$;

create or replace function public.create_treatment_note(
  p_appointment_id uuid,
  p_content        text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_inhalt text;
  v_termin record;
  v_note   uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_treatment_note() then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  v_inhalt := btrim(coalesce(p_content, ''), E' \t\r\n');

  if v_inhalt = '' then
    raise exception 'documentation must not be empty' using errcode = '22023';
  end if;

  if length(v_inhalt) > 20000 then
    raise exception 'documentation is too long' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.status, a.kind
    into v_termin
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  -- Ein Ereignis des Praxisbetriebs hat keine Patient:in - eine
  -- Behandlungsdokumentation daran haette kein Gegenueber (CAL-015b).
  if v_termin.kind = 'internal' then
    raise exception 'event cannot be documented' using errcode = '22023';
  end if;

  -- Eine Absage sagt aus, dass die Behandlung NICHT stattgefunden hat.
  -- Bestaetigte und abgeschlossene Termine sind dokumentierbar - der laufende
  -- Hausbesuch ist der Regelfall und noch nicht abgeschlossen.
  if v_termin.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be documented' using errcode = '22023';
  end if;

  -- Nicht angetroffen heisst: keine Behandlung, also auch kein Nachweis
  -- (CAL-008c). Wer sich vertan hat, oeffnet den Termin wieder.
  if v_termin.status = 'no_show' then
    raise exception 'no-show appointment cannot be documented' using errcode = '22023';
  end if;

  begin
    insert into public.treatment_notes (
      organization_id, appointment_id, status, content, created_by, updated_by
    )
    values (
      v_org, p_appointment_id, 'draft', v_inhalt, v_actor, v_actor
    )
    returning id into v_note;
  exception
    when unique_violation then
      raise exception 'treatment note already exists' using errcode = '23505';
  end;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'treatment_note.created', 'treatment_note', v_note, 'success',
    jsonb_build_object(
      'surface', 'web',
      'appointment_id', p_appointment_id,
      'patient_id', v_termin.patient_id
    )
  );

  return v_note;
end;
$$;

-- Herkunft: 20260912220000_event_guards.sql

create or replace function public.cancel_appointment(
  p_appointment_id      uuid,
  p_expected_updated_at timestamptz,
  p_reason              text,
  p_received_on         date,
  p_received_time       time
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid;
  v_org     uuid;
  v_tz      text;
  v_alt     record;
  v_eingang timestamptz;
  v_anlass  text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_cancel_appointment() then
    raise exception 'not allowed to cancel appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to cancel appointments' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  -- Die Pflichtangabe wird vor jedem Lesen geprueft: eine unvollstaendige
  -- Eingabe darf nicht erst an der Constraint scheitern.
  if p_reason is null
     or p_reason not in ('patient_request', 'practice_request', 'moved', 'other') then
    raise exception 'cancellation reason is required' using errcode = '22023';
  end if;

  -- Halb angegeben ist nicht angegeben: Ein Datum ohne Uhrzeit waere
  -- Mitternacht, und das ist eine Erfindung, keine Angabe.
  if (p_received_on is null) <> (p_received_time is null) then
    raise exception 'cancellation receipt needs date and time' using errcode = '22023';
  end if;

  if p_received_on is null then
    v_eingang := now();
  else
    select o.time_zone into v_tz from public.organizations o where o.id = v_org;
    if v_tz is null then
      raise exception 'organization has no time zone' using errcode = '22023';
    end if;
    v_eingang := (p_received_on + p_received_time) at time zone v_tz;
  end if;

  -- Eine Absage, die noch nicht eingegangen ist, gibt es nicht. Ohne diese
  -- Grenze liesse sich die Frist durch ein Datum in der Zukunft aushebeln.
  if v_eingang > now() then
    raise exception 'cancellation cannot be received in the future' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.staff_member_id, a.status, a.kind, a.starts_at, a.updated_at
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_alt.status = 'cancelled' then
    raise exception 'appointment is already cancelled' using errcode = '22023';
  end if;

  if v_alt.status in ('completed', 'no_show') then
    raise exception 'completed appointment must be reopened first' using errcode = '22023';
  end if;

  if v_alt.status <> 'confirmed' then
    raise exception 'documented appointment cannot be changed' using errcode = '22023';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  -- Die Frist rechnet der Server, aus dem Eingang und dem VEREINBARTEN Beginn
  -- des Termins - nie aus der Eingabezeit und nie im Browser
  -- (PROJECT_PRINCIPLES.md 8).
  --
  -- Und nur an einer BEHANDLUNG: Ein Ereignis des Praxisbetriebs hat keine
  -- Patient:in, die absagen koennte, und keinen Behandlungsbeginn, auf den
  -- sich eine Frist beziehen liesse (CAL-016, 8.1).
  v_anlass := case
    when v_alt.kind = 'therapy'
     and app.is_late_cancellation(p_reason, v_eingang, v_alt.starts_at) then 'late_cancellation'
    else null
  end;

  update public.appointments
     set status                   = 'cancelled',
         cancellation_reason      = p_reason,
         cancellation_received_at = v_eingang,
         fee_basis                = v_anlass,
         cancelled_at             = now(),
         cancelled_by             = v_actor,
         updated_at               = now()
   where id = p_appointment_id
     and updated_at = p_expected_updated_at
     and status = 'confirmed';

  if not found then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  -- Ohne den Grund (ANN-034: er steht an der Zeile und laeuft mit ihrer
  -- Frist), aber MIT der Gebuehrenentscheidung: Sie begruendet spaeter eine
  -- Forderung und gehoert damit in das Protokoll (ADR-010) - so, wie es der
  -- Vermerk "nicht angetroffen" bis ADR-018 Fassung 1 tat. Der Anlass selbst
  -- bleibt draussen; er liesse den codierten Grund die Zeile ueberleben.
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'appointment.cancelled', 'appointment', p_appointment_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_alt.patient_id,
      'staff_member_id', v_alt.staff_member_id,
      'fee', v_anlass is not null,
      -- Ob der Eingang nachgetragen wurde, sagt spaeter, warum eine Frist so
      -- ausgegangen ist. Organisatorisch, ohne zusaetzlichen Personenbezug.
      'received_later', p_received_on is not null
    )
  );

  return p_appointment_id;
end;
$$;

create or replace function public.cancel_staff_day(
  p_staff_member_id uuid,
  p_date            date,
  p_reason          text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_tz      text;
  v_start   timestamptz;
  v_end     timestamptz;
  v_termin  record;
  v_anzahl  integer := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Die aufgerufene Funktion prueft dasselbe Recht noch einmal. Hier steht es,
  -- damit die Meldung die Ursache trifft, statt auf halbem Weg zu scheitern.
  if not app.can_cancel_appointment() then
    raise exception 'not allowed to cancel appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to cancel appointments' using errcode = '42501';
  end if;

  if p_staff_member_id is null or p_date is null then
    raise exception 'staff member and date are required' using errcode = '22023';
  end if;

  -- Der Ausfall einer behandelnden Person ist praxisbedingt. Der Grund bleibt
  -- eine Angabe - aber nicht jede (CAL-016).
  if p_reason is null or p_reason not in ('practice_request', 'moved', 'other') then
    raise exception 'day rescheduling needs a practice reason' using errcode = '22023';
  end if;

  -- Zielsatz ausschliesslich in der eigenen Organisation suchen; sonst waere
  -- die Funktion ein Orakel fuer fremde Mitarbeiter-IDs
  -- (PROJECT_PRINCIPLES.md 13).
  if not exists (
    select 1 from public.staff_members sm
    where sm.id = p_staff_member_id
      and sm.organization_id = v_org
  ) then
    raise exception 'staff member not found' using errcode = 'P0002';
  end if;

  select o.time_zone into v_tz
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  -- Halboffenes Fenster [Tag 00:00, Folgetag 00:00) in der Zeitzone der Praxis
  -- - dieselbe Auslegung wie in list_day_plan und list_appointments.
  v_start := (p_date::timestamp) at time zone v_tz;
  v_end   := ((p_date + 1)::timestamp) at time zone v_tz;

  -- FOR UPDATE ohne SKIP LOCKED: ein Termin, an dem gerade jemand arbeitet,
  -- soll die Umplanung aufhalten und nicht stillschweigend stehen bleiben.
  for v_termin in
    select a.id, a.updated_at
    from public.appointments a
    where a.organization_id = v_org
      and a.staff_member_id = p_staff_member_id
      and a.starts_at >= v_start
      and a.starts_at <  v_end
      and a.status = 'confirmed'
      and a.kind = 'therapy'
    order by a.starts_at, a.id
    for update
  loop
    perform public.cancel_appointment(v_termin.id, v_termin.updated_at, p_reason, null, null);
    v_anzahl := v_anzahl + 1;
  end loop;

  -- Kein eigenes Sammelereignis: je Absage steht ein appointment.cancelled im
  -- Auditlog, und das ist der auditpflichtige Vorgang (ADR-010, ADR-018
  -- Punkt 5). Ein zusaetzlicher Eintrag "Tag umgeplant" wuerde dieselbe
  -- Tatsache ein zweites Mal festhalten.
  return v_anzahl;
end;
$$;

create or replace function public.set_appointment_notification(
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
  v_kind     text;
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

  select a.patient_id, a.kind, a.updated_at
    into v_patient, v_kind, v_stand
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_kind = 'internal' then
    raise exception 'event has nobody to notify' using errcode = '22023';
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

-- Herkunft: 20260913100000_event_groups.sql

create or replace function public.cancel_appointment_event(
  p_event_group_id      uuid,
  p_expected_updated_at timestamptz,
  p_reason              text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_stand  timestamptz;
  v_zeile  record;
  v_anzahl integer := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Dieselbe Pruefung wie in der aufgerufenen Funktion, hier nur damit die
  -- Meldung die Ursache trifft statt auf halbem Weg zu scheitern.
  if not app.can_cancel_appointment() then
    raise exception 'not allowed to cancel appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to cancel appointments' using errcode = '42501';
  end if;

  if p_event_group_id is null or p_expected_updated_at is null then
    raise exception 'event and expected updated_at are required' using errcode = '22023';
  end if;

  perform 1
  from public.appointments a
  where a.organization_id = v_org
    and a.event_group_id  = p_event_group_id
    and a.kind = 'internal'
  for update;

  select max(a.updated_at) into v_stand
  from public.appointments a
  where a.organization_id = v_org
    and a.event_group_id  = p_event_group_id
    and a.kind = 'internal';

  if v_stand is null then
    raise exception 'event not found' using errcode = 'P0002';
  end if;

  if v_stand is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  for v_zeile in
    select a.id, a.updated_at
    from public.appointments a
    where a.organization_id = v_org
      and a.event_group_id  = p_event_group_id
      and a.status = 'confirmed'
    order by a.staff_member_id
  loop
    perform public.cancel_appointment(v_zeile.id, v_zeile.updated_at, p_reason, null, null);
    v_anzahl := v_anzahl + 1;
  end loop;

  -- Kein eigenes Sammelereignis: je Absage steht ein appointment.cancelled im
  -- Auditlog, und das ist der auditpflichtige Vorgang (ADR-010).
  return v_anzahl;
end;
$$;

create or replace function public.create_appointment_event(
  p_title            text,
  p_staff_member_ids uuid[],
  p_appointment_type text,
  p_date             date,
  p_start_time       time,
  p_end_time         time,
  p_location_id      uuid default null,
  p_allow_outside_working_hours boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor       uuid;
  v_org         uuid;
  v_tz          text;
  v_grid        smallint;
  v_heute       date;
  v_starts_at   timestamptz;
  v_ends_at     timestamptz;
  v_titel       text;
  v_location_id uuid;
  v_gruppe      uuid;
  v_personen    uuid[];
  v_person      uuid;
  v_ausserhalb  boolean;
  v_id          uuid;
  v_anzahl      integer := 0;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_create_appointment() then
    raise exception 'not allowed to create appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to create appointments' using errcode = '42501';
  end if;

  v_titel := btrim(coalesce(p_title, ''));
  if v_titel = '' then
    raise exception 'event title is required' using errcode = '22023';
  end if;
  if length(v_titel) > 120 then
    raise exception 'event title is too long' using errcode = '22023';
  end if;

  if p_staff_member_ids is null or array_length(p_staff_member_ids, 1) is null then
    raise exception 'event needs at least one participant' using errcode = '22023';
  end if;

  -- Doppelt genannt ist einmal beteiligt. Ohne das Zusammenfassen bekaeme die
  -- Person zwei Zeilen zur selben Zeit - und die zweite scheiterte an der
  -- Ueberschneidung mit der ersten (CAL-017).
  select coalesce(array_agg(distinct p), array[]::uuid[])
    into v_personen
  from unnest(p_staff_member_ids) as p
  where p is not null;

  if array_length(v_personen, 1) is null then
    raise exception 'event needs at least one participant' using errcode = '22023';
  end if;

  -- Ein Ereignis findet in der Praxis oder als Video statt. Ein Hausbesuch
  -- ohne Patient:in waere ein Termin ohne Anschrift.
  if p_appointment_type is null or p_appointment_type not in ('practice', 'video') then
    raise exception 'unknown appointment type' using errcode = '22023';
  end if;

  if p_date is null or p_start_time is null or p_end_time is null then
    raise exception 'date, start time and end time are required' using errcode = '22023';
  end if;

  if p_end_time <= p_start_time then
    raise exception 'end time must be after start time' using errcode = '22023';
  end if;

  select o.time_zone, o.appointment_grid_minutes
    into v_tz, v_grid
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  -- Frei waehlbar heisst frei im RASTER: Beide Enden liegen auf einem
  -- Rasterpunkt. Beim Behandlungstermin genuegt der Beginn, weil die Laenge
  -- fest ist; hier ist sie es nicht (PROJECT_PRINCIPLES.md 8.1).
  if not app.is_on_appointment_grid(p_start_time, v_grid) then
    raise exception 'start time is not on the appointment grid' using errcode = '22023';
  end if;
  if not app.is_on_appointment_grid(p_end_time, v_grid) then
    raise exception 'end time is not on the appointment grid' using errcode = '22023';
  end if;

  v_heute := (now() at time zone v_tz)::date;
  if p_date < v_heute then
    raise exception 'appointment date is in the past' using errcode = '22023';
  end if;

  v_starts_at := (p_date + p_start_time) at time zone v_tz;
  v_ends_at   := (p_date + p_end_time)   at time zone v_tz;

  if p_appointment_type = 'practice' then
    if p_location_id is null then
      raise exception 'practice appointment requires a location' using errcode = '22023';
    end if;

    select l.id into v_location_id
    from public.locations l
    where l.id = p_location_id
      and l.organization_id = v_org;

    if not found then
      raise exception 'location not found' using errcode = 'P0002';
    end if;
  else
    v_location_id := null;
  end if;

  v_gruppe := gen_random_uuid();

  foreach v_person in array v_personen
  loop
    -- Eigene Pruefung statt is_assignable_therapist: Beteiligte eines
    -- Ereignisses sind Beschaeftigte, nicht notwendig Behandelnde.
    if not exists (
      select 1 from public.staff_members sm
      where sm.id = v_person
        and sm.organization_id = v_org
        and sm.employment_status = 'active'
    ) then
      raise exception 'staff member not found' using errcode = 'P0002';
    end if;

    v_ausserhalb := not app.is_within_working_hours(
      v_person, v_org, p_date, p_start_time, p_end_time
    );

    if v_ausserhalb and not coalesce(p_allow_outside_working_hours, false) then
      raise exception 'outside_working_hours' using errcode = '22023';
    end if;

    begin
      insert into public.appointments (
        organization_id, patient_id, staff_member_id, location_id,
        appointment_type, kind, title, event_group_id, status, starts_at, ends_at, created_by
      )
      values (
        v_org, null, v_person, v_location_id,
        p_appointment_type, 'internal', v_titel, v_gruppe, 'confirmed',
        v_starts_at, v_ends_at, v_actor
      )
      returning id into v_id;
    exception
      when exclusion_violation then
        raise exception 'appointment overlaps an existing one' using errcode = '23P01';
    end;

    -- Je Zeile ein Auditeintrag, wie bei jedem anderen Termin auch. Kein
    -- Sammelereignis: Der auditpflichtige Vorgang ist der einzelne Termin
    -- (ADR-010).
    insert into public.audit_log (
      organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
    )
    values (
      v_org, v_actor, 'appointment.created', 'appointment', v_id, 'success',
      jsonb_build_object(
        'surface', 'web',
        -- Kein Personenbezug ueber die Beteiligten hinaus: Ein Ereignis hat
        -- keine Patient:in, und der Titel gehoert der Zeile (ADR-011).
        'kind', 'internal',
        'staff_member_id', v_person,
        'outside_working_hours', v_ausserhalb
      )
    );

    v_anzahl := v_anzahl + 1;
  end loop;

  return v_anzahl;
end;
$$;

create or replace function public.list_event_participants(p_event_group_id uuid)
returns table (
  appointment_id  uuid,
  staff_member_id uuid,
  display_name    text,
  status          text,
  group_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_stand timestamptz;
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

  if p_event_group_id is null then
    raise exception 'event is required' using errcode = '22023';
  end if;

  select max(a.updated_at) into v_stand
  from public.appointments a
  where a.organization_id = v_org
    and a.event_group_id  = p_event_group_id
    and a.kind = 'internal';

  return query
    select a.id, a.staff_member_id,
           pp.given_name || ' ' || pp.family_name,
           a.status,
           v_stand
    from public.appointments a
    join public.staff_members sm on sm.id = a.staff_member_id
    join public.persons pp       on pp.id = sm.person_id
    where a.organization_id = v_org
      and a.event_group_id  = p_event_group_id
      and a.kind = 'internal'
    order by pp.family_name, pp.given_name;
end;
$$;

create or replace function public.update_appointment_event(
  p_event_group_id      uuid,
  p_expected_updated_at timestamptz,
  p_title               text,
  p_appointment_type    text,
  p_date                date,
  p_start_time          time,
  p_end_time            time,
  p_location_id         uuid default null,
  p_allow_outside_working_hours boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor       uuid;
  v_org         uuid;
  v_tz          text;
  v_grid        smallint;
  v_heute       date;
  v_starts_at   timestamptz;
  v_ends_at     timestamptz;
  v_titel       text;
  v_location_id uuid;
  v_stand       timestamptz;
  v_zeile       record;
  v_ausserhalb  boolean;
  v_konflikt    text;
  v_anzahl      integer := 0;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_update_appointment() then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  if p_event_group_id is null or p_expected_updated_at is null then
    raise exception 'event and expected updated_at are required' using errcode = '22023';
  end if;

  v_titel := btrim(coalesce(p_title, ''));
  if v_titel = '' then
    raise exception 'event title is required' using errcode = '22023';
  end if;
  if length(v_titel) > 120 then
    raise exception 'event title is too long' using errcode = '22023';
  end if;

  if p_appointment_type is null or p_appointment_type not in ('practice', 'video') then
    raise exception 'unknown appointment type' using errcode = '22023';
  end if;

  if p_date is null or p_start_time is null or p_end_time is null then
    raise exception 'date, start time and end time are required' using errcode = '22023';
  end if;

  if p_end_time <= p_start_time then
    raise exception 'end time must be after start time' using errcode = '22023';
  end if;

  select o.time_zone, o.appointment_grid_minutes
    into v_tz, v_grid
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  if not app.is_on_appointment_grid(p_start_time, v_grid) then
    raise exception 'start time is not on the appointment grid' using errcode = '22023';
  end if;
  if not app.is_on_appointment_grid(p_end_time, v_grid) then
    raise exception 'end time is not on the appointment grid' using errcode = '22023';
  end if;

  v_heute := (now() at time zone v_tz)::date;
  if p_date < v_heute then
    raise exception 'appointment date is in the past' using errcode = '22023';
  end if;

  v_starts_at := (p_date + p_start_time) at time zone v_tz;
  v_ends_at   := (p_date + p_end_time)   at time zone v_tz;

  if p_appointment_type = 'practice' then
    if p_location_id is null then
      raise exception 'practice appointment requires a location' using errcode = '22023';
    end if;

    select l.id into v_location_id
    from public.locations l
    where l.id = p_location_id
      and l.organization_id = v_org;

    if not found then
      raise exception 'location not found' using errcode = 'P0002';
    end if;
  else
    v_location_id := null;
  end if;

  -- Alle Zeilen der Gruppe sperren, bevor irgendetwas geprueft wird: Sonst
  -- entschiede ein paralleler Vorgang zwischen Pruefung und Schreiben.
  perform 1
  from public.appointments a
  where a.organization_id = v_org
    and a.event_group_id  = p_event_group_id
    and a.kind = 'internal'
  for update;

  select max(a.updated_at) into v_stand
  from public.appointments a
  where a.organization_id = v_org
    and a.event_group_id  = p_event_group_id
    and a.kind = 'internal';

  if v_stand is null then
    raise exception 'event not found' using errcode = 'P0002';
  end if;

  if v_stand is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  -- Eine abgesagte Zeile ist terminal; ein Ereignis mit einer solchen ist als
  -- Ganzes nicht mehr aenderbar (ADR-018 Punkt 2). Fuer einen neuen Zeitraum
  -- wird ein neues Ereignis eingetragen.
  if exists (
    select 1 from public.appointments a
    where a.organization_id = v_org
      and a.event_group_id  = p_event_group_id
      and a.status <> 'confirmed'
  ) then
    raise exception 'cancelled appointment cannot be changed' using errcode = '22023';
  end if;

  for v_zeile in
    select a.id, a.staff_member_id, a.starts_at, a.ends_at
    from public.appointments a
    where a.organization_id = v_org
      and a.event_group_id  = p_event_group_id
    order by a.staff_member_id
  loop
    -- Arbeitszeit je Beteiligter, und nur wenn sich der Zeitraum wirklich
    -- aendert - sonst fragte ein blosses Umbenennen nach einer Bestaetigung,
    -- die mit der Aenderung nichts zu tun hat.
    if v_starts_at is distinct from v_zeile.starts_at
       or v_ends_at is distinct from v_zeile.ends_at then
      v_ausserhalb := not app.is_within_working_hours(
        v_zeile.staff_member_id, v_org, p_date, p_start_time, p_end_time
      );
      if v_ausserhalb and not coalesce(p_allow_outside_working_hours, false) then
        raise exception 'outside_working_hours' using errcode = '22023';
      end if;
    end if;

    -- Konflikt VOR dem Schreiben, und mit Namen: Die Constraint greift sonst
    -- bei irgendeiner Zeile, und die Meldung sagt nicht, wen es trifft.
    select coalesce(pp.given_name || ' ' || pp.family_name, 'Eine beteiligte Person')
      into v_konflikt
    from public.appointments b
    join public.staff_members sm on sm.id = b.staff_member_id
    join public.persons pp       on pp.id = sm.person_id
    where b.organization_id = v_org
      and b.staff_member_id = v_zeile.staff_member_id
      and b.status <> 'cancelled'
      and b.event_group_id is distinct from p_event_group_id
      and tstzrange(b.starts_at, b.ends_at, '[)')
          && tstzrange(v_starts_at, v_ends_at, '[)')
    limit 1;

    if v_konflikt is not null then
      raise exception 'appointment overlaps an existing one for %', v_konflikt
        using errcode = '23P01';
    end if;
  end loop;

  -- Der Riegel aus Abschnitt 7 laesst eine Zeitaenderung an einer Ereigniszeile
  -- nur zu, wenn sie aus genau diesem Vorgang kommt. Transaktionslokal, und
  -- unten ausdruecklich wieder zurueckgenommen.
  perform set_config('app.event_group_update', 'on', true);

  for v_zeile in
    select a.id, a.staff_member_id, a.starts_at, a.ends_at,
           a.appointment_type, a.location_id, a.title
    from public.appointments a
    where a.organization_id = v_org
      and a.event_group_id  = p_event_group_id
    order by a.staff_member_id
  loop
    update public.appointments
       set title            = v_titel,
           appointment_type = p_appointment_type,
           location_id      = v_location_id,
           starts_at        = v_starts_at,
           ends_at          = v_ends_at,
           updated_at       = now()
     where id = v_zeile.id;

    insert into public.audit_log (
      organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
    )
    values (
      v_org, v_actor, 'appointment.updated', 'appointment', v_zeile.id, 'success',
      jsonb_build_object(
        'surface', 'web',
        -- Kein Titel und kein Personenbezug ueber die Beteiligte hinaus
        -- (ADR-011). Dass es das ganze Ereignis betraf, gehoert dazu: Es
        -- erklaert, warum mehrere Zeilen zugleich wandern.
        'kind', 'internal',
        'scope', 'event',
        'staff_member_id', v_zeile.staff_member_id
      )
    );

    v_anzahl := v_anzahl + 1;
  end loop;

  perform set_config('app.event_group_update', 'off', true);

  return v_anzahl;
end;
$$;

-- Herkunft: 20260918100000_past_appointments_confirmed.sql

create or replace function public.update_appointment(
  p_appointment_id      uuid,
  p_expected_updated_at timestamptz,
  p_staff_member_id     uuid,
  p_appointment_type    text,
  p_date                date,
  p_start_time          time,
  p_end_time            time,
  p_location_id         uuid default null,
  p_allow_outside_working_hours boolean default false,
  -- FIX-019: Ein Tag vor dem heutigen nur mit ausdruecklicher Bestaetigung.
  p_confirmed_past      boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor       uuid;
  v_org         uuid;
  v_tz          text;
  v_heute       date;
  v_starts_at   timestamptz;
  v_ends_at     timestamptz;
  v_location_id uuid;
  v_street      text;
  v_house       text;
  v_postal      text;
  v_city        text;
  v_alt         record;
  v_geaendert   text[] := array[]::text[];
  v_zeit        boolean := false;
  v_organisch   boolean := false;
  v_aktion      text;
  v_grid        smallint;
  v_ausserhalb  boolean := false;
  v_alt_laenge  interval;
  v_neu_laenge  interval;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_update_appointment() then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.staff_member_id, a.location_id, a.appointment_type,
         a.kind, a.status, a.starts_at, a.ends_at, a.updated_at,
         a.visit_street, a.visit_house_number, a.visit_postal_code, a.visit_city
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  -- Abgesagte Termine sind terminal (ADR-018 Punkt 2).
  if v_alt.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be changed' using errcode = '22023';
  end if;

  -- Durchgefuehrt und nicht angetroffen sind nicht terminal, aber auch nicht
  -- direkt aenderbar: erst wieder oeffnen, dann bearbeiten (CAL-004, CAL-008c).
  if v_alt.status in ('completed', 'no_show') then
    raise exception 'completed appointment must be reopened first' using errcode = '22023';
  end if;

  -- Dokumentiert und abgerechnet haben keinen Rueckweg (ADR-018 Punkt 2).
  if v_alt.status <> 'confirmed' then
    raise exception 'documented appointment cannot be changed' using errcode = '22023';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  if p_appointment_type is null
     or p_appointment_type not in ('home_visit', 'practice', 'video') then
    raise exception 'unknown appointment type' using errcode = '22023';
  end if;

  -- Ein Ereignis hat keine Patientenanschrift, also auch keinen Hausbesuch.
  if v_alt.kind = 'internal' and p_appointment_type = 'home_visit' then
    raise exception 'unknown appointment type' using errcode = '22023';
  end if;

  if p_date is null or p_start_time is null or p_end_time is null then
    raise exception 'date, start time and end time are required' using errcode = '22023';
  end if;

  if p_end_time <= p_start_time then
    raise exception 'end time must be after start time' using errcode = '22023';
  end if;

  select o.time_zone, o.appointment_grid_minutes
    into v_tz, v_grid
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  -- PROJECT_PRINCIPLES.md 0.11 Abschnitt 8.1, ANN-056: Die Laenge einer
  -- Behandlung ist frei im Raster, und geprueft wird sie nur, wenn sie sich
  -- aendert. Beide Laengen in Ortszeit, damit ein Bestandstermin an einem
  -- Umstellungstag nicht allein deshalb als geaendert gilt.
  --
  -- Ein Ereignis ist ans Raster gebunden, und zwar an beiden Enden (CAL-015b).
  v_alt_laenge := (v_alt.ends_at   at time zone v_tz)
                - (v_alt.starts_at at time zone v_tz);
  v_neu_laenge := p_end_time - p_start_time;

  if v_alt.kind = 'therapy' then
    if v_neu_laenge is distinct from v_alt_laenge
       and not app.is_valid_treatment_length(v_neu_laenge, v_grid) then
      raise exception 'appointment length is not on the appointment grid' using errcode = '22023';
    end if;
  elsif not app.is_on_appointment_grid(p_end_time, v_grid) then
    raise exception 'end time is not on the appointment grid' using errcode = '22023';
  end if;

  v_heute := (now() at time zone v_tz)::date;

  -- FIX-019, ANN-057: Die Vergangenheit ist erlaubt, aber nie unbemerkt.
  -- Ohne Bestaetigung bleibt die Abweisung aus CAL-003 - die Oberflaeche
  -- fragt nach und schickt den Vorgang bestaetigt neu.
  if p_date < v_heute and not coalesce(p_confirmed_past, false) then
    raise exception 'appointment date is in the past' using errcode = '22023';
  end if;

  v_starts_at := (p_date + p_start_time) at time zone v_tz;
  v_ends_at   := (p_date + p_end_time)   at time zone v_tz;

  if v_starts_at is distinct from v_alt.starts_at
     and not app.is_on_appointment_grid(p_start_time, v_grid) then
    raise exception 'start time is not on the appointment grid' using errcode = '22023';
  end if;

  -- Behandeln darf nur, wer zuordenbar ist; an einem Ereignis nimmt auch das
  -- Buero teil (CAL-015b).
  if v_alt.kind = 'therapy' then
    if not app.is_assignable_therapist(p_staff_member_id, v_org) then
      raise exception 'staff member not assignable' using errcode = 'P0002';
    end if;
  elsif not exists (
    select 1 from public.staff_members sm
    where sm.id = p_staff_member_id
      and sm.organization_id = v_org
      and sm.employment_status = 'active'
  ) then
    raise exception 'staff member not found' using errcode = 'P0002';
  end if;

  if v_starts_at is distinct from v_alt.starts_at
     or v_ends_at is distinct from v_alt.ends_at
     or p_staff_member_id is distinct from v_alt.staff_member_id then
    v_ausserhalb := not app.is_within_working_hours(
      p_staff_member_id, v_org, p_date, p_start_time, p_end_time
    );

    if v_ausserhalb and not coalesce(p_allow_outside_working_hours, false) then
      raise exception 'outside_working_hours' using errcode = '22023';
    end if;
  end if;

  if p_appointment_type = 'practice' then
    if p_location_id is null then
      raise exception 'practice appointment requires a location' using errcode = '22023';
    end if;

    select l.id into v_location_id
    from public.locations l
    where l.id = p_location_id
      and l.organization_id = v_org;

    if not found then
      raise exception 'location not found' using errcode = 'P0002';
    end if;
  else
    v_location_id := null;
  end if;

  if p_appointment_type = 'home_visit' then
    if v_alt.appointment_type = 'home_visit' then
      v_street := v_alt.visit_street;
      v_house  := v_alt.visit_house_number;
      v_postal := v_alt.visit_postal_code;
      v_city   := v_alt.visit_city;
    else
      select
        nullif(btrim(c.street), ''),
        nullif(btrim(c.house_number), ''),
        nullif(btrim(c.postal_code), ''),
        nullif(btrim(c.city), '')
        into v_street, v_house, v_postal, v_city
      from public.patient_contact_details c
      where c.patient_id = v_alt.patient_id;

      if v_street is null or v_house is null or v_postal is null or v_city is null then
        raise exception 'home visit requires a complete patient address' using errcode = '22023';
      end if;
    end if;
  end if;

  if v_alt.staff_member_id is distinct from p_staff_member_id then
    v_geaendert := array_append(v_geaendert, 'staff_member_id');
    v_organisch := true;
  end if;
  if v_alt.appointment_type is distinct from p_appointment_type then
    v_geaendert := array_append(v_geaendert, 'appointment_type');
    v_organisch := true;
  end if;
  if v_alt.location_id is distinct from v_location_id then
    v_geaendert := array_append(v_geaendert, 'location_id');
    v_organisch := true;
  end if;
  if v_alt.starts_at is distinct from v_starts_at then
    v_geaendert := array_append(v_geaendert, 'starts_at');
    v_zeit := true;
  end if;
  if v_alt.ends_at is distinct from v_ends_at then
    v_geaendert := array_append(v_geaendert, 'ends_at');
    v_zeit := true;
  end if;

  if array_length(v_geaendert, 1) is null then
    return p_appointment_id;
  end if;

  begin
    update public.appointments
       set staff_member_id    = p_staff_member_id,
           appointment_type   = p_appointment_type,
           location_id        = v_location_id,
           starts_at          = v_starts_at,
           ends_at            = v_ends_at,
           visit_street       = v_street,
           visit_house_number = v_house,
           visit_postal_code  = v_postal,
           visit_city         = v_city,
           updated_at         = now()
     where id = p_appointment_id
       and updated_at = p_expected_updated_at;

    if not found then
      raise exception 'appointment was changed meanwhile' using errcode = '40001';
    end if;
  exception
    when exclusion_violation then
      raise exception 'appointment overlaps an existing one' using errcode = '23P01';
  end;

  v_aktion := case
    when v_zeit and not v_organisch then 'appointment.rescheduled'
    else 'appointment.updated'
  end;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, v_aktion, 'appointment', p_appointment_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_alt.patient_id,
      'staff_member_id', p_staff_member_id,
      'changed_fields', to_jsonb(v_geaendert),
      'outside_working_hours', v_ausserhalb,
      -- FIX-019: Nachgetragen oder zurueckgelegt - das Auditlog sagt es.
      'in_the_past', p_date < v_heute
    )
  );

  return p_appointment_id;
end;
$$;

-- Herkunft: 20260918110000_event_series.sql

create or replace function public.appointments_event_group_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.event_series_id is distinct from old.event_series_id then
    raise exception 'event series cannot be changed' using errcode = '22023';
  end if;

  if new.kind <> 'internal' then
    return new;
  end if;

  if app.ereignis_gruppenweise_aktiv() then
    return new;
  end if;

  if new.title            is distinct from old.title
     or new.starts_at        is distinct from old.starts_at
     or new.ends_at          is distinct from old.ends_at
     or new.appointment_type is distinct from old.appointment_type
     or new.location_id      is distinct from old.location_id
     or new.event_group_id   is distinct from old.event_group_id then
    raise exception 'event must be changed as a whole' using errcode = '22023';
  end if;

  return new;
end;
$$;

create or replace function public.appointments_event_series_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'internal' and new.event_series_id is null then
    new.event_series_id := app.serie_kennung();
  end if;
  return new;
end;
$$;

-- Herkunft: 20260918120000_treatment_basis.sql

create or replace function public.create_appointment(
  p_patient_id uuid,
  p_staff_member_id uuid,
  p_appointment_type text,
  p_date date,
  p_start_time time without time zone,
  p_end_time time without time zone,
  p_location_id uuid DEFAULT NULL::uuid,
  p_allow_outside_working_hours boolean DEFAULT false,
  p_treatment_basis_id uuid DEFAULT NULL::uuid,
  p_confirmed_past boolean DEFAULT false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor          uuid;
  v_org            uuid;
  v_time_zone      text;
  v_heute          date;
  v_starts_at      timestamptz;
  v_ends_at        timestamptz;
  v_patient_status text;
  v_street         text;
  v_house          text;
  v_postal         text;
  v_city           text;
  v_location_id    uuid;
  v_appointment_id uuid;
  v_grid           smallint;
  v_ausserhalb     boolean;
  v_verordnung     uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_create_appointment() then
    raise exception 'not allowed to create appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to create appointments' using errcode = '42501';
  end if;

  if p_appointment_type is null
     or p_appointment_type not in ('home_visit', 'practice', 'video') then
    raise exception 'unknown appointment type' using errcode = '22023';
  end if;

  if p_date is null or p_start_time is null or p_end_time is null then
    raise exception 'date, start time and end time are required' using errcode = '22023';
  end if;

  if p_end_time <= p_start_time then
    raise exception 'end time must be after start time' using errcode = '22023';
  end if;

  select o.time_zone, o.appointment_grid_minutes
    into v_time_zone, v_grid
  from public.organizations o
  where o.id = v_org;

  if v_time_zone is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  v_heute := (now() at time zone v_time_zone)::date;

  -- FIX-019, ANN-057: Die Vergangenheit ist erlaubt, aber nie unbemerkt.
  -- Ohne Bestaetigung bleibt die Abweisung aus CAL-003 - die Oberflaeche
  -- fragt nach und schickt den Vorgang bestaetigt neu.
  if p_date < v_heute and not coalesce(p_confirmed_past, false) then
    raise exception 'appointment date is in the past' using errcode = '22023';
  end if;

  if not app.is_on_appointment_grid(p_start_time, v_grid) then
    raise exception 'start time is not on the appointment grid' using errcode = '22023';
  end if;

  -- PROJECT_PRINCIPLES.md 0.11 Abschnitt 8.1: Die Laenge ist frei, aber sie
  -- liegt im Raster - mindestens ein Rasterschritt, ein ganzes Vielfaches
  -- davon (CAL-020, ANN-056). Mit dem Beginn im Raster liegt so auch das Ende
  -- auf einem Rasterpunkt.
  if not app.is_valid_treatment_length(p_end_time - p_start_time, v_grid) then
    raise exception 'appointment length is not on the appointment grid' using errcode = '22023';
  end if;

  v_starts_at := (p_date + p_start_time) at time zone v_time_zone;
  v_ends_at   := (p_date + p_end_time)   at time zone v_time_zone;

  select p.status into v_patient_status
  from public.patients p
  where p.id = p_patient_id
    and p.organization_id = v_org;

  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  if v_patient_status <> 'active' then
    raise exception 'patient is not in active care' using errcode = '22023';
  end if;

  -- Die Grundlage muss zur Organisation UND zu derselben Patient:in gehoeren.
  -- Eine fremde und eine unbekannte ID erzeugen dieselbe Meldung und taugen
  -- damit nicht als Existenz-Orakel (PROJECT_PRINCIPLES.md 13).
  if p_treatment_basis_id is not null then
    select p.id into v_verordnung
    from public.treatment_bases p
    where p.id = p_treatment_basis_id
      and p.organization_id = v_org
      and p.patient_id = p_patient_id;

    if not found then
      raise exception 'treatment basis not found' using errcode = 'P0002';
    end if;
  end if;

  if not app.is_assignable_therapist(p_staff_member_id, v_org) then
    raise exception 'staff member not assignable' using errcode = 'P0002';
  end if;

  v_ausserhalb := not app.is_within_working_hours(
    p_staff_member_id, v_org, p_date, p_start_time, p_end_time
  );

  if v_ausserhalb and not coalesce(p_allow_outside_working_hours, false) then
    raise exception 'outside_working_hours' using errcode = '22023';
  end if;

  if p_appointment_type = 'practice' then
    if p_location_id is null then
      raise exception 'practice appointment requires a location' using errcode = '22023';
    end if;

    select l.id into v_location_id
    from public.locations l
    where l.id = p_location_id
      and l.organization_id = v_org;

    if not found then
      raise exception 'location not found' using errcode = 'P0002';
    end if;
  else
    v_location_id := null;
  end if;

  if p_appointment_type = 'home_visit' then
    select
      nullif(btrim(c.street), ''),
      nullif(btrim(c.house_number), ''),
      nullif(btrim(c.postal_code), ''),
      nullif(btrim(c.city), '')
      into v_street, v_house, v_postal, v_city
    from public.patient_contact_details c
    where c.patient_id = p_patient_id;

    if v_street is null or v_house is null or v_postal is null or v_city is null then
      raise exception 'home visit requires a complete patient address' using errcode = '22023';
    end if;
  end if;

  begin
    insert into public.appointments (
      organization_id, patient_id, staff_member_id, location_id,
      appointment_type, kind, status, starts_at, ends_at,
      visit_street, visit_house_number, visit_postal_code, visit_city,
      treatment_basis_id, created_by
    )
    values (
      v_org, p_patient_id, p_staff_member_id, v_location_id,
      -- ADR-018 Punkt 2: Ein angelegter Termin ist bestaetigt. 'requested' und
      -- 'tentative' gibt es erst mit einem Portal, das sie erzeugen kann.
      p_appointment_type, 'therapy', 'confirmed', v_starts_at, v_ends_at,
      v_street, v_house, v_postal, v_city,
      v_verordnung, v_actor
    )
    returning id into v_appointment_id;
  exception
    when exclusion_violation then
      raise exception 'appointment overlaps an existing one' using errcode = '23P01';
  end;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'appointment.created', 'appointment', v_appointment_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', p_patient_id,
      'staff_member_id', p_staff_member_id,
      -- Eine ID, kein Inhalt: die Grundlage selbst traegt die klinischen
      -- Felder, und die gehoeren nicht ins Auditlog (ADR-010 Punkt 3).
      'treatment_basis_id', v_verordnung,
      'outside_working_hours', v_ausserhalb,
      -- FIX-019: Nachgetragen oder zurueckgelegt - das Auditlog sagt es.
      'in_the_past', p_date < v_heute
    )
  );

  return v_appointment_id;
end;
$$;

-- Herkunft: 20260921120000_appointment_context_guards.sql

create or replace function public.finalize_overdue_treatment_notes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note  record;
  v_count integer := 0;
begin
  for v_note in
    select t.id,
           t.organization_id,
           t.appointment_id,
           t.content,
           t.updated_by,
           a.patient_id,
           app.documentation_deadline(
             a.starts_at, t.created_at, o.time_zone, o.documentation_auto_finalize_days
           ) as due_at
    from public.treatment_notes t
    join public.appointments a   on a.id = t.appointment_id
    join public.organizations o  on o.id = t.organization_id
    where t.status = 'draft'
      and a.kind = 'therapy'
      and app.documentation_deadline(
            a.starts_at, t.created_at, o.time_zone, o.documentation_auto_finalize_days
          ) <= now()
    order by t.created_at
    for update of t skip locked
  loop
    update public.treatment_notes
       set status            = 'final',
           finalisation_kind = 'automatic',
           finalized_at      = now(),
           finalized_by      = null,
           updated_at        = now()
     where id = v_note.id;

    insert into public.treatment_note_versions (
      organization_id, note_id, version_no, content, change_reason, author_id
    )
    values (
      v_note.organization_id, v_note.id, 1, v_note.content, null, v_note.updated_by
    );

    insert into public.audit_log (
      organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
    )
    values (
      v_note.organization_id, null, 'system', 'treatment_note.auto_finalized',
      'treatment_note', v_note.id, 'success',
      jsonb_build_object(
        'surface', 'scheduler',
        'appointment_id', v_note.appointment_id,
        'patient_id', v_note.patient_id,
        'due_at', v_note.due_at
      )
    );

    perform app.mark_appointment_documented(v_note.appointment_id, null);

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.list_day_plan(p_date date, p_staff_member_id uuid)
returns table (
  id uuid, patient_id uuid, staff_member_id uuid, appointment_type text, kind text,
  title text, status text, starts_at timestamptz, ends_at timestamptz,
  patient_given_name text, patient_family_name text, location_name text,
  visit_street text, visit_house_number text, visit_postal_code text, visit_city text,
  patient_phone text, patient_phone_mobile text,
  home_visit_access_note text, special_note text,
  documentation_status text, organization_time_zone text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org           uuid;
  v_tz            text;
  v_start         timestamptz;
  v_end           timestamptz;
  v_darf_nachweis boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft. Derselbe Schnitt wie beim Kalender: die Tagesliste ist eine
  -- andere Darstellung derselben Termine, kein zweites Recht.
  if not app.can_read_appointments() then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  if p_date is null or p_staff_member_id is null then
    raise exception 'date and staff member are required' using errcode = '22023';
  end if;

  select o.time_zone into v_tz
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  -- Halboffenes Fenster [Tag 00:00, Folgetag 00:00) in der Zeitzone der Praxis
  -- - dieselbe Auslegung wie in list_appointments und create_appointment.
  v_start := (p_date::timestamp) at time zone v_tz;
  v_end   := ((p_date + 1)::timestamp) at time zone v_tz;

  v_darf_nachweis := app.can_read_treatment_evidence();

  return query
    select
      a.id,
      a.patient_id,
      a.staff_member_id,
      a.appointment_type,
      a.kind,
      a.title,
      a.status,
      a.starts_at,
      a.ends_at,
      pp.given_name,
      pp.family_name,
      l.name,
      a.visit_street,
      a.visit_house_number,
      a.visit_postal_code,
      a.visit_city,
      pc.phone,
      pc.phone_mobile,
      -- Zweckbindung: der Zugangshinweis beschreibt die Wohnungstuer. Zu
      -- einem Praxis- oder Videotermin hat er keinen Zweck.
      case when a.appointment_type = 'home_visit' then care.home_visit_access_note end,
      case when a.appointment_type = 'home_visit' then care.special_note end,
      -- ANN-006: Dokumentationsstand ohne Inhalt. Leer, wenn die Rolle den
      -- Behandlungsnachweis nicht lesen darf - eine falsche Angabe waere
      -- schlimmer als keine. An einem Ereignis ebenfalls leer: Dort gibt es
      -- keine Dokumentation, und 'none' hiesse "fehlt noch" (CAL-016). Am
      -- Trainingstermin gilt dasselbe, und zwar dauerhaft (ADR-022 Punkt 6).
      case when v_darf_nachweis and a.kind = 'therapy' then coalesce(t.status, 'none') end,
      v_tz
    from public.appointments a
    left join public.patients p        on p.id  = a.patient_id
    left join public.persons pp        on pp.id = p.person_id
    left join public.locations l  on l.id  = a.location_id
    left join public.patient_contact_details pc on pc.patient_id = a.patient_id
    left join public.patient_care_details care  on care.patient_id = a.patient_id
    left join public.treatment_notes t
           on t.appointment_id = a.id
          and t.addendum_to_note_id is null
    where a.organization_id  = v_org
      and app.may_read_appointment_context(a.kind)
      and a.staff_member_id  = p_staff_member_id
      and a.starts_at       >= v_start
      and a.starts_at        < v_end
    order by a.starts_at, a.id;
end;
$$;

create or replace function public.record_no_show(
  p_appointment_id      uuid,
  p_expected_updated_at timestamptz,
  p_protocol_confirmed  boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid;
  v_org      uuid;
  v_alt      record;
  v_protokoll boolean;
  v_anlass   text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_record_no_show() then
    raise exception 'not allowed to record no-shows' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to record no-shows' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.staff_member_id, a.status, a.kind,
         a.appointment_type, a.updated_at
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_alt.kind = 'internal' then
    raise exception 'event cannot be recorded as no-show' using errcode = '22023';
  end if;

  if v_alt.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be recorded as no-show' using errcode = '22023';
  end if;

  if v_alt.status = 'no_show' then
    raise exception 'appointment is already recorded as no-show' using errcode = '22023';
  end if;

  if v_alt.status <> 'confirmed' then
    raise exception 'completed appointment must be reopened first' using errcode = '22023';
  end if;

  -- Wo dokumentiert wurde, hat eine Behandlung stattgefunden. Der Vermerk
  -- waere ein Widerspruch zum Nachweis - und wuerde die Invariante aus
  -- ADR-018 Punkt 3 aushebeln.
  if exists (
    select 1 from public.treatment_notes t where t.appointment_id = p_appointment_id
  ) then
    raise exception 'documented appointment cannot be recorded as no-show' using errcode = '22023';
  end if;

  if v_alt.kind <> 'therapy' then
    -- Der Trainingstermin: Vermerk ja, Forderung nein. Das Protokoll aus
    -- ANN-055 traegt den Anlass; ohne Anlass hat es nichts zu bestaetigen.
    if p_protocol_confirmed is true then
      raise exception 'no-show protocol applies to treatment appointments only'
        using errcode = '22023';
    end if;
    v_protokoll := false;
    v_anlass    := null;

  -- Das Protokoll ist ein Hausbesuchsprotokoll (ANN-055). An der Praxistuer
  -- gibt es nichts zu klingeln, und eine Bestaetigung, die niemand geben
  -- kann, waere hier die Grundlage einer Forderung.
  elsif v_alt.appointment_type = 'home_visit' then
    if p_protocol_confirmed is not true then
      raise exception 'no-show protocol must be confirmed for home visits'
        using errcode = '22023';
    end if;
    v_protokoll := true;
    v_anlass    := 'no_show';
  else
    if p_protocol_confirmed is true then
      raise exception 'no-show protocol applies to home visits only'
        using errcode = '22023';
    end if;
    v_protokoll := false;
    v_anlass    := null;
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  update public.appointments
     set status                    = 'no_show',
         no_show_recorded_at       = now(),
         no_show_recorded_by       = v_actor,
         no_show_protocol_confirmed = v_protokoll,
         fee_basis                 = v_anlass,
         updated_at                = now()
   where id = p_appointment_id
     and updated_at = p_expected_updated_at
     and status = 'confirmed';

  if not found then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  -- Das Protokoll steht im Kontext, weil es eine Forderung begruendet
  -- (ADR-010). Kein klinischer Inhalt: Dass niemand geoeffnet hat, ist eine
  -- organisatorische Feststellung.
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'appointment.no_show', 'appointment', p_appointment_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_alt.patient_id,
      'staff_member_id', v_alt.staff_member_id,
      'protocol_confirmed', v_protokoll,
      'fee_basis', v_anlass
    )
  );

  return p_appointment_id;
end;
$$;

create or replace function public.treatment_notes_context_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_kind text;
begin
  select a.kind into v_kind
  from public.appointments a
  where a.id = new.appointment_id;

  if v_kind is distinct from 'therapy' then
    raise exception 'only a treatment appointment can be documented'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

-- Herkunft: 20260921140000_invoice_service_area.sql

create or replace function app.service_area_of_appointment_kind(p_kind text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_kind
           when 'therapy'  then 'therapy'
           when 'training'  then 'training'
           else null
         end;
$$;
