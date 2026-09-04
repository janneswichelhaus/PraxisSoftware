-- =============================================================================
-- Finalisierung, Versionierung und Nachtrag (DOK-002)
--
-- Setzt ADR-016 Punkte 4 bis 6 um. DOK-001 hat die Behandlungsdokumentation
-- bewusst nur als Entwurf gefuehrt und die Nachvollziehbarkeit offen gelassen,
-- weil docs/decisions/OPEN_DECISIONS.md Abschnitt D sie als offen fuehrte.
-- ADR-016 hat sie am 2026-09-01 entschieden. Daraus folgen drei Festlegungen:
--
--   * Finalisierung ist ein ausdruecklicher Schritt (Punkt 4). Sie darf jede
--     therapeutische Rolle vornehmen, nicht nur der Verfasser - Vertretung ist
--     in einer kleinen Praxis der Regelfall (ADR-004).
--   * Nach der Finalisierung erzeugt jede Aenderung eine neue Version, und der
--     Inhalt JEDER frueheren Version bleibt vollstaendig abrufbar (Punkt 5).
--     Das ist 630f Abs. 1 S. 2 und 3 BGB und keine Ermessensfrage: ein
--     Aenderungsprotokoll, das den alten Text ueberschreibt, genuegt nicht.
--   * Eine Ergaenzung ist ein eigener, mit dem Ursprungseintrag verknuepfter
--     Eintrag - keine Aenderung des alten Textes (Punkt 6). Die Aenderung eines
--     finalisierten Eintrags bleibt echten Korrekturen vorbehalten und verlangt
--     eine kurze Begruendung.
--
-- Bewusst NICHT enthalten:
--   * Automatische Finalisierung nach Frist (ADR-016 Punkt 7). Das Projekt hat
--     keinen Scheduler; welcher Mechanismus dafuer zulaessig ist, ist eine
--     eigene Architekturentscheidung und gehoert vor DOK-004, nicht hierhin.
--   * Der rollenabhaengig projizierte Lesepfad in der Akte (DOK-003). Diese
--     Migration erweitert nur den bestehenden Lesepfad am Termin.
--   * Loeschung. ADR-008 erfasst spaeter alle Versionen eines Eintrags; das
--     Datenmodell hier ist darauf vorbereitet (on delete cascade), fuehrt den
--     Vorgang aber nicht ein.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- treatment_notes: zweiter Zustand, Finalisierungsspuren, Nachtragsbezug
-- -----------------------------------------------------------------------------

-- ADR-016 Punkt 2: genau zwei Zustaende. DOK-001 kannte nur 'draft'.
alter table public.treatment_notes drop constraint treatment_notes_status_check;
alter table public.treatment_notes add constraint treatment_notes_status_check
  check (status in ('draft', 'final'));

alter table public.treatment_notes
  add column finalized_at timestamptz,
  add column finalized_by uuid,
  -- Der Nachtrag haengt am Ursprungseintrag. cascade und nicht restrict: eine
  -- Loeschung nach ADR-008 muss den gesamten Eintrag erfassen; ein Nachtrag,
  -- der die Loeschung seines Ursprungs ueberlebt, waere ein Fehler.
  add column addendum_to_note_id uuid references public.treatment_notes (id) on delete cascade;

alter table public.treatment_notes
  add constraint treatment_notes_finalisation_consistent
  check (
    (status = 'final') = (finalized_at is not null)
    and (status = 'final') = (finalized_by is not null)
  );

-- Nachtragsketten sind ausgeschlossen. Ein Nachtrag zum Nachtrag waere genau
-- die lange Kette, die ADR-016 Punkt 6 vermeiden will; die Bedingung dafuer
-- steht in create_treatment_note_addendum, hier steht nur der Selbstbezug.
alter table public.treatment_notes
  add constraint treatment_notes_addendum_not_self
  check (addendum_to_note_id is null or addendum_to_note_id <> id);

comment on column public.treatment_notes.finalized_at is
  'Zeitpunkt der Finalisierung (ADR-016 Punkt 4). Ab hier ist der Eintrag Bestandteil der Akte.';
comment on column public.treatment_notes.finalized_by is
  'auth.users.id der finalisierenden Person. Bewusst ohne FK, damit ein spaeter geloeschter Account die Urheberschaft nicht entfernt.';
comment on column public.treatment_notes.addendum_to_note_id is
  'Gesetzt, wenn dieser Eintrag ein Nachtrag zu einem finalisierten Eintrag ist (ADR-016 Punkt 6). Nachtraege zu Nachtraegen gibt es nicht.';

-- Je Termin genau ein Haupteintrag - Nachtraege sind zusaetzliche Zeilen zu
-- demselben Termin und duerfen die Eindeutigkeit nicht verletzen.
alter table public.treatment_notes drop constraint treatment_notes_one_per_appointment;

create unique index treatment_notes_one_primary_per_appointment
  on public.treatment_notes (appointment_id)
  where addendum_to_note_id is null;

comment on index public.treatment_notes_one_primary_per_appointment is
  'Ein Haupteintrag je Termin (DOK-001). Nachtraege sind davon ausgenommen (DOK-002, ADR-016 Punkt 6).';

create index treatment_notes_addendum_to_note_id_idx
  on public.treatment_notes (addendum_to_note_id);

comment on column public.treatment_notes.status is
  'Lebenszyklus nach ADR-016 Punkt 2: Entwurf oder finalisiert. Ein finalisierter Eintrag wird ausschliesslich ueber revise_treatment_note geaendert.';

-- -----------------------------------------------------------------------------
-- treatment_note_versions
--
-- Der festgeschriebene Stand eines Eintrags. Version 1 entsteht bei der
-- Finalisierung und traegt den Entwurfsstand unveraendert; jede spaetere
-- Korrektur legt eine weitere Version an.
--
-- Der aktuelle Text steht damit doppelt: in treatment_notes.content und in der
-- juengsten Version. Das ist Absicht. treatment_notes.content bleibt der
-- Lesestand fuer den Alltag, die Versionszeile ist unveraenderlich - wuerde der
-- aktuelle Stand nur in der Notiz stehen, waere er der einzige Inhalt ohne
-- eigenen Urheber- und Zeitnachweis.
--
-- Zeilen dieser Tabelle werden NIE geaendert und NIE einzeln geloescht. Es gibt
-- deshalb bewusst kein updated_at.
-- -----------------------------------------------------------------------------
create table public.treatment_note_versions (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  note_id         uuid not null references public.treatment_notes (id) on delete cascade,

  -- Fortlaufend je Eintrag, beginnend bei 1.
  version_no      integer not null check (version_no >= 1),

  content         text not null
                    check (length(btrim(content, E' \t\r\n')) between 1 and 20000),

  -- Kurze Begruendung der Korrektur (ADR-016 Punkt 6). Version 1 hat keine -
  -- sie ist keine Korrektur, sondern der festgeschriebene Entwurfsstand.
  change_reason   text
                    check (change_reason is null
                           or length(btrim(change_reason, E' \t\r\n')) between 1 and 500),

  recorded_at     timestamptz not null default now(),
  author_id       uuid not null,

  constraint treatment_note_versions_unique unique (note_id, version_no),
  constraint treatment_note_versions_reason_only_on_correction
    check ((version_no = 1) = (change_reason is null))
);

comment on table public.treatment_note_versions is
  'Festgeschriebene Staende einer Behandlungsdokumentation (ADR-016 Punkt 5, 630f Abs. 1 BGB). Enthaelt klinischen Freitext. Datenklasse: klinische Patientenakte, 10 Jahre nach Behandlungsabschluss (ADR-008).';
comment on column public.treatment_note_versions.content is
  'Klinischer Freitext dieser Version. Darf NIEMALS in Betriebslogs oder in den Auditkontext gelangen (ADR-010, ADR-011).';
comment on column public.treatment_note_versions.change_reason is
  'Begruendung der Korrektur. Kann klinische Angaben enthalten und wird deshalb wie Inhalt behandelt - insbesondere niemals im Auditlog.';
comment on column public.treatment_note_versions.author_id is
  'auth.users.id der Person, von der der Text dieser Version stammt (ADR-016 Punkt 1). Bei Version 1 ist das die zuletzt am Entwurf schreibende Person, nicht zwingend die finalisierende.';
comment on column public.treatment_note_versions.recorded_at is
  'Zeitpunkt, zu dem dieser Stand festgeschrieben wurde - bei Version 1 die Finalisierung, sonst die Korrektur.';

create index treatment_note_versions_organization_id_idx
  on public.treatment_note_versions (organization_id);

-- Deny-by-default wie bei treatment_notes: RLS aktiv, keine Policy, kein
-- Tabellenrecht. Gelesen wird ausschliesslich ueber
-- get_treatment_note_versions, und die Funktion protokolliert den Zugriff
-- (ADR-004, ADR-010).
alter table public.treatment_note_versions enable row level security;

revoke all on public.treatment_note_versions from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Ereigniskatalog erweitern (ADR-010)
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
    'appointment.created',
    'appointment.updated',
    'appointment.rescheduled',
    'appointment.cancelled',
    'appointment.completed',
    'appointment.reopened',
    'organization.appointment_grid_changed',
    'staff_working_hours.created',
    'staff_working_hours.updated',
    'staff_working_hours.removed',
    'staff_working_hour_exception.created',
    'staff_working_hour_exception.updated',
    'staff_working_hour_exception.removed',
    'treatment_note.created',
    'treatment_note.updated',
    'treatment_note.viewed',
    'treatment_note.finalized',
    'treatment_note.revised',
    'treatment_note.addendum_created',
    'treatment_note.history_viewed'
  ));

-- -----------------------------------------------------------------------------
-- update_treatment_note: der Entwurfsweg wird gegen finalisierte Eintraege
-- verschlossen
--
-- DOK-001 hat die Statuspruefung ausdruecklich offen gelassen, solange die
-- Aufzaehlung nur 'draft' kannte. Ab hier ist sie erreichbar und
-- sicherheitsrelevant: ohne sie liesse sich ein finalisierter Eintrag ohne
-- Version und ohne Begruendung ueberschreiben - genau das, was
-- PROJECT_PRINCIPLES.md 5 ausschliesst.
-- -----------------------------------------------------------------------------
create or replace function public.update_treatment_note(
  p_note_id             uuid,
  p_expected_updated_at timestamptz,
  p_content             text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid;
  v_org     uuid;
  v_inhalt  text;
  v_alt     record;
  v_patient uuid;
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

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  v_inhalt := btrim(coalesce(p_content, ''), E' \t\r\n');

  if v_inhalt = '' then
    raise exception 'documentation must not be empty' using errcode = '22023';
  end if;

  if length(v_inhalt) > 20000 then
    raise exception 'documentation is too long' using errcode = '22023';
  end if;

  select t.id, t.appointment_id, t.content, t.updated_at, t.status
    into v_alt
  from public.treatment_notes t
  where t.id = p_note_id
    and t.organization_id = v_org
  for update;

  if not found then
    raise exception 'treatment note not found' using errcode = 'P0002';
  end if;

  if v_alt.status <> 'draft' then
    raise exception 'finalized treatment note requires a revision' using errcode = '22023';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'treatment note was changed meanwhile' using errcode = '40001';
  end if;

  if v_alt.content = v_inhalt then
    return p_note_id;
  end if;

  update public.treatment_notes
     set content    = v_inhalt,
         updated_at = now(),
         updated_by = v_actor
   where id = p_note_id
     and updated_at = p_expected_updated_at;

  if not found then
    raise exception 'treatment note was changed meanwhile' using errcode = '40001';
  end if;

  select a.patient_id into v_patient
  from public.appointments a
  where a.id = v_alt.appointment_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'treatment_note.updated', 'treatment_note', p_note_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'appointment_id', v_alt.appointment_id,
      'patient_id', v_patient
    )
  );

  return p_note_id;
end;
$$;

comment on function public.update_treatment_note(uuid, timestamptz, text) is
  'Aendert den Entwurf einer Behandlungsdokumentation auf Basis eines erwarteten Standes und protokolliert treatment_note.updated (DOK-001, ADR-001, ADR-010). Fuer finalisierte Eintraege gilt revise_treatment_note (DOK-002).';

-- -----------------------------------------------------------------------------
-- finalize_treatment_note
--
-- ADR-016 Punkt 4: ausdruecklicher Schritt, jede therapeutische Rolle darf ihn
-- vornehmen. Der Entwurfsstand wird dabei unveraendert zur Version 1
-- (ADR-016 Punkt 7 beschreibt dieselbe Wirkung fuer den spaeteren automatischen
-- Weg; die Regel ist hier bewusst dieselbe).
--
-- p_expected_updated_at ist derselbe Stand wie beim Aendern: wer auf einem
-- veralteten Text finalisiert, wuerde einen fremden Zwischenstand
-- festschreiben. Das ist genau der Fall, den ADR-001 Punkt 5 ausschliesst.
-- -----------------------------------------------------------------------------
create or replace function public.finalize_treatment_note(
  p_note_id             uuid,
  p_expected_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid;
  v_org     uuid;
  v_note    record;
  v_patient uuid;
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

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  select t.id, t.appointment_id, t.content, t.status, t.updated_at, t.updated_by
    into v_note
  from public.treatment_notes t
  where t.id = p_note_id
    and t.organization_id = v_org
  for update;

  if not found then
    raise exception 'treatment note not found' using errcode = 'P0002';
  end if;

  if v_note.status = 'final' then
    raise exception 'treatment note is already final' using errcode = '22023';
  end if;

  if v_note.updated_at is distinct from p_expected_updated_at then
    raise exception 'treatment note was changed meanwhile' using errcode = '40001';
  end if;

  update public.treatment_notes
     set status      = 'final',
         finalized_at = now(),
         finalized_by = v_actor,
         updated_at   = now(),
         updated_by   = v_actor
   where id = p_note_id
     and updated_at = p_expected_updated_at;

  if not found then
    raise exception 'treatment note was changed meanwhile' using errcode = '40001';
  end if;

  -- Urheber der Version 1 ist die Person, von der der Text stammt - nicht
  -- zwingend die finalisierende (ADR-016 Punkt 1). Wer finalisiert hat, steht
  -- in finalized_by und im Auditeintrag.
  insert into public.treatment_note_versions (
    organization_id, note_id, version_no, content, change_reason, author_id
  )
  values (
    v_org, p_note_id, 1, v_note.content, null, v_note.updated_by
  );

  select a.patient_id into v_patient
  from public.appointments a
  where a.id = v_note.appointment_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'treatment_note.finalized', 'treatment_note', p_note_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'appointment_id', v_note.appointment_id,
      'patient_id', v_patient
    )
  );

  return p_note_id;
end;
$$;

comment on function public.finalize_treatment_note(uuid, timestamptz) is
  'Finalisiert eine Behandlungsdokumentation, schreibt den Stand als Version 1 fest und protokolliert treatment_note.finalized (DOK-002, ADR-016 Punkt 4).';

revoke all on function public.finalize_treatment_note(uuid, timestamptz) from public, anon;
grant execute on function public.finalize_treatment_note(uuid, timestamptz) to authenticated;

-- -----------------------------------------------------------------------------
-- revise_treatment_note
--
-- ADR-016 Punkt 5 und 6: Korrektur eines finalisierten Eintrags. Erzeugt eine
-- neue Version, ueberschreibt nichts und verlangt eine Begruendung.
--
-- Die Begruendung landet ausdruecklich NICHT im Auditlog: sie kann klinische
-- Angaben enthalten und wird deshalb wie Inhalt behandelt (ADR-010, ADR-011).
-- -----------------------------------------------------------------------------
create or replace function public.revise_treatment_note(
  p_note_id             uuid,
  p_expected_updated_at timestamptz,
  p_content             text,
  p_reason              text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor     uuid;
  v_org       uuid;
  v_inhalt    text;
  v_grund     text;
  v_alt       record;
  v_patient   uuid;
  v_version   integer;
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

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  v_inhalt := btrim(coalesce(p_content, ''), E' \t\r\n');

  if v_inhalt = '' then
    raise exception 'documentation must not be empty' using errcode = '22023';
  end if;

  if length(v_inhalt) > 20000 then
    raise exception 'documentation is too long' using errcode = '22023';
  end if;

  v_grund := btrim(coalesce(p_reason, ''), E' \t\r\n');

  if v_grund = '' then
    raise exception 'change reason is required' using errcode = '22023';
  end if;

  if length(v_grund) > 500 then
    raise exception 'change reason is too long' using errcode = '22023';
  end if;

  select t.id, t.appointment_id, t.content, t.status, t.updated_at
    into v_alt
  from public.treatment_notes t
  where t.id = p_note_id
    and t.organization_id = v_org
  for update;

  if not found then
    raise exception 'treatment note not found' using errcode = 'P0002';
  end if;

  if v_alt.status <> 'final' then
    raise exception 'treatment note is not final' using errcode = '22023';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'treatment note was changed meanwhile' using errcode = '40001';
  end if;

  -- Eine Korrektur ohne Aenderung ist keine Korrektur. Sie waere eine Version
  -- ohne Aussage und wuerde den Verlauf verwaessern, den ADR-016 lesbar halten
  -- will.
  if v_alt.content = v_inhalt then
    raise exception 'documentation is unchanged' using errcode = '22023';
  end if;

  select coalesce(max(v.version_no), 0) + 1
    into v_version
  from public.treatment_note_versions v
  where v.note_id = p_note_id;

  insert into public.treatment_note_versions (
    organization_id, note_id, version_no, content, change_reason, author_id
  )
  values (
    v_org, p_note_id, v_version, v_inhalt, v_grund, v_actor
  );

  update public.treatment_notes
     set content    = v_inhalt,
         updated_at = now(),
         updated_by = v_actor
   where id = p_note_id
     and updated_at = p_expected_updated_at;

  if not found then
    raise exception 'treatment note was changed meanwhile' using errcode = '40001';
  end if;

  select a.patient_id into v_patient
  from public.appointments a
  where a.id = v_alt.appointment_id;

  -- Nur Metadaten: weder Text noch Begruendung (ADR-010, ADR-011). Die
  -- Versionsnummer ist eine Ordnungszahl und kein Behandlungsinhalt.
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'treatment_note.revised', 'treatment_note', p_note_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'appointment_id', v_alt.appointment_id,
      'patient_id', v_patient,
      'version_no', v_version
    )
  );

  return p_note_id;
end;
$$;

comment on function public.revise_treatment_note(uuid, timestamptz, text, text) is
  'Korrigiert eine finalisierte Behandlungsdokumentation als neue Version mit Begruendung und protokolliert treatment_note.revised (DOK-002, ADR-016 Punkt 5 und 6).';

revoke all on function public.revise_treatment_note(uuid, timestamptz, text, text) from public, anon;
grant execute on function public.revise_treatment_note(uuid, timestamptz, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- create_treatment_note_addendum
--
-- ADR-016 Punkt 6: die Ergaenzung ist der Regelfall und wird als eigener,
-- verknuepfter Eintrag gefuehrt. Sie beginnt als Entwurf und durchlaeuft
-- denselben Lebenszyklus wie der Ursprungseintrag - andernfalls entstuende
-- klinischer Text, der nie finalisiert wird.
--
-- Ein Nachtrag setzt einen finalisierten Ursprung voraus. Solange der Eintrag
-- Entwurf ist, gibt es nichts nachzutragen; dann wird er schlicht bearbeitet.
-- -----------------------------------------------------------------------------
create or replace function public.create_treatment_note_addendum(
  p_parent_note_id uuid,
  p_content        text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid;
  v_org      uuid;
  v_inhalt   text;
  v_eltern   record;
  v_patient  uuid;
  v_nachtrag uuid;
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

  select t.id, t.appointment_id, t.status, t.addendum_to_note_id
    into v_eltern
  from public.treatment_notes t
  where t.id = p_parent_note_id
    and t.organization_id = v_org
  for update;

  if not found then
    raise exception 'treatment note not found' using errcode = 'P0002';
  end if;

  if v_eltern.addendum_to_note_id is not null then
    raise exception 'addendum cannot be extended' using errcode = '22023';
  end if;

  if v_eltern.status <> 'final' then
    raise exception 'treatment note is not final' using errcode = '22023';
  end if;

  insert into public.treatment_notes (
    organization_id, appointment_id, addendum_to_note_id, status, content, created_by, updated_by
  )
  values (
    v_org, v_eltern.appointment_id, p_parent_note_id, 'draft', v_inhalt, v_actor, v_actor
  )
  returning id into v_nachtrag;

  select a.patient_id into v_patient
  from public.appointments a
  where a.id = v_eltern.appointment_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'treatment_note.addendum_created', 'treatment_note', v_nachtrag, 'success',
    jsonb_build_object(
      'surface', 'web',
      'appointment_id', v_eltern.appointment_id,
      'patient_id', v_patient,
      'parent_note_id', p_parent_note_id
    )
  );

  return v_nachtrag;
end;
$$;

comment on function public.create_treatment_note_addendum(uuid, text) is
  'Legt einen Nachtrag zu einem finalisierten Eintrag als eigenen Entwurf an und protokolliert treatment_note.addendum_created (DOK-002, ADR-016 Punkt 6).';

revoke all on function public.create_treatment_note_addendum(uuid, text) from public, anon;
grant execute on function public.create_treatment_note_addendum(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- get_treatment_note: liefert jetzt den Haupteintrag und seine Nachtraege
--
-- Der Rueckgabetyp aendert sich, deshalb muss die Funktion abgeraeumt und neu
-- angelegt werden; create or replace kann das nicht.
--
-- Wie in DOK-001 ist die Funktion absichtlich schreibend: sie liefert
-- klinischen Freitext und protokolliert denselben Vorgang in derselben
-- Transaktion. Neu ist, dass mehrere Eintraege zurueckkommen koennen - dann
-- entsteht je gelesenem Eintrag ein Auditeintrag. Ein Sammeleintrag wuerde
-- verschweigen, welche Inhalte tatsaechlich offengelegt wurden (ADR-010).
-- -----------------------------------------------------------------------------
drop function public.get_treatment_note(uuid);

create function public.get_treatment_note(p_appointment_id uuid)
returns table (
  id                  uuid,
  appointment_id      uuid,
  addendum_to_note_id uuid,
  status              text,
  content             text,
  created_at          timestamptz,
  updated_at          timestamptz,
  finalized_at        timestamptz,
  version_count       integer,
  author_name         text,
  last_editor_name    text,
  finalized_by_name   text
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

  -- Ein unbekannter und ein fremder Termin liefern dasselbe leere Ergebnis und
  -- taugen damit nicht als Existenz-Orakel.
  select a.patient_id into v_patient
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org;

  if not found then
    return;
  end if;

  -- Gibt es keine Dokumentation, entsteht kein Auditeintrag: es wurde nichts
  -- gelesen.
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
           t.created_at,
           t.updated_at,
           t.finalized_at,
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
    -- Haupteintrag zuerst, Nachtraege in ihrer Entstehungsreihenfolge.
    order by (t.addendum_to_note_id is not null), t.created_at;
end;
$$;

comment on function public.get_treatment_note(uuid) is
  'Liefert Haupteintrag und Nachtraege der Behandlungsdokumentation eines Termins und protokolliert je Eintrag treatment_note.viewed (DOK-001, DOK-002, ADR-010). Einziger Lesepfad auf klinischen Freitext am Termin.';

revoke all on function public.get_treatment_note(uuid) from public, anon;
grant execute on function public.get_treatment_note(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- get_treatment_note_versions
--
-- Der Versionsverlauf unterliegt derselben rollenabhaengigen Projektion wie der
-- Eintrag selbst (ADR-016 Punkt 8) und derselben Protokollpflicht (Punkt 9).
-- Deshalb dieselbe Rollenpruefung wie beim Lesen und ein eigener Auditeintrag:
-- der Verlauf legt mehr offen als der aktuelle Stand.
-- -----------------------------------------------------------------------------
create or replace function public.get_treatment_note_versions(p_note_id uuid)
returns table (
  version_no    integer,
  content       text,
  change_reason text,
  recorded_at   timestamptz,
  author_name   text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid;
  v_org     uuid;
  v_note    record;
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

  select t.id, t.appointment_id
    into v_note
  from public.treatment_notes t
  where t.id = p_note_id
    and t.organization_id = v_org;

  if not found then
    return;
  end if;

  select a.patient_id into v_patient
  from public.appointments a
  where a.id = v_note.appointment_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'treatment_note.history_viewed', 'treatment_note', p_note_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'appointment_id', v_note.appointment_id,
      'patient_id', v_patient
    )
  );

  return query
    select v.version_no,
           v.content,
           v.change_reason,
           v.recorded_at,
           urheber.display_name
    from public.treatment_note_versions v
    left join public.user_profiles urheber on urheber.id = v.author_id
    where v.note_id = p_note_id
    order by v.version_no;
end;
$$;

comment on function public.get_treatment_note_versions(uuid) is
  'Liefert den Versionsverlauf einer Behandlungsdokumentation und protokolliert treatment_note.history_viewed (DOK-002, ADR-016 Punkt 5, 8 und 9).';

revoke all on function public.get_treatment_note_versions(uuid) from public, anon;
grant execute on function public.get_treatment_note_versions(uuid) to authenticated;
