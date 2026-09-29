-- =============================================================================
-- PRX-010: Office erfasst Behandlungsgrundlagen (PRX-EPIC-003, ANN-011)
--
-- Jannes 2026-09-28 (Sichtung Kernprozess, Schritt 1): Office darf Grundlagen
-- erfassen und bearbeiten - "gang und gaebe in jeder Praxis". Der Ablauf dazu
-- ist PRX-011: Die Therapeut:in fotografiert die Verordnung am Termin, Office
-- tippt sie mit dem Foto daneben ab.
--
-- Zwei Stellen aendern sich, keine Tabelle:
--
--   1. app.can_write_treatment_bases() nimmt office auf. Das ist der eine Anker
--      aus ANN-011; create/update/delete_treatment_basis fragen ihn bereits.
--      Was office damit schreibt, ist die **abgetippte Verordnung** - Diagnose
--      und Heilmittel stehen auf dem Blatt der Aerzt:in. Eigene klinische
--      Dokumentation schreibt office weiterhin nicht (ADR-004 Punkt 3): Die
--      Empfehlung zum Verordnungsende steht nicht im Formular und kommt seit
--      DOK-005 aus dem Therapiebericht (therapy_reports, eigener Schreibschnitt).
--
--   2. app.can_write_patient_file() gibt den Verordnungsscan frei, wer die
--      Grundlage schreiben darf (ADR-017 Punkt 13: Schreibrecht am
--      Bezugsdatensatz). Die uebrigen klinischen Arten bleiben bei den
--      therapeutischen Rollen.
-- =============================================================================

create or replace function app.can_write_treatment_bases()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead', 'office')
$$;

comment on function app.can_write_treatment_bases() is
  'Rollen, die Behandlungsgrundlagen anlegen, aendern und loeschen duerfen: alle vier Praxisrollen seit PRX-010 (ANN-011, Stand 2026-09-28). Office tippt die Verordnung ab; eigene klinische Dokumentation schreibt es nicht (ADR-004 Punkt 3).';


create or replace function app.can_write_patient_file(p_document_type text, p_treatment_basis_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    case
      -- ADR-017 Punkt 13: Der Scan folgt dem Schreibrecht an seinem
      -- Bezugsdatensatz, der Behandlungsgrundlage (PRX-010).
      when p_document_type = 'verordnungsscan'
        then app.can_write_treatment_bases()
      when app.patient_file_type_is_clinical(p_document_type)
        then app.can_write_clinical_patient_files()
      else app.can_write_organisational_patient_files()
    end,
    false
  )
  and (p_treatment_basis_id is null or app.can_write_treatment_bases())
$$;

comment on function app.can_write_patient_file(text, uuid) is
  'Schreibrecht an einer Datei nach ADR-017 Punkt 13: Dokumentart plus, bei einer Datei an der Behandlungsgrundlage, das Schreibrecht an Behandlungsgrundlagen. Der Verordnungsscan folgt allein dem Schreibrecht an Grundlagen (PRX-010, ANN-011).';


comment on function public.create_treatment_basis(uuid, uuid, text, date, integer, jsonb, text, text, text) is
  'Legt eine Behandlungsgrundlage samt Positionen atomar an und protokolliert treatment_basis.created (VER-003, ADR-010). Alle vier Praxisrollen seit PRX-010 (app.can_write_treatment_bases, ANN-011). Seit VER-EPIC-002 mit der Anzahl moeglicher Termine und ohne Therapieziel, Verordnerhinweis und Empfehlung - eine neue Grundlage hat sie nicht (ANN-064).';

comment on function public.update_treatment_basis(uuid, uuid, text, date, integer, jsonb, text, text, text) is
  'Aendert eine Behandlungsgrundlage samt Positionen atomar und protokolliert treatment_basis.updated (VER-003, ADR-010). Alle vier Praxisrollen seit PRX-010 (ANN-011). Die Patientin bleibt unveraendert. Ohne Therapieziel, Verordnerhinweis und Empfehlung: Bestandstexte bleiben unangetastet, beim Selbstzahler raeumt sie der Server ab (ADR-020 Punkt 4, ANN-064).';
