-- =============================================================================
-- Behandlungsdokumentation zum Termin, Entwurfsstand (DOK-001)
--
-- Das ist der erste klinische Freitext im System. Bisher enthielt keine Tabelle
-- Behandlungsinhalte - Termine sind ausdruecklich organisatorisch
-- (PROJECT_PRINCIPLES.md 4.6). Daraus folgen vier Festlegungen, die von den
-- bisherigen Fachvorgaengen abweichen:
--
--   * Kein Lesepfad an der Protokollierung vorbei. ADR-010 verlangt, dass der
--     Zugriff auf klinische Dokumente auditierbar ist. Waere die Tabelle oder
--     eine Sicht darauf direkt lesbar, waere der Auditeintrag eine Zusicherung
--     des Clients. Deshalb: RLS aktiv, KEINE Policy, KEIN Grant - gelesen wird
--     ausschliesslich ueber get_treatment_note, und die Funktion schreibt den
--     Auditeintrag in derselben Transaktion. Dasselbe Muster wie audit_log.
--   * Office bleibt aussen vor. 4.3 ist eindeutig: kein Zugriff auf klinischen
--     Freitext. Der datensparsame Behandlungsnachweis nach 4.4 ist ein eigener
--     Vorgang mit eigener Projektion und nicht Gegenstand dieser Migration.
--   * Schreiben ist ein therapeutischer Vorgang. 4.2 nennt das Erstellen von
--     Dokumentationen als Recht der Therapeut:innen; owner darf nach 4.1 lesen,
--     schreibt aber nicht ohne therapeutische Rolle.
--   * Kein stilles Ueberschreiben. ADR-001 Punkt 5 verbietet Last-Write-Wins
--     fuer klinische Dokumentation; jeder Schreibvorgang traegt deshalb den
--     Stand mit, auf dem er beruht.
--
-- Bewusst NICHT enthalten:
--   * Finalisierung. Sie ist ein eigener Vorgang (DOK-002); erst dort greift
--     der Schutz gegen unbemerktes Ueberschreiben aus PROJECT_PRINCIPLES.md 5.
--     Der Status kennt deshalb heute genau einen Wert.
--   * Versionierung. Ob Nachvollziehbarkeit ueber abrufbare Vorversionen oder
--     ueber ein Aenderungsprotokoll hergestellt wird, ist in
--     docs/decisions/OPEN_DECISIONS.md Abschnitt D ausdruecklich offen. Diese
--     Migration entscheidet das nicht: sie fuehrt Autor, Erstellungszeitpunkt
--     und Zeitpunkt der letzten Aenderung, und jede Aenderung erzeugt einen
--     Auditeintrag. Eine Versionstabelle waere die Vorwegnahme der offenen
--     Entscheidung.
--   * Anhaenge. Dateiablage ist offener Punkt E8 (Ablageort, Zugriffsregeln,
--     signierte URLs, Retention). Eine Anhangstabelle kommt spaeter additiv
--     hinzu; das Modell hier verbaut sie nicht.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- treatment_notes
--
-- Genau eine Dokumentation je Termin. Der Bezug zum Patienten steht bewusst
-- NICHT als eigene Spalte hier: er ergibt sich eindeutig aus dem Termin. Eine
-- zweite Quelle koennte abweichen, und eine falsch zugeordnete Dokumentation
-- ist genau der Fehler, den PROJECT_PRINCIPLES.md 13 ausschliesst.
-- -----------------------------------------------------------------------------
create table public.treatment_notes (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  appointment_id  uuid not null references public.appointments (id)  on delete restrict,

  -- Heute nur 'draft'. Der Lebenszyklus aus ADR-001 - Entwurf gegenueber
  -- finalisierter Dokumentation - wird damit im Datenmodell benannt und nicht
  -- erst in der Oberflaeche behauptet. DOK-002 erweitert die Aufzaehlung.
  status          text not null default 'draft' check (status in ('draft')),

  -- btrim ohne Zeichenmenge entfernt ausschliesslich Leerzeichen. Ein Entwurf
  -- aus lauter Zeilenumbruechen waere damit "nicht leer" - deshalb steht die
  -- Zeichenmenge hier ausdruecklich, und die Funktionen unten schneiden mit
  -- derselben.
  content         text not null
                    check (length(btrim(content, E' \t\r\n')) between 1 and 20000),

  created_at      timestamptz not null default now(),
  created_by      uuid not null,
  updated_at      timestamptz not null default now(),
  updated_by      uuid not null,

  constraint treatment_notes_one_per_appointment unique (appointment_id)
);

comment on table public.treatment_notes is
  'Behandlungsdokumentation zu einem Termin. Enthaelt klinischen Freitext. Datenklasse: klinische Patientenakte, 10 Jahre nach Behandlungsabschluss (ADR-008).';
comment on column public.treatment_notes.status is
  'Lebenszyklus nach ADR-001. In diesem Stand ausschliesslich Entwurf; die Finalisierung ist ein eigener serverseitiger Vorgang (DOK-002).';
comment on column public.treatment_notes.content is
  'Klinischer Freitext. Darf NIEMALS in Betriebslogs oder in den Auditkontext gelangen (ADR-010, ADR-011).';
comment on column public.treatment_notes.created_by is
  'auth.users.id der verfassenden Person (PROJECT_PRINCIPLES.md 5). Bewusst ohne FK, damit ein spaeter geloeschter Account die Urheberschaft nicht entfernt.';
comment on column public.treatment_notes.updated_by is
  'auth.users.id der zuletzt aendernden Person (PROJECT_PRINCIPLES.md 5).';
comment on constraint treatment_notes_one_per_appointment on public.treatment_notes is
  'Eine Behandlungsdokumentation je Termin. Zwei parallele Anlagen koennen nicht beide erfolgreich sein (DOK-001).';

create index treatment_notes_organization_id_idx on public.treatment_notes (organization_id);

-- -----------------------------------------------------------------------------
-- Rechte und RLS
--
-- Deny-by-default ohne Ausnahme: RLS ist aktiv, es gibt keine Policy und kein
-- Tabellenrecht fuer anon oder authenticated. Damit fuehrt kein Weg an den
-- Funktionen unten vorbei - insbesondere kein direkter PostgREST-Zugriff auf
-- die Tabelle (ADR-004, ADR-010).
-- -----------------------------------------------------------------------------
alter table public.treatment_notes enable row level security;

revoke all on public.treatment_notes from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Wer darf lesen, wer darf schreiben
--
-- Zwei getrennte Funktionen, weil es zwei verschiedene fachliche Rechte sind:
-- die Praxisleitung sieht die Akte (4.1), dokumentiert aber nicht ohne
-- therapeutische Rolle. Fuer 'office' und 'patient' gibt es hier bewusst
-- keinen Weg (4.3, 4.6).
-- -----------------------------------------------------------------------------
create or replace function app.can_read_treatment_note()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead')
$$;

create or replace function app.can_write_treatment_note()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('therapist', 'team_lead')
$$;

comment on function app.can_read_treatment_note() is
  'Rollen mit Lesezugriff auf klinische Behandlungsdokumentation (PROJECT_PRINCIPLES.md 4.1, 4.2). Office ist ausgeschlossen (4.3).';
comment on function app.can_write_treatment_note() is
  'Therapeutische Rollen. Dokumentieren ist ein Behandlungsschritt, kein Verwaltungsvorgang (PROJECT_PRINCIPLES.md 4.2).';

grant execute on function app.can_read_treatment_note()  to authenticated;
grant execute on function app.can_write_treatment_note() to authenticated;

-- -----------------------------------------------------------------------------
-- Ereigniskatalog erweitern (ADR-010)
--
-- ADR-010 nennt sowohl den Zugriff auf klinische Dokumente als auch die
-- Erstellung und Aenderung klinischer Dokumentation als auditpflichtig.
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
    'treatment_note.viewed'
  ));

alter table public.audit_log drop constraint audit_log_subject_type_check;
alter table public.audit_log add constraint audit_log_subject_type_check
  check (subject_type in (
    'patient',
    'organization',
    'appointment',
    'staff_working_hours',
    'staff_working_hour_exception',
    'treatment_note'
  ));

-- -----------------------------------------------------------------------------
-- create_treatment_note
--
-- Der Termin wird gesperrt gelesen. Ohne die Sperre koennte zwischen der
-- Statuspruefung und dem Einfuegen eine Absage committen, und die Dokumentation
-- haenge an einem abgesagten Termin.
-- -----------------------------------------------------------------------------
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

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft.
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

  -- Termin ausschliesslich in der eigenen Organisation suchen. Eine fremde und
  -- eine unbekannte ID erzeugen dieselbe Meldung und taugen nicht als
  -- Existenz-Orakel (PROJECT_PRINCIPLES.md 13).
  select a.id, a.patient_id, a.status
    into v_termin
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  -- Eine Absage sagt aus, dass die Behandlung NICHT stattgefunden hat. Geplante
  -- und abgeschlossene Termine sind dokumentierbar - der laufende Hausbesuch
  -- ist der Regelfall und noch nicht abgeschlossen.
  if v_termin.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be documented' using errcode = '22023';
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
      -- Zwei gleichzeitige Anlagen: die Constraint entscheidet, nicht eine
      -- vorherige Abfrage.
      raise exception 'treatment note already exists' using errcode = '23505';
  end;

  -- Auditeintrag ohne jeden klinischen Inhalt: nur Akteur, Organisation,
  -- Bezuege, Zeitpunkt und Ergebnis (ADR-010, ADR-011).
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

comment on function public.create_treatment_note(uuid, text) is
  'Legt die Behandlungsdokumentation eines Termins als Entwurf an und protokolliert treatment_note.created (DOK-001, ADR-010).';

revoke all on function public.create_treatment_note(uuid, text) from public, anon;
grant execute on function public.create_treatment_note(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- update_treatment_note
--
-- p_expected_updated_at ist der Stand, auf dem die Bearbeitung beruht. Wer auf
-- einem veralteten Stand speichert, wird abgewiesen - klinische Dokumentation
-- wird niemals still ueberschrieben (ADR-001 Punkt 5,
-- PROJECT_PRINCIPLES.md 13). Der abgewiesene Text bleibt in der Oberflaeche
-- stehen und geht nicht verloren.
--
-- Eine Statuspruefung fehlt hier bewusst: solange die Aufzaehlung nur 'draft'
-- kennt, waere sie unerreichbarer Code. DOK-002 fuegt sie mit dem Status
-- 'final' zusammen ein - eine finalisierte Dokumentation darf diesen Weg NICHT
-- nehmen.
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

  -- FOR UPDATE ist nicht optional: ohne die Sperre laese eine zweite
  -- Transaktion unter READ COMMITTED den Stand VOR dem Commit der ersten,
  -- fande ihren erwarteten Wert bestaetigt und wuerde die fremde Aenderung
  -- anschliessend ueberschreiben.
  select t.id, t.appointment_id, t.content, t.updated_at
    into v_alt
  from public.treatment_notes t
  where t.id = p_note_id
    and t.organization_id = v_org
  for update;

  if not found then
    raise exception 'treatment note not found' using errcode = 'P0002';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'treatment note was changed meanwhile' using errcode = '40001';
  end if;

  -- Speichern ohne tatsaechliche Aenderung ist kein Vorgang: weder
  -- Schreibzugriff noch Auditeintrag.
  if v_alt.content = v_inhalt then
    return p_note_id;
  end if;

  update public.treatment_notes
     set content    = v_inhalt,
         updated_at = now(),
         updated_by = v_actor
   -- Der erwartete Stand steht zusaetzlich in der Bedingung: zweite
   -- Verteidigungslinie neben der Sperre oben.
   where id = p_note_id
     and updated_at = p_expected_updated_at;

  if not found then
    raise exception 'treatment note was changed meanwhile' using errcode = '40001';
  end if;

  select a.patient_id into v_patient
  from public.appointments a
  where a.id = v_alt.appointment_id;

  -- Weder alter noch neuer Text, auch keine Laenge: das Auditlog wird keine
  -- Zweitkopie der Akte (ADR-010).
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
  'Aendert den Entwurf einer Behandlungsdokumentation auf Basis eines erwarteten Standes und protokolliert treatment_note.updated (DOK-001, ADR-001, ADR-010).';

revoke all on function public.update_treatment_note(uuid, timestamptz, text) from public, anon;
grant execute on function public.update_treatment_note(uuid, timestamptz, text) to authenticated;

-- -----------------------------------------------------------------------------
-- get_treatment_note
--
-- Der einzige Lesepfad. Die Funktion ist absichtlich schreibend: sie liefert
-- klinischen Freitext und protokolliert denselben Vorgang in derselben
-- Transaktion. Ein Lesezugriff ohne Auditeintrag ist damit nicht moeglich
-- (ADR-010: 'Zugriff auf klinische Dokumente').
--
-- Existiert keine Dokumentation, entsteht kein Auditeintrag - es wurde nichts
-- gelesen. Ein unbekannter oder fremder Termin liefert dasselbe leere Ergebnis
-- und taugt damit nicht als Existenz-Orakel.
--
-- Geliefert wird die kleinstmoegliche Projektion (ADR-004): Inhalt, Zustand,
-- Zeitpunkte und die Anzeigenamen von Verfasser und letzter bearbeitender
-- Person. Die Namen sind fuer PROJECT_PRINCIPLES.md 5 erforderlich; ohne sie
-- waere die Urheberschaft nur im Auditlog sichtbar, das ausschliesslich der
-- Praxisleitung offensteht.
-- -----------------------------------------------------------------------------
create or replace function public.get_treatment_note(p_appointment_id uuid)
returns table (
  id               uuid,
  appointment_id   uuid,
  status           text,
  content          text,
  created_at       timestamptz,
  updated_at       timestamptz,
  author_name      text,
  last_editor_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid;
  v_org     uuid;
  v_note    uuid;
  v_termin  uuid;
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
    into v_note, v_termin
  from public.treatment_notes t
  where t.appointment_id = p_appointment_id
    and t.organization_id = v_org;

  if not found then
    return;
  end if;

  select a.patient_id into v_patient
  from public.appointments a
  where a.id = v_termin;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'treatment_note.viewed', 'treatment_note', v_note, 'success',
    jsonb_build_object(
      'surface', 'web',
      'appointment_id', v_termin,
      'patient_id', v_patient
    )
  );

  return query
    select t.id,
           t.appointment_id,
           t.status,
           t.content,
           t.created_at,
           t.updated_at,
           verfasser.display_name,
           bearbeiter.display_name
    from public.treatment_notes t
    left join public.user_profiles verfasser  on verfasser.id  = t.created_by
    left join public.user_profiles bearbeiter on bearbeiter.id = t.updated_by
    where t.id = v_note;
end;
$$;

comment on function public.get_treatment_note(uuid) is
  'Liefert die Behandlungsdokumentation eines Termins und protokolliert treatment_note.viewed (DOK-001, ADR-010). Einziger Lesepfad auf klinischen Freitext.';

revoke all on function public.get_treatment_note(uuid) from public, anon;
grant execute on function public.get_treatment_note(uuid) to authenticated;
