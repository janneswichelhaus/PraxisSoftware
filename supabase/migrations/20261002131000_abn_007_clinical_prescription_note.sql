-- =============================================================================
-- ABN-007 (BEF-098): Ein klinischer Ort fuer behandlungsrelevante Hinweise
-- aus einer Verordnung
--
-- Seit ANN-065 schreibt das Formular der Grundlage nur noch die
-- organisatorischen "Anmerkungen" (`note`). Ein Hinweis wie "keine Belastung
-- ueber 20 kg" hatte damit keinen klinischen Ort mehr. Abnahme Jannes,
-- 2026-10-02: `prescriber_note` nimmt wieder Eingaben an - getrennt von den
-- Anmerkungen, klar beschriftet.
--
--   * Schreiben: die behandelnden Rollen (app.can_write_treatment_note,
--     therapist und team_lead), ueber eine eigene Funktion. Das Formular der
--     Grundlage, das auch das Buero ausfuellt, faesst die Spalte weiter nicht
--     an (ANN-214).
--   * Lesen: ueber das eine Leserecht fuer Dokumentation
--     (app.can_read_treatment_note, ADR-004 Fassung 2), wie seit ABN-005 der
--     Stand der Dokumentation. app.can_read_treatment_basis_clinical ruft es
--     jetzt auf, statt dieselbe Rollenliste ein zweites Mal zu fuehren.
--   * Nur an einer Verordnung: Ein Selbstzahler traegt keine klinischen
--     Felder (ADR-020 Punkt 4, Constraint treatment_bases_clinical_only_for_prescription).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Ein Leserecht
-- -----------------------------------------------------------------------------
create or replace function app.can_read_treatment_basis_clinical()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.can_read_treatment_note()
$$;

comment on function app.can_read_treatment_basis_clinical() is
  'Klinische Sicht einer Behandlungsgrundlage (Diagnose, Therapieziel, behandlungsrelevanter Hinweis, Empfehlung). Seit ABN-007 dasselbe Leserecht wie die Dokumentation: app.can_read_treatment_note() (ADR-004 Fassung 2, BEF-095, BEF-098).';

-- -----------------------------------------------------------------------------
-- 2. Den Hinweis setzen
-- -----------------------------------------------------------------------------
create function public.set_treatment_basis_clinical_note(
  p_treatment_basis_id  uuid,
  p_prescriber_note     text,
  p_expected_updated_at timestamptz
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
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

  if not app.can_write_treatment_note() then
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

  -- Ohne den Text: Er ist klinisch und gehoert nicht in das Protokoll
  -- (ADR-010, ADR-011). Festgehalten wird, welches Feld sich geaendert hat.
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'treatment_basis.updated', 'treatment_basis', p_treatment_basis_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_alt.patient_id,
      'field', 'prescriber_note',
      'cleared', v_text is null
    )
  );

  return v_stand;
end;
$$;

comment on function public.set_treatment_basis_clinical_note(uuid, text, timestamptz) is
  'Setzt oder leert den behandlungsrelevanten Hinweis (prescriber_note) einer Verordnung. Nur behandelnde Rollen (app.can_write_treatment_note), nicht am Selbstzahler, mit optimistischer Sperre. Protokolliert treatment_basis.updated ohne den Text (ABN-007, BEF-098, ANN-214).';

revoke all on function public.set_treatment_basis_clinical_note(uuid, text, timestamptz) from public, anon;
grant execute on function public.set_treatment_basis_clinical_note(uuid, text, timestamptz) to authenticated;

comment on column public.treatment_bases.prescriber_note is
  'Behandlungsrelevanter Hinweis aus der Verordnung (klinisch), etwa eine Belastungsgrenze. Seit ABN-007 wieder beschreibbar, nur ueber public.set_treatment_basis_clinical_note; lesbar in der klinischen Sicht (BEF-098, ANN-214).';
