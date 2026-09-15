-- =============================================================================
-- ROL-001: office liest die Behandlungsdokumentation (E15)
--
-- PROJECT_PRINCIPLES.md 0.10 §4.3 und ADR-004 Fassung 2 Punkt 3: Office hat
-- lesenden Zugriff auf alle klinischen Inhalte einer Akte im selben Umfang wie
-- Therapeut:innen. Umgesetzt an genau einer Stelle - der Rollenfunktion, ueber
-- die alle drei Lesepfade der Dokumentation pruefen:
--
--   get_treatment_note            Eintrag am Termin   treatment_note.viewed je Eintrag
--   get_treatment_note_versions   Aenderungsverlauf   treatment_note.history_viewed
--   list_patient_treatment_notes  Akte                treatment_note.viewed je Eintrag
--
-- Die Protokollierung steht in diesen Funktionen selbst und gilt damit fuer
-- office ohne Abstriche (ADR-010 Fassung 2). Nichts anderes aendert sich:
--
--   * Schreiben bleibt bei app.can_write_treatment_note() (therapist,
--     team_lead): Anlegen, Aendern, Finalisieren, Korrigieren und Nachtragen
--     pruefen dort und nicht hier.
--   * Der Behandlungsnachweis (list_patient_treatment_evidence) bleibt als
--     Rechnungssicht ohne Inhalt bestehen, ist aber keine Zugriffsgrenze mehr
--     (ADR-004 Fassung 2 Punkt 4).
--   * Patientenkonten und fremde Organisationen bleiben aussen vor.
--
-- create or replace behaelt Eigentuemer und Rechte der Funktion.
-- =============================================================================

create or replace function app.can_read_treatment_note()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead', 'office')
$$;

comment on function app.can_read_treatment_note() is
  'Rollen mit Lesezugriff auf klinische Behandlungsdokumentation: alle vier Praxisrollen (PROJECT_PRINCIPLES.md 4.2, 4.3; ADR-004 Fassung 2, E15, ROL-001). Jeder Lesepfad protokolliert selbst (ADR-010). Das Schreibrecht regelt app.can_write_treatment_note().';

comment on function public.list_patient_treatment_notes(uuid, integer, timestamptz, uuid) is
  'Klinische Sicht der Akte (DOK-003, DOK-004, ROL-001): Termine eines Patienten mit ihren Eintraegen samt Inhalt und Art der Finalisierung, protokolliert je Eintrag treatment_note.viewed (ADR-010, ADR-016 Punkt 8 und 9). owner, therapist, team_lead und office.';

comment on function app.can_read_treatment_evidence() is
  'Rollen mit Zugriff auf den datensparsamen Behandlungsnachweis (PROJECT_PRINCIPLES.md 4.4, ANN-006 verworfen). Seit E15 keine Zugriffsgrenze mehr, sondern die Rechnungssicht ohne klinischen Inhalt (ADR-004 Fassung 2 Punkt 4). Office eingeschlossen, Patientenkonten nicht.';
