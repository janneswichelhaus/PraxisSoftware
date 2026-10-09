-- =============================================================================
-- ABN-031 (ABN-EPIC-002, BEF-134): Den Hinweis aus der Verordnung erfassen alle
-- Praxisrollen
--
-- Abnahme der Annahmen vom 2026-10-09 (ANN-214): Den behandlungsrelevanten
-- Hinweis aus der Verordnung (treatment_bases.prescriber_note) erfassen und
-- aendern owner, Therapeut:innen, Teamleitung und Buero - wer die Verordnung
-- abtippt, sieht ihn auf dem Rezept zuerst. Eine Person, die nur die
-- Trainingsbetreuung hat, nicht (ADR-021 Punkt 6). Die Rollen kommen aus
-- app.can_write_treatment_bases(), derselben Stelle wie die Grundlage; Lesen
-- bleibt bei app.can_read_treatment_note(). Sonst unveraendert gegenueber
-- 20261006110100_log_001b_schreibpfade.sql.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_treatment_basis_clinical_note(p_treatment_basis_id uuid, p_prescriber_note text, p_expected_updated_at timestamp with time zone)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor   uuid;
  v_org     uuid;
  v_alt     record;
  v_text    text;
  v_stand   timestamptz;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- ANN-214 (Abnahme 2026-10-09, BEF-134): wie die Grundlage selbst - alle
  -- Praxisrollen, auch das Buero; die reine Trainingsbetreuung nicht.
  if not app.can_write_treatment_bases() then
    raise exception 'not allowed to write clinical treatment basis notes' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write clinical treatment basis notes' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  select t.id, t.patient_id, t.treatment_basis_kind, t.prescriber_note, t.updated_at
    into v_alt
  from public.treatment_bases t
  where t.id = p_treatment_basis_id
    and t.organization_id = v_org
  for update;

  if not found then
    raise exception 'treatment basis not found' using errcode = 'P0002';
  end if;

  if v_alt.treatment_basis_kind = 'self_pay' then
    raise exception 'a self-pay basis carries no clinical note' using errcode = '22023';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'treatment basis was changed meanwhile' using errcode = '40001';
  end if;

  -- Leer heisst: kein Hinweis. Die Laengengrenze haelt die Constraint
  -- treatment_bases_prescriber_note_check; hier bekommt sie eine Meldung.
  v_text := nullif(btrim(p_prescriber_note), '');
  if v_text is not null and length(v_text) > 2000 then
    raise exception 'clinical note is too long' using errcode = '22023';
  end if;

  update public.treatment_bases
     set prescriber_note = v_text,
         updated_at      = now(),
         updated_by      = v_actor
   where id = p_treatment_basis_id
  returning updated_at into v_stand;


  return v_stand;
end;
$function$;

comment on function public.set_treatment_basis_clinical_note(uuid, text, timestamptz) is
  'ABN-007, ABN-031: behandlungsrelevanter Hinweis aus einer Verordnung, an der Verordnung in der Akte. Schreiben: app.can_write_treatment_bases() (alle Praxisrollen, ANN-214 nach BEF-134). Nie am Selbstzahler.';
