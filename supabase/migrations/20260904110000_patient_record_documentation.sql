-- =============================================================================
-- Dokumentation in der Akte, rollenabhaengig projiziert (DOK-003)
--
-- DOK-001 und DOK-002 lesen die Behandlungsdokumentation ausschliesslich am
-- einzelnen Termin. Die Akte selbst zeigte bisher nur Stammdaten. Diese
-- Migration fuehrt den Lesepfad in der Akte ein - chronologisch ueber alle
-- Termine eines Patienten - und setzt dabei ADR-004 woertlich um:
--
--   * "Antworten der Anwendung sind rollenabhaengige Projektionen." Es gibt
--     deshalb ZWEI Funktionen mit ZWEI Rueckgabetypen, nicht eine Funktion mit
--     genullten Spalten:
--       - list_patient_treatment_evidence: der datensparsame
--         Behandlungsnachweis nach PROJECT_PRINCIPLES.md 4.4 - Termin, Datum,
--         behandelnde Person, Terminstatus und Dokumentationsstand. Ohne
--         jeden klinischen Inhalt, ohne Verfassernamen, ohne Versionen.
--       - list_patient_treatment_notes (DOK-003, zweite Story): die
--         klinische Sicht mit Inhalt fuer owner, therapist und team_lead.
--   * "Der Behandlungsnachweis ist eine eigene Sicht mit eigenem Datenumfang,
--     kein gefilterter Auszug der klinischen Dokumentation." Der Nachweis
--     liest deshalb nur Status und Finalisierungszeitpunkt des Haupteintrags
--     und beruehrt die Spalte content an keiner Stelle.
--
-- Beide Sichten teilen sich die Seitenregel in app.patient_record_page: welche
-- Termine zur Akte gehoeren, in welcher Reihenfolge und wie geblaettert wird,
-- steht an genau einer Stelle. Eine Abweichung zwischen den Sichten waere
-- sonst genau die Art Fehler, die niemandem auffaellt.
--
-- Bewusst NICHT enthalten:
--   * Schreiben aus der Akte heraus. Anlegen, Bearbeiten, Finalisieren,
--     Korrigieren und Nachtragen bleiben am Termin (DOK-001, DOK-002).
--   * "Erbrachte Leistung" im Nachweis (4.4). Es gibt noch keine
--     Leistungserfassung; ob Leistungsziffern organisatorisch oder klinisch
--     sind, ist Punkt C1 in docs/decisions/OPEN_DECISIONS.md und bleibt offen
--     (ANN-006).
--   * Der fallbezogene, zeitlich begrenzte Office-Zugriff auf vollstaendige
--     Dokumentation (4.4 Absatz 3). Er braucht ein Freigabekonzept und ist ein
--     eigenes Epic.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Wer darf den Behandlungsnachweis lesen
--
-- Alle vier Praxisrollen. Fuer office ist das der einzige Blick auf den
-- Dokumentationsstand (4.3, 4.4); die klinischen Rollen sehen ohnehin mehr.
-- Patientenkonten bekommen in diesem Stand keinen Zugriff (4.6).
--
-- ANN-006: Umfang des Behandlungsnachweises, siehe docs/decisions/ASSUMPTIONS.md.
-- Diese Funktion und die Spaltenliste von list_patient_treatment_evidence sind
-- die beiden Stellen, an denen die Annahme greift.
-- -----------------------------------------------------------------------------
create or replace function app.can_read_treatment_evidence()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead', 'office')
$$;

comment on function app.can_read_treatment_evidence() is
  'Rollen mit Zugriff auf den datensparsamen Behandlungsnachweis in der Akte (PROJECT_PRINCIPLES.md 4.4, ANN-006). Office eingeschlossen, Patientenkonten nicht.';

grant execute on function app.can_read_treatment_evidence() to authenticated;

-- -----------------------------------------------------------------------------
-- Seitenregel der Akte
--
-- Zur Akte gehoeren die Termine des Patienten, die bereits begonnen haben,
-- sowie jeder Termin mit vorhandener Dokumentation - ein dokumentierter
-- Termin gehoert in die Akte, auch wenn er (etwa beim laufenden Hausbesuch)
-- noch in der Zukunft liegt. Abgesagte Termine bleiben enthalten: fuer den
-- organisatorischen Streitfall (4.4) zaehlt gerade, dass ein Termin abgesagt
-- war. Rein zukuenftige, undokumentierte Termine gehoeren in den Kalender.
--
-- Neueste zuerst, geblaettert ueber einen Keyset-Cursor (starts_at, id): ein
-- Offset wuerde bei einem zwischenzeitlich verschobenen Termin Zeilen doppelt
-- oder gar nicht liefern. Die Obergrenze von 50 begrenzt, wie viel klinischer
-- Inhalt ein einzelner Aufruf offenlegt (PROJECT_PRINCIPLES.md 16).
--
-- Ein unbekannter oder fremder Patient hat in der eigenen Organisation keine
-- Termine und liefert dasselbe leere Ergebnis wie ein Patient ohne Termine -
-- kein Existenz-Orakel (13).
--
-- Kein Grant fuer Anwendungsrollen: die Funktion wird ausschliesslich aus den
-- SECURITY-DEFINER-Sichten unten aufgerufen.
-- -----------------------------------------------------------------------------
create function app.patient_record_page(
  p_organization_id  uuid,
  p_patient_id       uuid,
  p_limit            integer,
  p_before_starts_at timestamptz,
  p_before_id        uuid
)
returns table (
  appointment_id uuid,
  starts_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'limit out of range' using errcode = '22023';
  end if;

  -- Der Cursor besteht aus beiden Teilen oder gar nicht.
  if (p_before_starts_at is null) <> (p_before_id is null) then
    raise exception 'cursor is incomplete' using errcode = '22023';
  end if;

  return query
    select a.id, a.starts_at
    from public.appointments a
    where a.organization_id = p_organization_id
      and a.patient_id = p_patient_id
      and (
        a.starts_at <= now()
        or exists (
          select 1 from public.treatment_notes t where t.appointment_id = a.id
        )
      )
      and (
        p_before_starts_at is null
        or (a.starts_at, a.id) < (p_before_starts_at, p_before_id)
      )
    order by a.starts_at desc, a.id desc
    limit p_limit;
end;
$$;

comment on function app.patient_record_page(uuid, uuid, integer, timestamptz, uuid) is
  'Seitenregel der Akte (DOK-003): begonnene oder dokumentierte Termine eines Patienten, neueste zuerst, Keyset-Cursor. Gemeinsame Grundlage von Behandlungsnachweis und klinischer Sicht.';

revoke all on function app.patient_record_page(uuid, uuid, integer, timestamptz, uuid)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- list_patient_treatment_evidence: der Behandlungsnachweis
--
-- Eine Zeile je Termin. documentation_status ist der Zustand des
-- Haupteintrags ('none', 'draft', 'final'); documented_at ist der Zeitpunkt
-- der Finalisierung und nur dann gesetzt. Ein Entwurf ist kein Nachweis im
-- Sinne von 630f BGB (ADR-016 Punkt 3) und bekommt deshalb keinen Zeitpunkt -
-- nur den Hinweis, dass er existiert. Nachtraege und Versionen erscheinen
-- nicht: sie sagen fuer den organisatorischen Streitfall nichts aus, was der
-- Haupteintrag nicht schon sagt.
--
-- Kein eigener Auditeintrag: der Nachweis enthaelt keinen klinischen Inhalt,
-- und das Oeffnen der Akte, in der er steht, wird als patient_record.viewed
-- protokolliert (ADR-010). Ob das genuegt, prueft die Datenschutzpruefung
-- ueber ANN-006; ein eigenes Ereignis waere eine kleine Ergaenzung.
--
-- STABLE, weil nichts geschrieben wird; PostgREST ruft die Funktion trotzdem
-- per POST auf, die Parameter sind dafuer unerheblich.
-- -----------------------------------------------------------------------------
create function public.list_patient_treatment_evidence(
  p_patient_id       uuid,
  p_limit            integer     default 20,
  p_before_starts_at timestamptz default null,
  p_before_id        uuid        default null
)
returns table (
  appointment_id         uuid,
  starts_at              timestamptz,
  ends_at                timestamptz,
  appointment_type       text,
  appointment_status     text,
  staff_given_name       text,
  staff_family_name      text,
  organization_time_zone text,
  documentation_status   text,
  documented_at          timestamptz
)
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

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft.
  if not app.can_read_treatment_evidence() then
    raise exception 'not allowed to read treatment evidence' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read treatment evidence' using errcode = '42501';
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
      o.time_zone,
      -- ANN-006: Dokumentationsstand ohne Inhalt, Zeitpunkt nur fuer
      -- finalisierte Eintraege.
      case when t.id is null then 'none' else t.status end,
      case when t.status = 'final' then t.finalized_at else null end
    from app.patient_record_page(
           v_org, p_patient_id, p_limit, p_before_starts_at, p_before_id
         ) seite
    join public.appointments a    on a.id  = seite.appointment_id
    join public.staff_members sm  on sm.id = a.staff_member_id
    join public.persons sp        on sp.id = sm.person_id
    join public.organizations o   on o.id  = a.organization_id
    left join public.treatment_notes t
           on t.appointment_id = a.id
          and t.addendum_to_note_id is null
    order by a.starts_at desc, a.id desc;
end;
$$;

comment on function public.list_patient_treatment_evidence(uuid, integer, timestamptz, uuid) is
  'Behandlungsnachweis in der Akte (DOK-003, PROJECT_PRINCIPLES.md 4.4, ANN-006): Termine eines Patienten mit Status und Dokumentationsstand, ohne klinischen Inhalt. Einzige Sicht auf Dokumentationsmetadaten fuer office.';

revoke all on function public.list_patient_treatment_evidence(uuid, integer, timestamptz, uuid)
  from public, anon;
grant execute on function public.list_patient_treatment_evidence(uuid, integer, timestamptz, uuid)
  to authenticated;
