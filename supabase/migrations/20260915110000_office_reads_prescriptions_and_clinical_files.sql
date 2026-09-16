-- =============================================================================
-- ROL-002: office liest Verordnung mit Diagnose und klinische Dateien (E15)
--
-- ADR-004 Fassung 2 Punkt 3 nennt ausdruecklich "Diagnose und Verordnung
-- einschliesslich Scan". Zwei Rollenfunktionen, je eine Stelle:
--
--   app.can_read_prescription_clinical()
--     list_patient_prescriptions_clinical   prescription.viewed je Verordnung
--     get_prescription                      prescription.viewed
--
--   app.can_read_clinical_patient_files()  - wirkt ueber app.can_see_patient_file_type()
--     list_patient_files                    Auflisten bewusst ohne Audit (ADR-017 Punkt 22)
--     issue_patient_file_link               patient_file.link_issued (ADR-010 Punkt 14)
--     Policy patient_files_objects_select   dieselbe Leseregel auf storage.objects
--
-- Die Protokollierung steht in den Lesepfaden selbst und gilt fuer office ohne
-- Abstriche (ADR-010 Fassung 2). Die Dokumentart bleibt Katalog und
-- Rollenschnitt fuer Patientenkonten, Dritte und das Schreibrecht; fuer das
-- Lesen der vier Praxisrollen faellt die Grenze (ADR-017 Punkt 12, Vermerk E15).
--
-- Bewusst NICHT angefasst - das neue Leserecht oeffnet kein Schreibrecht:
--
--   app.can_write_prescriptions()           ohne office (ANN-011): anlegen,
--                                           aendern, loeschen
--   app.can_write_clinical_patient_files()  ohne office: eine klinische Datei
--                                           hochladen; delete_patient_file
--                                           verlangt dieses Schreibrecht
--                                           zusaetzlich zur Sichtbarkeit
--   app.can_correct_patient_file_type()     ohne office (ADR-017 Punkt 13)
--
-- Die organisatorische Projektion list_patient_prescriptions bleibt bestehen.
-- create or replace behaelt Eigentuemer und Rechte der Funktionen.
-- =============================================================================

-- ANN-011: Mit E15 ist allein der Office-Leseausschluss der Annahme abgeloest.
-- Datenklasse, Aufbewahrungsfrist und Schreibregel der Verordnung gelten weiter.
create or replace function app.can_read_prescription_clinical()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead', 'office')
$$;

comment on function app.can_read_prescription_clinical() is
  'Rollen mit Zugriff auf die klinischen Felder einer Verordnung: alle vier Praxisrollen, deckungsgleich mit app.can_read_treatment_note() (ADR-004 Fassung 2, E15, ROL-002). Schreiben regelt app.can_write_prescriptions() ohne office (ANN-011).';

comment on function public.list_patient_prescriptions_clinical(uuid) is
  'Klinische Sicht der Verordnungen einer Patientin (VER-002, ROL-002): zusaetzlich Diagnose, Therapieziel, Hinweise der Verordner:in und Empfehlung zum Verordnungsende. Protokolliert je Verordnung prescription.viewed (ADR-010). owner, therapist, team_lead und office.';

comment on function public.get_prescription(uuid) is
  'Eine Verordnung mit allen Feldern (VER-003, ROL-002). Protokolliert prescription.viewed (ADR-010). Lesen alle vier Praxisrollen; aendern duerfen nur owner, therapist und team_lead (app.can_write_prescriptions, ANN-011).';

create or replace function app.can_read_clinical_patient_files()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead', 'office')
$$;

comment on function app.can_read_clinical_patient_files() is
  'Wer klinische Dateien sehen darf (ADR-017 Punkt 12): alle vier Praxisrollen seit E15, der Verordnungsscan eingeschlossen (ADR-004 Fassung 2, ROL-002). Hochladen und Loeschen regelt app.can_write_clinical_patient_files() ohne office.';

comment on table public.patient_file_document_types is
  'Fester Katalog der Dokumentarten (ADR-017 Punkt 12). is_clinical bestimmt das Schreibrecht (klinisch: owner/therapist/team_lead, organisatorisch zusaetzlich office) und bleibt der Rollenschnitt fuer Patientenkonten und Dritte; lesen duerfen seit E15 alle vier Praxisrollen. Datenklasse: Konfiguration, kein Personenbezug.';

comment on column public.patient_file_document_types.is_clinical is
  'true: die Datei kann Gesundheitsdaten zeigen. Lesen alle vier Praxisrollen (E15); hochladen und loeschen nur owner, therapist und team_lead. Eine falsch gewaehlte Art bleibt ein Mangel nach PROJECT_PRINCIPLES.md 13 - sie bestimmt das Schreibrecht und, sobald es sie gibt, die Sicht von Patientenkonten und Dritten.';

comment on function app.can_correct_patient_file_type() is
  'Wer die Dokumentart einer Datei aendern darf (ADR-017 Punkt 13). Ohne office, auch nach E15: die Art bestimmt weiterhin, wer eine Datei hochladen und loeschen darf.';
