-- =============================================================================
-- Die drei Hausbesuch-Szenarien (CAL-018)
--
-- Umsetzung der verbindlichen Festlegung des Projektinhabers vom 2026-09-13
-- (E14 erledigt), ausgefuehrt in ADR-018 Fassung 3 Punkt 9 und
-- PROJECT_PRINCIPLES.md 0.10 Abschnitt 8:
--
--   1. Tuer geoeffnet, Behandlung findet auf Angabe der Patient:in nicht statt
--      -> Termin gilt als DURCHGEFUEHRT, Pflichtvermerk in der Dokumentation,
--         normale Abrechnung, KEINE Ausfallgebuehr.
--   2. Nicht angetroffen nach Protokoll (15 Minuten gewartet, geklingelt,
--      angerufen) -> nicht wahrgenommen, AUSFALLGEBUEHR.
--   3. Absage unter 24 Stunden -> Ausfallgebuehr (unveraendert, CAL-014b).
--
-- Drei Dinge aendern sich:
--
--   * `record_no_show` verlangt die Bestaetigung des Protokolls als
--     Pflichtangabe und setzt daraufhin `fee_basis = 'no_show'`
--     SERVERSEITIG. Ohne Bestaetigung gibt es kein Nichtantreffen: Der
--     Termin bleibt `confirmed`, bis die behandelnde Person entscheidet
--     (ADR-018 Fassung 3 Punkt 9 Nr. 1). Aus Fassung 2 kam der Vermerk ohne
--     jede Gebuehr; die Frage, die das offen liess, ist beantwortet.
--   * Die Bestaetigung bleibt am Termin stehen (`no_show_protocol_confirmed`).
--     Sie ist die Grundlage der Forderung, und das Auditlog traegt sie nur
--     drei Jahre (ANN-029), waehrend ein Vorgang mit Gebuehrenanlass laenger
--     aufbewahrt wird (ANN-035). Wo die Forderung steht, muss ihre Grundlage
--     stehen.
--   * Die Behandlungsdokumentation bekommt den Pflichtvermerk aus Szenario 1
--     als eigenes Merkmal (`visit_without_treatment`) - ausdruecklich kein
--     Freitext als einzige Quelle (ADR-018 Fassung 3 Punkt 9 Nr. 2).
--
-- Was sich NICHT aendert: Der Vermerk bleibt datensparsam. Ein Nichtantreffen
-- ist weiterhin keine Behandlung, traegt keine Dokumentation und erscheint
-- nicht als verbrauchte Verordnungsleistung. Und es entsteht kein Betrag:
-- WIE VIEL steht im Leistungskatalog (ABR-001), OB eine Rechnung entsteht,
-- entscheidet ABR-003.
--
-- ANN-055: Protokoll, Ausfallgebuehr und Pflichtvermerk gelten am
-- HAUSBESUCHSTERMIN. E14 regelt den Hausbesuch; fuer das Nichtantreffen in der
-- Praxis oder im Videotermin gibt es keine Festlegung, und eine zu Unrecht
-- vorgemerkte Forderung ist teurer zurueckzunehmen als eine nachzutragende
-- (PROJECT_PRINCIPLES.md 16). Dort bleibt der Vermerk deshalb, was er seit
-- CAL-014c ist: ein Schritt ohne Gebuehr. Der Anker der Annahme ist die
-- Artpruefung in `public.record_no_show` weiter unten.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die bestaetigte Grundlage der Forderung steht am Termin
-- -----------------------------------------------------------------------------
alter table public.appointments
  add column no_show_protocol_confirmed boolean;

comment on column public.appointments.no_show_protocol_confirmed is
  'Bestaetigung des Protokolls aus ADR-018 Fassung 3 Punkt 9 (15 Minuten gewartet, geklingelt, angerufen). true nur am Hausbesuch und nur mit Gebuehrenanlass; false, wo das Protokoll nicht gilt (Praxis, Video - ANN-055); null an Zeilen aus der Zeit vor CAL-018. Wird beim Wiederoeffnen geleert.';

-- Die Bestaetigung gehoert zum Vermerk und zu nichts sonst.
alter table public.appointments
  add constraint appointments_no_show_protocol_scope check (
    no_show_protocol_confirmed is null or status = 'no_show'
  );

-- Der Kern von E14 als Riegel, nicht nur als Funktionslogik (ADR-004,
-- Defense-in-Depth): Wo das Protokoll bestaetigt ist, entsteht die Gebuehr -
-- immer. Die Gegenrichtung steht bewusst NICHT hier: Bestandszeilen tragen
-- `fee_basis = 'no_show'` aus der Pflichtentscheidung der Fassung 1, ohne dass
-- je ein Protokoll erhoben wurde, und die werden nicht umgedeutet (ADR-018
-- Fassung 2 Punkt 8, "Was das fuer Bestandsdaten heisst").
--
-- `is not distinct from` und nicht `=`: Ein leerer Gebuehrenanlass ergaebe
-- sonst `null` statt `false`, und eine Constraint laesst `null` durch - der
-- Riegel haette genau den Fall offen gelassen, den er schliessen soll.
alter table public.appointments
  add constraint appointments_confirmed_protocol_means_fee check (
    no_show_protocol_confirmed is not true
    or fee_basis is not distinct from 'no_show'
  );

-- -----------------------------------------------------------------------------
-- 2. Der Pflichtvermerk aus Szenario 1 ist ein Merkmal, kein Freitext
--
-- „Kein Freitext als einzige Quelle" (ADR-018 Fassung 3 Punkt 9 Nr. 2): Ob die
-- Behandlung stattgefunden hat, entscheidet spaeter ueber eine Rechnung ohne
-- erbrachte Leistung. Das aus einem Satz in 20.000 Zeichen Freitext
-- herauszulesen, waere weder pruefbar noch auswertbar.
--
-- `not null default false`: Der Regelfall ist die stattgefundene Behandlung.
-- Bestandseintraege sind Behandlungen und bleiben es.
-- -----------------------------------------------------------------------------
alter table public.treatment_notes
  add column visit_without_treatment boolean not null default false;

comment on column public.treatment_notes.visit_without_treatment is
  'Pflichtvermerk aus Hausbesuch-Szenario 1 (ADR-018 Fassung 3 Punkt 9): Die Tuer wurde geoeffnet, die Behandlung fand auf Angabe der Patient:in nicht statt. Der Termin gilt trotzdem als durchgefuehrt und wird normal abgerechnet; eine Ausfallgebuehr entsteht NICHT. Gesetzt wird das Merkmal im Abschluss (complete_treatment), nie nachtraeglich von Hand.';

-- -----------------------------------------------------------------------------
-- 3. record_no_show verlangt das Protokoll
--
-- Unveraendert aus 20260912210000_appointment_events.sql bis auf die
-- Protokollpruefung, den Gebuehrenanlass und den Auditkontext. Der Parameter
-- traegt eine Vorbelegung, damit ein Aufruf ohne ihn nicht zufaellig zu einer
-- Forderung fuehrt: Ohne Bestaetigung passiert am Hausbesuch gar nichts.
-- -----------------------------------------------------------------------------
drop function public.record_no_show(uuid, timestamptz);

create function public.record_no_show(
  p_appointment_id      uuid,
  p_expected_updated_at timestamptz,
  -- Die drei Schritte des Protokolls zusammen, nicht einzeln: Sie gelten nur
  -- gemeinsam (ADR-018 Fassung 3 Punkt 9), und drei Spalten, die immer
  -- denselben Wert tragen, waeren drei Wahrheiten fuer eine Tatsache.
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

  if v_alt.kind = 'event' then
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

  -- Das Protokoll ist ein Hausbesuchsprotokoll (ANN-055). An der Praxistuer
  -- gibt es nichts zu klingeln, und eine Bestaetigung, die niemand geben
  -- kann, waere hier die Grundlage einer Forderung.
  if v_alt.appointment_type = 'home_visit' then
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

comment on function public.record_no_show(uuid, timestamptz, boolean) is
  'Vermerkt einen bestaetigten Behandlungstermin als nicht angetroffen. Am Hausbesuch nur mit bestaetigtem Protokoll (15 Minuten, Klingeln, Anruf) und setzt dann fee_basis = no_show serverseitig; an Praxis- und Videoterminen bleibt der Vermerk ohne Gebuehr (ANN-055). An einem Ereignis nicht moeglich. Protokolliert appointment.no_show (CAL-018, ADR-018 Fassung 3 Punkt 9).';

revoke all on function public.record_no_show(uuid, timestamptz, boolean) from public, anon;
grant execute on function public.record_no_show(uuid, timestamptz, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. reopen_appointment raeumt die Bestaetigung mit ab
--
-- Unveraendert aus 20260912200000_cancellation_notice.sql bis auf das eine
-- geleerte Feld. Wer einen Termin wieder oeffnet, sagt, dass der Vorgang nicht
-- stattgefunden hat; eine Protokollbestaetigung ohne Vermerk waere ein Rest.
-- Die Historie bleibt im Auditlog.
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
     set status                     = 'confirmed',
         completed_at               = null,
         completed_by               = null,
         no_show_recorded_at        = null,
         no_show_recorded_by        = null,
         no_show_protocol_confirmed = null,
         fee_basis                  = null,
         updated_at                 = now()
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
  'Setzt einen abgeschlossenen oder als nicht angetroffen vermerkten Termin auf bestaetigt zurueck, raeumt Gebuehrenanlass und Protokollbestaetigung mit ab und protokolliert appointment.reopened (CAL-004, CAL-008c, CAL-014b, CAL-018, ADR-010, ADR-018).';

-- -----------------------------------------------------------------------------
-- 5. complete_treatment traegt den Pflichtvermerk
--
-- Unveraendert aus 20260912130000_appointment_documented.sql bis auf den
-- Pflichtvermerk. Er wird gesetzt, BEVOR finalisiert wird: Nach der
-- Finalisierung ist der Eintrag Bestandteil der Akte und nur noch als
-- Korrektur mit Begruendung aenderbar (ADR-016).
--
-- Der Vermerk steht nur am Hausbesuch (ANN-055). Szenario 1 ist der geoeffnete
-- Tuerspalt; ob eine nicht erbrachte Behandlung in der Praxis ebenso verguetet
-- wird, hat niemand festgelegt, und die Rechnungsgrundlage fuer Fall 1 haengt
-- ohnehin an der Anfrage B4.
--
-- Vorbelegung `false`: Der Regelfall ist die stattgefundene Behandlung. Ein
-- Aufruf, der den Vermerk vergisst, erzeugt keinen.
-- -----------------------------------------------------------------------------
drop function public.complete_treatment(uuid, text, timestamptz, timestamptz);

create function public.complete_treatment(
  p_appointment_id                  uuid,
  p_content                         text,
  p_expected_appointment_updated_at timestamptz,
  p_expected_note_updated_at        timestamptz default null,
  p_visit_without_treatment         boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note_id      uuid;
  v_note_stand   timestamptz;
  v_note_status  text;
  v_org          uuid;
  v_termin       record;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_treatment_note() then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  if not app.can_complete_appointment() then
    raise exception 'not allowed to complete appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to complete appointments' using errcode = '42501';
  end if;

  select a.id, a.status, a.appointment_type
    into v_termin
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_termin.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be completed' using errcode = '22023';
  end if;

  if v_termin.status = 'no_show' then
    raise exception 'no-show appointment cannot be documented' using errcode = '22023';
  end if;

  if p_visit_without_treatment is true and v_termin.appointment_type <> 'home_visit' then
    raise exception 'visit without treatment applies to home visits only' using errcode = '22023';
  end if;

  select t.id, t.updated_at, t.status
    into v_note_id, v_note_stand, v_note_status
  from public.treatment_notes t
  where t.appointment_id = p_appointment_id
    and t.addendum_to_note_id is null;

  if v_note_id is null then
    if p_expected_note_updated_at is not null then
      raise exception 'treatment note was changed meanwhile' using errcode = '40001';
    end if;
    v_note_id := public.create_treatment_note(p_appointment_id, p_content);
  else
    if p_expected_note_updated_at is null
       or v_note_stand is distinct from p_expected_note_updated_at then
      raise exception 'treatment note was changed meanwhile' using errcode = '40001';
    end if;
    if v_note_status = 'final' then
      raise exception 'treatment note is already final' using errcode = '22023';
    end if;
    perform public.update_treatment_note(v_note_id, v_note_stand, p_content);
  end if;

  -- Erst der Abschluss: ein bereits abgeschlossener Termin wird nicht noch
  -- einmal abgeschlossen. Der Fall kommt aus der Tagesliste - dort steht ein
  -- abgeschlossener Termin ohne finalisierte Dokumentation weiterhin unter
  -- "offen" (UX-001).
  if v_termin.status = 'confirmed' then
    perform public.complete_appointment(p_appointment_id, p_expected_appointment_updated_at);
  end if;

  -- Der Pflichtvermerk gehoert zum Eintrag, nicht zum Termin: Er sagt etwas
  -- ueber die Behandlung aus, und die steht in der Akte. Ohne `updated_at`,
  -- damit der Stand fuer die Finalisierung gleich darunter derselbe bleibt,
  -- den update_treatment_note hinterlassen hat.
  update public.treatment_notes
     set visit_without_treatment = coalesce(p_visit_without_treatment, false)
   where id = v_note_id;

  -- Nach dem Schreiben neu lesen: update_treatment_note laesst den Stand bei
  -- unveraendertem Text bewusst stehen, bei geaendertem setzt es ihn neu.
  select t.updated_at into v_note_stand
  from public.treatment_notes t
  where t.id = v_note_id;

  -- Dann die Finalisierung, die den Termin auf documented hebt (CAL-008d).
  perform public.finalize_treatment_note(v_note_id, v_note_stand);

  return v_note_id;
end;
$$;

comment on function public.complete_treatment(uuid, text, timestamptz, timestamptz, boolean) is
  'Schliesst eine Behandlung in einem Schritt ab (UX-007): Entwurf schreiben, Termin abschliessen und finalisieren in EINER Transaktion. Ruft ausschliesslich die bestehenden Funktionen auf; deren Rechte-, Zustands- und Auditregeln gelten unveraendert. Traegt auf Wunsch den Pflichtvermerk aus Hausbesuch-Szenario 1 ein (CAL-018). Der Termin steht danach auf documented (ADR-018 Punkt 3).';

revoke all on function public.complete_treatment(uuid, text, timestamptz, timestamptz, boolean)
  from public, anon;
grant execute on function public.complete_treatment(uuid, text, timestamptz, timestamptz, boolean)
  to authenticated;

-- -----------------------------------------------------------------------------
-- 6. get_treatment_note liefert den Pflichtvermerk mit
--
-- Der Rueckgabetyp aendert sich, deshalb abraeumen und neu anlegen.
-- Unveraendert aus 20260904120000_treatment_note_auto_finalisation.sql bis auf
-- die eine Spalte: Ein Vermerk, den niemand wiedersieht, ist kein Vermerk.
-- -----------------------------------------------------------------------------
drop function public.get_treatment_note(uuid);

create function public.get_treatment_note(p_appointment_id uuid)
returns table (
  id                      uuid,
  appointment_id          uuid,
  addendum_to_note_id     uuid,
  status                  text,
  content                 text,
  visit_without_treatment boolean,
  created_at              timestamptz,
  updated_at              timestamptz,
  finalized_at            timestamptz,
  finalisation_kind       text,
  version_count           integer,
  author_name             text,
  last_editor_name        text,
  finalized_by_name       text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid;
  v_org     uuid;
  v_patient uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_treatment_note() then
    raise exception 'not allowed to read treatment documentation' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read treatment documentation' using errcode = '42501';
  end if;

  select a.patient_id into v_patient
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org;

  if not found then
    return;
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  select v_org, v_actor, 'treatment_note.viewed', 'treatment_note', t.id, 'success',
         jsonb_build_object(
           'surface', 'web',
           'appointment_id', p_appointment_id,
           'patient_id', v_patient
         )
  from public.treatment_notes t
  where t.appointment_id = p_appointment_id
    and t.organization_id = v_org;

  return query
    select t.id,
           t.appointment_id,
           t.addendum_to_note_id,
           t.status,
           t.content,
           t.visit_without_treatment,
           t.created_at,
           t.updated_at,
           t.finalized_at,
           t.finalisation_kind,
           (select count(*) from public.treatment_note_versions v where v.note_id = t.id)::integer,
           verfasser.display_name,
           bearbeiter.display_name,
           finalisierer.display_name
    from public.treatment_notes t
    left join public.user_profiles verfasser    on verfasser.id    = t.created_by
    left join public.user_profiles bearbeiter   on bearbeiter.id   = t.updated_by
    left join public.user_profiles finalisierer on finalisierer.id = t.finalized_by
    where t.appointment_id = p_appointment_id
      and t.organization_id = v_org
    order by (t.addendum_to_note_id is not null), t.created_at;
end;
$$;

comment on function public.get_treatment_note(uuid) is
  'Liefert Haupteintrag und Nachtraege der Behandlungsdokumentation eines Termins samt Art der Finalisierung und Pflichtvermerk aus Hausbesuch-Szenario 1 und protokolliert je Eintrag treatment_note.viewed (DOK-001, DOK-002, DOK-004, CAL-018, ADR-010).';

revoke all on function public.get_treatment_note(uuid) from public, anon;
grant execute on function public.get_treatment_note(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Die Protokollbestaetigung gehoert in die Terminsicht
--
-- Unveraendert aus 20260913100000_event_groups.sql bis auf die eine Spalte.
-- Die Terminseite erklaert den Gebuehrenanlass; dazu muss sie wissen, ob das
-- Protokoll bestaetigt wurde oder ob der Anlass aus einer Zeile stammt, die
-- aelter ist als die Regel.
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
  a.prescription_id,
  a.appointment_type,
  a.kind,
  a.title,
  a.event_group_id,
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
  ) as notification_channels
from public.appointments a
left join public.patients p  on p.id  = a.patient_id
left join public.persons pp  on pp.id = p.person_id
join public.staff_members sm on sm.id = a.staff_member_id
join public.persons sp       on sp.id = sm.person_id
join public.organizations o  on o.id  = a.organization_id
left join public.locations l on l.id = a.location_id;

comment on view public.appointment_directory is
  'Terminsicht fuer die Anwendung, Behandlungen wie Ereignisse. security_invoker: RLS der Basistabellen gilt unveraendert. Enthaelt nur organisatorische Angaben. Die vermerkende Person bleibt aussen vor - Akteure stehen im Auditlog (ADR-010). Seit CAL-017 mit der Gruppenkennung des Ereignisses, seit CAL-018 mit der Protokollbestaetigung des Nichtantreffens.';

revoke all on public.appointment_directory from anon, authenticated;
grant select on public.appointment_directory to authenticated;
