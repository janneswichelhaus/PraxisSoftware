-- =============================================================================
-- Absage unter 24 Stunden und Nichtantreffen (CAL-014b)
--
-- Umsetzung der Festlegung des Projektinhabers vom 2026-09-12, ausgefuehrt in
-- ADR-018 Fassung 2 Punkt 8 und PROJECT_PRINCIPLES.md 0.8 Abschnitt 8:
--
--   Patientenabsage weniger als 24 Stunden vor Behandlungsbeginn
--     -> Ausfallgebuehr.
--   Person beim Hausbesuch vor Ort nicht angetroffen
--     -> Termin abhaken mit Vermerk, ohne Gebuehrenentscheidung.
--
-- Drei Dinge aendern sich:
--
--   1. Der EINGANG der Absage bekommt eine eigene Spalte. Er ist nicht
--      dasselbe wie `cancelled_at`: Der Anruf kommt abends aufs Band,
--      eingetragen wird am naechsten Morgen. Ohne die Trennung entschiede die
--      Schreibgeschwindigkeit des Bueros ueber eine Forderung gegen eine
--      Patientin.
--   2. Aus dem Pflichtkennzeichen `no_show_fee` wird `fee_basis` - der
--      GEBUEHRENANLASS. Es sagt, OB abgerechnet werden soll und WORAUS. Wie
--      viel, steht im Leistungskatalog (ABR-001); ob eine Rechnung entsteht,
--      entscheidet ABR-003. Gesetzt wird es ausschliesslich vom Server.
--   3. `record_no_show` verliert seinen Gebuehrenparameter. Das Abhaken ist
--      ein Tap, kein Formular (E14 haelt fest, was dazu offen bleibt).
--
-- Was sich NICHT aendert: Der Termin bleibt als abgesagt beziehungsweise nicht
-- angetroffen erkennbar - der Gebuehrenanlass ist ein Merkmal daneben und kein
-- eigener Zustand. Und Bestandszeilen werden nicht umgedeutet: Eine Absage
-- ohne festgehaltenen Eingang hat keine Frist, aus der sich etwas rechnen
-- liesse, und ein bereits gesetztes Ausfallhonorar-Kennzeichen war die
-- ausdrueckliche Entscheidung eines Menschen und wandert unveraendert mit.
-- =============================================================================

alter table public.appointments
  add column cancellation_received_at timestamptz,
  add column fee_basis                text;

comment on column public.appointments.cancellation_received_at is
  'Zeitpunkt, zu dem die Absage die Praxis ERREICHT hat - nicht der ihrer Eingabe (das ist cancelled_at). Grundlage der 24-Stunden-Frist (CAL-014b, ADR-018 Fassung 2 Punkt 8). Bestandszeilen tragen null.';
comment on column public.appointments.fee_basis is
  'Gebuehrenanlass: woraus eine Gebuehr entstehen soll. null heisst keine. In V1 setzt der Server ausschliesslich late_cancellation; no_show stammt aus dem Pflichtkennzeichen vor ADR-018 Fassung 2. Kein Betrag - Hoehe und Abrechnungsweg gehoeren zu ABR-001 und ABR-003.';

-- -----------------------------------------------------------------------------
-- Die Kennzeichen aus Fassung 1 wandern mit, bevor die Spalte faellt
--
-- `no_show_fee = true` war eine ausdrueckliche Entscheidung und bleibt eine.
-- `false` und `null` werden zu `null`: "keine Gebuehr" braucht kein eigenes
-- Wort. Damit bleibt der Loeschschutz aus ANN-035 fuer genau die Zeilen
-- erhalten, fuer die er galt.
-- -----------------------------------------------------------------------------
update public.appointments
   set fee_basis = 'no_show'
 where no_show_fee is true;

-- Die Terminsicht liest die Spalte und haelt sie damit fest. Sie entsteht am
-- Ende dieser Migration neu, mit `fee_basis` an ihrer Stelle.
drop view public.appointment_directory;

alter table public.appointments drop constraint appointments_no_show_fields;
alter table public.appointments drop column no_show_fee;

-- Der Vermerk steht jetzt ohne Gebuehrenentscheidung.
alter table public.appointments
  add constraint appointments_no_show_fields check (
    (status = 'no_show'
      and no_show_recorded_at is not null
      and no_show_recorded_by is not null)
    or (status <> 'no_show'
      and no_show_recorded_at is null
      and no_show_recorded_by is null)
  );

-- Ein Eingang ohne Absage waere ein Rest aus einem frueheren Zustand - und es
-- gibt keinen Weg aus 'cancelled' heraus, die Bedingung kann also nie stoeren.
alter table public.appointments
  add constraint appointments_cancellation_received_needs_cancellation check (
    cancellation_received_at is null or status = 'cancelled'
  );

-- Jeder Anlass gehoert zu genau einem Zustand. Das haelt die Auswertung
-- ehrlich: "Absage mit Gebuehr" und "Nichtantreffen mit Gebuehr" sind zwei
-- verschiedene Sachverhalte und duerfen nicht ineinander rutschen.
alter table public.appointments
  add constraint appointments_fee_basis_values check (
    fee_basis is null
    or (fee_basis = 'late_cancellation' and status = 'cancelled')
    or (fee_basis = 'no_show'           and status = 'no_show')
  );

-- Ein Gebuehrenanlass 'late_cancellation' ohne festgehaltenen Eingang waere
-- eine Forderung ohne ihre Grundlage.
alter table public.appointments
  add constraint appointments_late_cancellation_needs_receipt check (
    fee_basis is distinct from 'late_cancellation'
    or cancellation_received_at is not null
  );

-- -----------------------------------------------------------------------------
-- Die Frist an genau einer Stelle
--
-- Eine Funktion statt einer Zahl im Schreibpfad: Sie ist die eine Stelle, an
-- der "24 Stunden" steht, sie ist aus dem Test direkt pruefbar, und eine
-- spaetere Aenderung der Frist ist eine Zeile. `immutable`, weil sie nur ihre
-- Argumente liest - der Zeitpunkt kommt von aussen.
--
-- WENIGER ALS 24 Stunden: Genau 24 Stunden liegen ausserhalb der Regel
-- (ADR-018 Fassung 2 Punkt 8). Gerechnet wird auf timestamptz und damit in
-- absoluten Stunden; eine Zeitumstellung verschiebt die Grenze um genau die
-- Stunde, um die sie sie in Wirklichkeit verschiebt.
-- -----------------------------------------------------------------------------
create function app.cancellation_notice_period()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '24 hours'
$$;

comment on function app.cancellation_notice_period() is
  'Frist, unter der eine Patientenabsage eine Ausfallgebuehr ausloest (PROJECT_PRINCIPLES.md 8, ADR-018 Fassung 2 Punkt 8). Die eine Stelle, an der die 24 Stunden stehen.';

create function app.is_late_cancellation(
  p_reason      text,
  p_received_at timestamptz,
  p_starts_at   timestamptz
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    -- Nur die Patientenabsage. Praxisbedingte Absagen loesen nie aus (so
    -- entschieden); "verlegt" und "sonstiger Grund" ebenfalls nicht - sie
    -- sagen zu wenig ueber den Anlass, und eine zu Unrecht vorgemerkte
    -- Forderung ist teurer zurueckzunehmen als eine nachzutragende
    -- (PROJECT_PRINCIPLES.md 16). Das ist ANN-047.
    p_reason = 'patient_request'
    and p_received_at is not null
    and p_starts_at - p_received_at < app.cancellation_notice_period()
$$;

comment on function app.is_late_cancellation(text, timestamptz, timestamptz) is
  'Loest diese Absage eine Ausfallgebuehr aus? Weniger als 24 Stunden zwischen Eingang und vereinbartem Beginn, und nur bei patient_request (CAL-014b).';

-- Kein EXECUTE fuer `authenticated`: Die Frist gehoert in den Schreibpfad, die
-- Oberflaeche liest das Ergebnis an der Zeile (wie app.appointment_window_minutes).
revoke all on function app.cancellation_notice_period() from public, anon, authenticated;
revoke all on function app.is_late_cancellation(text, timestamptz, timestamptz) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- cancel_appointment bekommt den Eingang
--
-- Zwei Parameter ohne Standardwert statt einem Zeitstempel: Datum und Uhrzeit
-- in ORTSZEIT der Praxis, so wie sie auch `create_appointment` entgegennimmt.
-- Die Umrechnung in einen Zeitpunkt macht der Server, der die Zeitzone der
-- Organisation ohnehin fuehrt. Ein `timestamptz` aus dem Browser haette
-- verlangt, dass die Oberflaeche eine Wanduhrzeit in der Praxiszeitzone in
-- einen Zeitpunkt umrechnet - genau die Rechnung, die sie nirgends sonst
-- macht und an der sie in einer fremden Zeitzone falsch laege.
--
-- BEIDE `null` heisst ausdruecklich "jetzt eingegangen" und laesst den Server
-- stempeln. Das ist der Regelfall am Telefon und vermeidet, dass eine
-- abweichende Uhr im Browser ueber eine Frist entscheidet. Mit Angabe heisst
-- es "frueher eingegangen, jetzt erst eingetragen" - die nachtraegliche
-- Erfassung. Die alte Signatur wird entfernt, wie schon bei CAL-008b: Ein
-- Standardwert waere hier das Gegenteil einer bewussten Angabe.
-- -----------------------------------------------------------------------------
drop function public.cancel_appointment(uuid, timestamptz, text);

create function public.cancel_appointment(
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

  select a.id, a.patient_id, a.staff_member_id, a.status, a.starts_at, a.updated_at
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
  v_anlass := case
    when app.is_late_cancellation(p_reason, v_eingang, v_alt.starts_at) then 'late_cancellation'
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

comment on function public.cancel_appointment(uuid, timestamptz, text, date, time) is
  'Sagt einen bestaetigten Termin mit Pflichtgrund ab, haelt den Eingang der Absage in Ortszeit fest, rechnet die 24-Stunden-Frist serverseitig und protokolliert appointment.cancelled (CAL-003, CAL-008b, CAL-014b, ADR-018 Fassung 2). Datum und Uhrzeit beide null heisst "jetzt".';

revoke all on function public.cancel_appointment(uuid, timestamptz, text, date, time) from public, anon;
grant execute on function public.cancel_appointment(uuid, timestamptz, text, date, time) to authenticated;

-- -----------------------------------------------------------------------------
-- record_no_show ohne Gebuehrenentscheidung
--
-- Der Vermerk ist ein datensparsamer organisatorischer Abschluss: Die
-- behandelnde Person steht vor der Tuer, niemand oeffnet, und sie hakt den
-- Termin ab. Eine Pflichtfrage nach dem Ausfallhonorar an dieser Stelle
-- verlangte eine Entscheidung, fuer die es noch gar keine Regel gibt (E14).
--
-- Unveraendert bleibt alles Uebrige: Der Zeitraum bleibt belegt, ein Irrtum
-- wird ueber `reopen_appointment` zurueckgenommen, und ein Termin mit
-- Behandlungsnachweis kann nicht zum Vermerk werden (und umgekehrt).
-- -----------------------------------------------------------------------------
drop function public.record_no_show(uuid, timestamptz, boolean);

create function public.record_no_show(
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

  select a.id, a.patient_id, a.staff_member_id, a.status, a.updated_at
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
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

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  update public.appointments
     set status              = 'no_show',
         no_show_recorded_at = now(),
         no_show_recorded_by = v_actor,
         updated_at          = now()
   where id = p_appointment_id
     and updated_at = p_expected_updated_at
     and status = 'confirmed';

  if not found then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  -- Ohne 'fee': Aus dem Vermerk allein entsteht keine Gebuehr, und ein
  -- Schluessel, der immer `false` traegt, waere eine Zusicherung, die niemand
  -- gegeben hat (ADR-018 Fassung 2 Punkt 8, E14).
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'appointment.no_show', 'appointment', p_appointment_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_alt.patient_id,
      'staff_member_id', v_alt.staff_member_id
    )
  );

  return p_appointment_id;
end;
$$;

comment on function public.record_no_show(uuid, timestamptz) is
  'Vermerkt einen bestaetigten Termin als nicht angetroffen und protokolliert appointment.no_show. Ohne Gebuehrenentscheidung: aus dem Vermerk allein entsteht keine Gebuehr (CAL-014b, ADR-018 Fassung 2 Punkt 8).';

revoke all on function public.record_no_show(uuid, timestamptz) from public, anon;
grant execute on function public.record_no_show(uuid, timestamptz) to authenticated;

-- -----------------------------------------------------------------------------
-- reopen_appointment raeumt den Gebuehrenanlass mit ab
--
-- Unveraendert aus 20260912120000_appointment_no_show.sql bis auf die
-- geleerten Felder: `no_show_fee` gibt es nicht mehr, `fee_basis` schon. Wer
-- einen Termin wieder oeffnet, sagt damit, dass der Vorgang nicht
-- stattgefunden hat - eine Forderung aus ihm waere gegenstandslos. Die
-- Historie bleibt im Auditlog.
--
-- Aus 'cancelled' gibt es weiterhin keinen Rueckweg; der Gebuehrenanlass einer
-- Absage bleibt also, bis ABR-003 ihn abrechnet oder der Loeschlauf die Zeile
-- nimmt.
-- -----------------------------------------------------------------------------
create or replace function public.reopen_appointment(
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

  if not app.can_reopen_appointment() then
    raise exception 'not allowed to reopen appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to reopen appointments' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.staff_member_id, a.status, a.updated_at
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_alt.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be reopened' using errcode = '22023';
  end if;

  -- 'documented' und 'invoiced' haben keinen Rueckweg: korrigiert wird in der
  -- Dokumentation beziehungsweise ueber den Rechnungsstorno (ADR-018 Punkt 2).
  if v_alt.status not in ('completed', 'no_show') then
    raise exception 'appointment is not completed' using errcode = '22023';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  update public.appointments
     set status              = 'confirmed',
         completed_at        = null,
         completed_by        = null,
         no_show_recorded_at = null,
         no_show_recorded_by = null,
         fee_basis           = null,
         updated_at          = now()
   where id = p_appointment_id
     and updated_at = p_expected_updated_at
     and status in ('completed', 'no_show');

  if not found then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'appointment.reopened', 'appointment', p_appointment_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_alt.patient_id,
      'staff_member_id', v_alt.staff_member_id,
      -- Aus welchem Zustand zurueck: organisatorisch, kein Personenbezug.
      'from_status', v_alt.status
    )
  );

  return p_appointment_id;
end;
$$;

comment on function public.reopen_appointment(uuid, timestamptz) is
  'Setzt einen abgeschlossenen oder als nicht angetroffen vermerkten Termin auf bestaetigt zurueck, raeumt einen Gebuehrenanlass mit ab und protokolliert appointment.reopened (CAL-004, CAL-008c, CAL-014b, ADR-010, ADR-018).';

-- -----------------------------------------------------------------------------
-- cancel_staff_day reicht den Eingang durch
--
-- Unveraendert aus 20260912140000_cancel_staff_day.sql bis auf den vierten
-- Parameter am Aufruf. `null` heisst "jetzt", und das ist hier genau richtig:
-- Der Tag wird in diesem Augenblick umgeplant - die Entscheidung faellt in der
-- Praxis und nicht frueher bei jemand anderem.
-- -----------------------------------------------------------------------------
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

comment on function public.cancel_staff_day(uuid, date, text) is
  'Sagt alle bestaetigten Termine einer Person an einem Kalendertag in einer Transaktion ab und liefert ihre Anzahl (CAL-009). Ruft je Termin cancel_appointment auf; deren Rechte-, Zustands-, Fristen- und Auditregeln gelten unveraendert (CAL-014b).';

-- -----------------------------------------------------------------------------
-- Loeschlauf: jeder Vorgang mit Gebuehrenanlass bleibt stehen
--
-- ANN-035, erweitert. Bisher hielt die Regel den No-show mit Kennzeichen
-- zurueck; ab jetzt jeden Vorgang mit `fee_basis` - also auch die Absage unter
-- 24 Stunden. Die Begruendung ist dieselbe und wiegt hier schwerer: Was
-- abgerechnet wird, faellt unter die steuerliche Aufbewahrung und nicht unter
-- die interne Dreijahresfrist. Eine Loeschung laesst sich nachholen, eine
-- geloeschte Grundlage einer Forderung nicht (PROJECT_PRINCIPLES.md 16).
--
-- Anker bleibt `cancelled_at` beziehungsweise `no_show_recorded_at` und
-- ausdruecklich NICHT der neue Eingang: Der Vorgang, den die Praxis vollzogen
-- hat, ist die Eintragung. Ein nachgetragener Eingang wuerde die Frist sonst
-- vorziehen.
-- -----------------------------------------------------------------------------
create or replace function public.apply_retention()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run       uuid := extensions.gen_random_uuid();
  v_org       record;
  v_akte      record;
  v_akten     integer;
  v_gehalten  integer;
  v_termine   integer;
  v_audit     integer;
  v_zugang    integer;
  v_gesamt    integer := 0;
begin
  for v_org in select o.id, o.time_zone from public.organizations o order by o.id
  loop
    v_akten    := 0;
    v_gehalten := 0;

    -- -------------------------------------------------------------------
    -- Klinische Patientenakte: zehn Jahre nach Abschluss der Versorgung
    -- -------------------------------------------------------------------
    for v_akte in
      select p.id,
             app.retention_due_at(
               p.care_concluded_on, app.retention_interval('patientenakte'), v_org.time_zone
             ) as due_at
      from public.patients p
      where p.organization_id = v_org.id
        and p.care_concluded_on is not null
        and app.retention_due_at(
              p.care_concluded_on, app.retention_interval('patientenakte'), v_org.time_zone
            ) <= now()
      order by p.care_concluded_on
      for update of p skip locked
    loop
      if app.under_legal_hold(v_org.id, 'patient', v_akte.id) then
        v_gehalten := v_gehalten + 1;
        continue;
      end if;

      v_akten := v_akten + app.delete_patient_record(v_akte.id, v_run, v_akte.due_at);
    end loop;

    -- -------------------------------------------------------------------
    -- Abgesagte Termine und No-shows ohne Behandlungsnachweis: drei Jahre
    -- ab Ende des Kalenderjahres der Absage beziehungsweise des Vermerks.
    --
    -- Haengt Dokumentation am Termin, gilt die Frist der Akte - der Termin
    -- ist dann Teil des Behandlungsnachweises (ADR-008 Punkt 2). Ein
    -- Vorgang mit Gebuehrenanlass bleibt stehen: er ist die Grundlage
    -- einer Forderung (ANN-035, CAL-014b). Mit der Abrechnung kommt die
    -- allgemeine Bedingung "ohne Rechnung" dazu (ABR).
    -- -------------------------------------------------------------------
    with faellig as (
      select a.id,
             a.organization_id,
             app.retention_due_at(
               (date_trunc(
                  'year',
                  coalesce(a.cancelled_at, a.no_show_recorded_at) at time zone v_org.time_zone
                ) + interval '1 year' - interval '1 day')::date,
               app.retention_interval('termin_ohne_nachweis'),
               v_org.time_zone
             ) as due_at
      from public.appointments a
      where a.organization_id = v_org.id
        and a.fee_basis is null
        and (
          (a.status = 'cancelled' and a.cancelled_at is not null)
          or (a.status = 'no_show' and a.no_show_recorded_at is not null)
        )
        and not exists (
          select 1 from public.treatment_notes t where t.appointment_id = a.id
        )
        and not app.under_legal_hold(v_org.id, 'patient', a.patient_id)
    ),
    geloescht as (
      delete from public.appointments a
      using faellig f
      where a.id = f.id
        and f.due_at <= now()
      returning a.id, a.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'appointments', g.id, 'termin_ohne_nachweis', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_termine = row_count;

    -- -------------------------------------------------------------------
    -- Auditlog: drei Jahre ab dem Ereignis (ANN-029)
    -- -------------------------------------------------------------------
    with geloescht as (
      delete from public.audit_log a
      where a.organization_id = v_org.id
        and a.occurred_at < now() - app.retention_interval('auditlog')
        and not (
          a.subject_type = 'patient'
          and app.under_legal_hold(v_org.id, 'patient', a.subject_id)
        )
      returning a.id, a.organization_id, a.occurred_at
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'audit_log', g.id, 'auditlog',
           g.occurred_at + app.retention_interval('auditlog')
    from geloescht g;
    get diagnostics v_audit = row_count;

    -- -------------------------------------------------------------------
    -- Einladungen: zwoelf Monate nach Abschluss des Vorgangs (ANN-026)
    -- -------------------------------------------------------------------
    with faellig as (
      select i.id,
             i.organization_id,
             coalesce(
               i.accepted_at,
               i.revoked_at,
               case when i.status = 'pending' and i.expires_at <= now() then i.expires_at end
             ) + app.retention_interval('zugangseinladung') as due_at
      from public.staff_account_invitations i
      where i.organization_id = v_org.id
    ),
    geloescht as (
      delete from public.staff_account_invitations i
      using faellig f
      where i.id = f.id
        and f.due_at is not null
        and f.due_at <= now()
      returning i.id, i.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'staff_account_invitations', g.id, 'zugangseinladung', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_zugang = row_count;

    v_gesamt := v_gesamt + v_akten + v_termine + v_audit + v_zugang;

    if v_akten + v_termine + v_audit + v_zugang > 0 or v_gehalten > 0 then
      insert into public.audit_log (
        organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
      )
      values (
        v_org.id, null, 'system', 'retention.applied', 'organization', v_org.id, 'success',
        jsonb_build_object(
          'surface', 'scheduler',
          'run_id', v_run,
          'patientenakte', v_akten,
          'termin_ohne_nachweis', v_termine,
          'auditlog', v_audit,
          'zugangseinladung', v_zugang,
          'legal_hold_gehalten', v_gehalten
        )
      );
    end if;
  end loop;

  return v_gesamt;
end;
$$;

comment on function public.apply_retention() is
  'Loescht alle faelligen Datensaetze nach dem Retention Schedule, schreibt je Datensatz eine Journalzeile und je Organisation ein Auditereignis retention.applied mit Systemakteur (ADR-008, LOE-002a, CAL-008c, CAL-014b, ANN-007, ANN-035). Ein Vorgang mit Gebuehrenanlass bleibt stehen. Nur fuer den Scheduler ausfuehrbar.';

-- -----------------------------------------------------------------------------
-- Die Terminsicht fuehrt Eingang und Gebuehrenanlass
--
-- Unveraendert aus 20260912180000_appointment_notification.sql bis auf die
-- beiden Spalten an der Stelle von `no_show_fee`. Abgeraeumt wurde sie schon
-- oben, vor dem Fallenlassen der Spalte.
-- -----------------------------------------------------------------------------
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
  a.cancellation_received_at,
  a.completed_at,
  a.no_show_recorded_at,
  a.fee_basis,
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
