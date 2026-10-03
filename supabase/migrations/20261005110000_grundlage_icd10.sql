-- =============================================================================
-- Akte entschlacken, Teil 2: ICD-10 an der Behandlungsgrundlage
--
-- Jannes 2026-10-03: Die Verordnungsdaten gehen in die Rechnung; dazu ein
-- eigenes Feld fuer den ICD-10-Code neben dem Freitext "Diagnose oder
-- Leitsymptomatik". Der Code ist klinisch wie die Diagnose und folgt ihren
-- Regeln:
--
--   * Lesen nur ueber die klinischen Projektionen (get_treatment_basis,
--     list_patient_treatment_bases_clinical), die dafuer eine Spalte mehr
--     bekommen. Die organisatorische Projektion bleibt ohne ihn (ANN-011).
--   * Schreiben ueber eine eigene Funktion mit denselben Pruefungen wie
--     update_treatment_basis (app.can_write_treatment_bases, Mandant).
--     create_/update_treatment_basis bleiben unveraendert - die Oberflaeche
--     schreibt den Code nach dem Speichern der Grundlage.
--   * Nur an einer Verordnung: beim Selbstzahler gibt es keine Diagnose
--     (ADR-020 Punkt 4). Ein Wechsel auf Selbstzahler leert den Code.
-- =============================================================================

alter table public.treatment_bases
  add column diagnosis_icd10 text
    check (diagnosis_icd10 ~ '^[A-Z][0-9]{2}(\.[0-9A-Z!*+-]{1,5})?[GVZALR]?$');

comment on column public.treatment_bases.diagnosis_icd10 is
  'ICD-10-GM-Code der Verordnung, etwa G20.00 oder M54.5G (Akte entschlacken, 2026-10-03). Klinisch wie diagnosis; beim Selbstzahler leer.';

alter table public.treatment_bases
  add constraint treatment_bases_icd10_only_for_prescription
    check (treatment_basis_kind <> 'self_pay' or diagnosis_icd10 is null) not valid;
alter table public.treatment_bases validate constraint treatment_bases_icd10_only_for_prescription;

-- Der Wechsel auf Selbstzahler leert den Code, wie update_treatment_basis die
-- Diagnose leert - entschieden vom Server, nicht vom Aufrufer.
create or replace function app.clear_icd10_for_self_pay()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.treatment_basis_kind = 'self_pay' then
    new.diagnosis_icd10 := null;
  end if;
  return new;
end;
$$;

create trigger treatment_bases_clear_icd10_for_self_pay
  before insert or update of treatment_basis_kind on public.treatment_bases
  for each row execute function app.clear_icd10_for_self_pay();

-- -----------------------------------------------------------------------------
-- Schreiben
-- -----------------------------------------------------------------------------
create or replace function public.set_treatment_basis_icd10(
  p_treatment_basis_id uuid,
  p_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor      uuid;
  v_org        uuid;
  v_patient_id uuid;
  v_kind       text;
  v_code       text;
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

  select p.patient_id, p.treatment_basis_kind into v_patient_id, v_kind
  from public.treatment_bases p
  where p.id = p_treatment_basis_id
    and p.organization_id = v_org;

  if not found then
    raise exception 'treatment basis not found' using errcode = 'P0002';
  end if;

  v_code := nullif(upper(btrim(p_code)), '');
  if v_code is not null and v_kind = 'self_pay' then
    raise exception 'self pay treatment bases have no diagnosis' using errcode = '22023';
  end if;
  if v_code is not null
     and v_code !~ '^[A-Z][0-9]{2}(\.[0-9A-Z!*+-]{1,5})?[GVZALR]?$' then
    raise exception 'invalid ICD-10 code' using errcode = '22023';
  end if;

  update public.treatment_bases
     set diagnosis_icd10 = v_code,
         updated_at      = now(),
         updated_by      = v_actor
   where id = p_treatment_basis_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'treatment_basis.updated', 'treatment_basis', p_treatment_basis_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', v_patient_id)
  );
end;
$$;

revoke all on function public.set_treatment_basis_icd10(uuid, text) from public, anon;
grant execute on function public.set_treatment_basis_icd10(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Lesen: die beiden klinischen Projektionen mit einer Spalte mehr (Rumpf aus
-- 20260923100000_abgewiesene_klinische_lesezugriffe.sql)
-- -----------------------------------------------------------------------------
drop function public.get_treatment_basis(uuid);
create or replace function public.get_treatment_basis(p_treatment_basis_id uuid)
returns table (id uuid, patient_id uuid, prescriber_id uuid, prescriber_name text, prescriber_practice_name text, treatment_basis_kind text, issued_on date, appointment_count integer, frequency_note text, note text, items jsonb, updated_at timestamp with time zone, diagnosis text, therapy_goal text, prescriber_note text, follow_up_recommendation text, diagnosis_icd10 text)
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

  if not app.can_read_treatment_basis_clinical() then
    -- G6a: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(v_actor, 'treatment_basis.viewed', 'not allowed to read clinical treatment basis data');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read clinical treatment basis data' using errcode = '42501';
  end if;

  select p.patient_id into v_patient_id
  from public.treatment_bases p
  where p.id = p_treatment_basis_id
    and p.organization_id = v_org;

  -- Eine fremde und eine unbekannte ID liefern beide nichts.
  if not found then
    return;
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'treatment_basis.viewed', 'treatment_basis', p_treatment_basis_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', v_patient_id)
  );

  return query
    select
      p.id,
      p.patient_id,
      p.prescriber_id,
      -- nullif, damit beim Selbstzahler wirklich NICHTS dasteht: concat_ws
      -- ueberspringt Nullwerte und lieferte sonst den leeren String - eine
      -- Angabe, die es nicht gibt (GRD-001, ADR-020 Punkt 3).
      nullif(btrim(concat_ws(' ', v.title, v.given_name, v.family_name)), ''),
      v.practice_name,
      p.treatment_basis_kind,
      p.issued_on,
      p.appointment_count,
      p.frequency_note,
      p.note,
      app.treatment_base_items_json(p.id),
      p.updated_at,
      p.diagnosis,
      -- Drei Bestandstexte: Das Formular bietet sie seit VER-EPIC-002 nicht
      -- mehr zur Eingabe an, zeigt sie aber weiter an - sonst waere ein
      -- vorhandener Text unsichtbar und damit faktisch verloren.
      p.therapy_goal,
      p.prescriber_note,
      p.follow_up_recommendation,
      p.diagnosis_icd10
    from public.treatment_bases p
    -- LEFT JOIN seit GRD-001: Ein Selbstzahler hat keine Verordner:in
    -- (ADR-020 Punkt 3). Ein innerer Verbund liesse ihn aus der Projektion
    -- fallen - die Zeile waere da, die Akte zeigte sie nicht.
    left join public.prescribers v on v.id = p.prescriber_id
    where p.id = p_treatment_basis_id;
end;
$$;

revoke all on function public.get_treatment_basis(uuid) from public, anon;
grant execute on function public.get_treatment_basis(uuid) to authenticated;

drop function public.list_patient_treatment_bases_clinical(uuid);
create or replace function public.list_patient_treatment_bases_clinical(p_patient_id uuid)
returns table (id uuid, prescriber_id uuid, prescriber_name text, prescriber_practice_name text, treatment_basis_kind text, issued_on date, frequency_note text, note text, items jsonb, updated_at timestamp with time zone, diagnosis text, therapy_goal text, prescriber_note text, follow_up_recommendation text, diagnosis_icd10 text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_ids   uuid[];
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Dieselbe Rollenmenge wie bei der Behandlungsdokumentation: die Grundlage
  -- oeffnet keinen zweiten Weg zu klinischem Freitext (4.3, 4.6).
  if not app.can_read_treatment_basis_clinical() then
    -- G6a: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(v_actor, 'treatment_basis.viewed', 'not allowed to read clinical treatment basis data');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read clinical treatment basis data' using errcode = '42501';
  end if;

  v_ids := app.patient_treatment_basis_ids(v_org, p_patient_id);
  if v_ids is null then
    return;
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  select v_org, v_actor, 'treatment_basis.viewed', 'treatment_basis', unnest(v_ids), 'success',
         jsonb_build_object('surface', 'web', 'patient_id', p_patient_id);

  return query
    select
      p.id,
      p.prescriber_id,
      -- nullif, damit beim Selbstzahler wirklich NICHTS dasteht: concat_ws
      -- ueberspringt Nullwerte und lieferte sonst den leeren String - eine
      -- Angabe, die es nicht gibt (GRD-001, ADR-020 Punkt 3).
      nullif(btrim(concat_ws(' ', v.title, v.given_name, v.family_name)), ''),
      v.practice_name,
      p.treatment_basis_kind,
      p.issued_on,
      p.frequency_note,
      p.note,
      app.treatment_base_items_json(p.id),
      p.updated_at,
      p.diagnosis,
      p.therapy_goal,
      p.prescriber_note,
      -- ANN-014: die Empfehlung der Therapeut:in, von ihr selbst erfasst.
      p.follow_up_recommendation,
      p.diagnosis_icd10
    from public.treatment_bases p
    -- LEFT JOIN seit GRD-001: Ein Selbstzahler hat keine Verordner:in
    -- (ADR-020 Punkt 3). Ein innerer Verbund liesse ihn aus der Projektion
    -- fallen - die Zeile waere da, die Akte zeigte sie nicht.
    left join public.prescribers v on v.id = p.prescriber_id
    where p.id = any (v_ids)
    order by p.issued_on desc, p.created_at desc, p.id desc;
end;
$$;

revoke all on function public.list_patient_treatment_bases_clinical(uuid) from public, anon;
grant execute on function public.list_patient_treatment_bases_clinical(uuid) to authenticated;
