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


-- -----------------------------------------------------------------------------
-- Zweitreview PRX-EPIC-003: Office raeumt keine klinischen Texte ab
--
-- Therapieziel, Verordnerhinweis und Empfehlung zum Verordnungsende stehen
-- nicht mehr im Formular (ANN-064), koennen aber an Bestandsgrundlagen stehen.
-- Der Wechsel auf Selbstzahler und das Loeschen der Grundlage raeumen sie ab.
-- Beides bleibt den therapeutischen Rollen vorbehalten, wenn Texte da sind -
-- office schreibt keine klinische Dokumentation und loescht auch keine
-- (ADR-004 Punkt 3). Die Diagnose gehoert zum abgetippten Blatt und ist
-- davon ausgenommen.
-- -----------------------------------------------------------------------------
create function app.can_clear_treatment_basis_clinical_texts()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead')
$$;

comment on function app.can_clear_treatment_basis_clinical_texts() is
  'Rollen, die Therapieziel, Verordnerhinweis und Empfehlung einer Grundlage durch Wechsel auf Selbstzahler oder Loeschen abraeumen duerfen: die therapeutischen Rollen, nicht office (PRX-010, ADR-004 Punkt 3).';

revoke all on function app.can_clear_treatment_basis_clinical_texts() from public, anon;
grant execute on function app.can_clear_treatment_basis_clinical_texts() to authenticated;

-- Nur in der eigenen Organisation: sonst verriete die Antwort eine fremde
-- Grundlage.
create function app.treatment_basis_has_clinical_texts(p_treatment_basis_id uuid, p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.treatment_bases b
    where b.id = p_treatment_basis_id
      and b.organization_id = p_org
      and (b.therapy_goal is not null
           or b.prescriber_note is not null
           or b.follow_up_recommendation is not null)
  )
$$;

revoke all on function app.treatment_basis_has_clinical_texts(uuid, uuid) from public, anon, authenticated;

-- update_treatment_basis: Rumpf aus 20260918130000_appointment_count.sql, dazu die Sperre.
create or replace function public.update_treatment_basis(
  p_treatment_basis_id uuid,
  p_prescriber_id uuid,
  p_treatment_basis_kind text,
  p_issued_on date,
  p_appointment_count integer,
  p_items jsonb,
  p_frequency_note text DEFAULT NULL::text,
  p_note text DEFAULT NULL::text,
  p_diagnosis text DEFAULT NULL::text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor      uuid;
  v_org        uuid;
  v_patient_id uuid;
  v_selbstzahler boolean;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_treatment_bases() then
    raise exception 'not allowed to write treatment_bases' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write treatment_bases' using errcode = '42501';
  end if;

  select p.patient_id into v_patient_id
  from public.treatment_bases p
  where p.id = p_treatment_basis_id
    and p.organization_id = v_org;

  if not found then
    raise exception 'treatment basis not found' using errcode = 'P0002';
  end if;

  perform app.assert_treatment_basis_input(v_org, p_prescriber_id, p_treatment_basis_kind, p_issued_on);
  perform app.assert_appointment_count(p_appointment_count);

  v_selbstzahler := p_treatment_basis_kind = 'self_pay';

  -- PRX-010 (Zweitreview): Office tippt die Verordnung ab, raeumt aber keine
  -- klinischen Texte der Therapeut:innen ab. Der Wechsel auf Selbstzahler
  -- loescht Therapieziel, Verordnerhinweis und Empfehlung (ADR-020 Punkt 4) -
  -- stehen welche da, bleibt er den therapeutischen Rollen vorbehalten.
  if v_selbstzahler
     and not app.can_clear_treatment_basis_clinical_texts()
     and app.treatment_basis_has_clinical_texts(p_treatment_basis_id, v_org) then
    raise exception 'clinical texts on this treatment basis can only be cleared by treating roles'
      using errcode = '42501';
  end if;

  -- Therapieziel, Verordnerhinweis und Empfehlung stehen seit VER-EPIC-002
  -- nicht mehr im Formular. Sie kommen deshalb in dieser Anweisung nicht vor
  -- und bleiben unveraendert stehen - **ausser** beim Wechsel auf
  -- "Selbstzahler": Dort verlangt ADR-020 Punkt 4 sie leer, und das entscheidet
  -- der Server, nicht der Aufrufer.
  update public.treatment_bases
     set prescriber_id            = p_prescriber_id,
         treatment_basis_kind     = p_treatment_basis_kind,
         issued_on                = p_issued_on,
         appointment_count        = p_appointment_count,
         frequency_note           = nullif(btrim(p_frequency_note), ''),
         note                     = nullif(btrim(p_note), ''),
         diagnosis                = case when v_selbstzahler
                                         then null else nullif(btrim(p_diagnosis), '') end,
         therapy_goal             = case when v_selbstzahler then null else therapy_goal end,
         prescriber_note          = case when v_selbstzahler then null else prescriber_note end,
         follow_up_recommendation = case when v_selbstzahler
                                         then null else follow_up_recommendation end,
         updated_at               = now(),
         updated_by               = v_actor
   where id = p_treatment_basis_id;

  perform app.write_treatment_base_items(p_treatment_basis_id, v_org, v_actor, p_items);

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'treatment_basis.updated', 'treatment_basis', p_treatment_basis_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', v_patient_id)
  );

  return p_treatment_basis_id;
end;
$$;

-- delete_treatment_basis: Rumpf aus 20260926140000_dok_005a_therapy_reports.sql, dazu die Sperre.
create or replace function public.delete_treatment_basis(p_treatment_basis_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor      uuid;
  v_org        uuid;
  v_patient_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_treatment_bases() then
    raise exception 'not allowed to write treatment_bases' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write treatment_bases' using errcode = '42501';
  end if;

  -- PRX-010 (Zweitreview): Mit der Grundlage fielen ihre klinischen Texte;
  -- das bleibt den therapeutischen Rollen vorbehalten.
  if not app.can_clear_treatment_basis_clinical_texts()
     and app.treatment_basis_has_clinical_texts(p_treatment_basis_id, v_org) then
    raise exception 'clinical texts on this treatment basis can only be cleared by treating roles'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from public.therapy_reports r
    where r.treatment_basis_id = p_treatment_basis_id and r.organization_id = v_org
  ) then
    raise exception 'treatment basis has therapy reports' using errcode = '23503';
  end if;

  delete from public.treatment_bases p
  where p.id = p_treatment_basis_id
    and p.organization_id = v_org
  returning p.patient_id into v_patient_id;

  if not found then
    raise exception 'treatment basis not found' using errcode = 'P0002';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'treatment_basis.deleted', 'treatment_basis', p_treatment_basis_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', v_patient_id)
  );
end;
$$;

comment on function public.create_treatment_basis(uuid, uuid, text, date, integer, jsonb, text, text, text) is
  'Legt eine Behandlungsgrundlage samt Positionen atomar an und protokolliert treatment_basis.created (VER-003, ADR-010). Alle vier Praxisrollen seit PRX-010 (app.can_write_treatment_bases, ANN-011). Seit VER-EPIC-002 mit der Anzahl moeglicher Termine und ohne Therapieziel, Verordnerhinweis und Empfehlung - eine neue Grundlage hat sie nicht (ANN-064).';

comment on function public.update_treatment_basis(uuid, uuid, text, date, integer, jsonb, text, text, text) is
  'Aendert eine Behandlungsgrundlage samt Positionen atomar und protokolliert treatment_basis.updated (VER-003, ADR-010). Alle vier Praxisrollen seit PRX-010 (ANN-011). Die Patientin bleibt unveraendert. Ohne Therapieziel, Verordnerhinweis und Empfehlung: Bestandstexte bleiben unangetastet, beim Selbstzahler raeumt sie der Server ab (ADR-020 Punkt 4, ANN-064).';
