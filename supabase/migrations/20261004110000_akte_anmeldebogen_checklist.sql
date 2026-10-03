-- =============================================================================
-- AKTE-007: Erstaufnahme-Checkliste auf zwei Punkte (ANN-224 loest ANN-143 ab)
--
-- Jannes 2026-10-03: Die Checkliste enthaelt ausschliesslich den Anmeldebogen
-- und die Verordnungsgrundlage (Scan oder Foto). Der Anmeldebogen ist
-- Datenschutzinformation, Behandlungsvertrag und Kontaktdaten auf einem Blatt.
--
--   * ANMELDEBOGEN (registration_form) ersetzt den Punkt "privacy". Erledigt,
--     wenn die beiden Vermerke vorliegen, die das Blatt traegt:
--     Datenschutzinformation ausgehaendigt und Behandlungsvertrag
--     unterschrieben (PAT-006). Keine neue Spalte, keine neue Vermerkart: Das
--     Blatt ist noch nicht gestaltet, und die beiden Vermerke sind die eine
--     Stelle, an der sein Vorliegen schon heute steht.
--   * ENTFALLEN: Anamnesebogen, Befund und Behandlungsliege. Sie bleiben in der
--     Akte, wie sie sind (Reiter Doku), sind aber kein Punkt der Erstaufnahme
--     mehr. Die Liege behaelt ihren dritten Zustand "noch nicht entschieden"
--     (leer) - er ist eine Aussage der Akte, keine der Checkliste.
--   * VERORDNUNGSFOTO bleibt unveraendert, samt "entfaellt beim Selbstzahler".
--   * WER, MANDANT, PROTOKOLL: unveraendert - die oeffentlichen Funktionen
--     pruefen wie bisher; nur die eine Regelstelle app.intake_checklist und die
--     Reihenfolge in list_open_intakes aendern sich.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die Checkliste einer Person - die eine Stelle der Regeln (ANN-224)
--
-- item:  prescription_photo, registration_form
-- state: done, open, not_needed
-- -----------------------------------------------------------------------------
create or replace function app.intake_checklist(p_org uuid, p_patient_id uuid)
returns table (item text, state text)
language sql
stable
security definer
set search_path = ''
as $$
  -- ANN-143 (unveraendert): Verordnungsfoto. Erledigt mit einem Scan an der
  -- Person (auch einem noch nicht zugeordneten). Entfaellt, wenn alle
  -- Grundlagen Selbstzahler sind - dann gibt es kein Blatt.
  select 'prescription_photo',
         case
           when exists (
             select 1 from public.patient_files f
             where f.patient_id = p_patient_id and f.organization_id = p_org
               and f.document_type = 'verordnungsscan' and f.status = 'ready'
           ) then 'done'
           when exists (
             select 1 from public.treatment_bases tb
             where tb.patient_id = p_patient_id and tb.organization_id = p_org
           ) and not exists (
             select 1 from public.treatment_bases tb
             where tb.patient_id = p_patient_id and tb.organization_id = p_org
               and tb.treatment_basis_kind <> 'self_pay'
           ) then 'not_needed'
           else 'open'
         end
  union all
  -- ANN-224: Anmeldebogen - Datenschutzinformation ausgehaendigt und
  -- Behandlungsvertrag unterschrieben. Einwilligungen fuer Mail, Bericht und
  -- Fotos sind freiwillig und deshalb kein Punkt der Liste.
  select 'registration_form',
         case when exists (
           select 1 from public.patient_privacy_records v
           where v.patient_id = p_patient_id and v.organization_id = p_org
             and v.record_kind = 'privacy_notice_handed_out'
         ) and exists (
           select 1 from public.patient_privacy_records v
           where v.patient_id = p_patient_id and v.organization_id = p_org
             and v.record_kind = 'treatment_contract_signed'
         ) then 'done' else 'open' end
$$;

comment on function app.intake_checklist(uuid, uuid) is
  'Die zwei Punkte der Erstaufnahme einer Person, abgeleitet aus der Akte (AKTE-007, ANN-224): Verordnungsfoto und Anmeldebogen; done, open oder not_needed. Keine Pruefung der Rolle - das tun die Aufrufer.';

-- Die Befundregionen zaehlten nur fuer den entfallenen Punkt "Befund".
drop function app.intake_finding_instruments();

-- -----------------------------------------------------------------------------
-- 2. Die Liste: dieselbe Funktion, die neue Reihenfolge der Punkte
-- -----------------------------------------------------------------------------
create or replace function public.list_open_intakes()
returns table (
  patient_id          uuid,
  patient_given_name  text,
  patient_family_name text,
  open_items          text[]
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
  if not app.can_read_patient_directory() then
    perform app.record_denied_read(auth.uid(), 'patient_directory.read', 'not allowed to read open intakes');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read open intakes' using errcode = '42501';
  end if;

  return query
  select pa.id,
         pe.given_name,
         pe.family_name,
         offen.items
  from public.patients pa
  join public.persons pe on pe.id = pa.person_id
  cross join lateral (
    select array_agg(c.item order by c.ord) as items
    from (
      select k.item, k.state,
             array_position(array['prescription_photo', 'registration_form'], k.item) as ord
      from app.intake_checklist(v_org, pa.id) k
    ) c
    where c.state = 'open'
  ) offen
  where pa.organization_id = v_org
    and pa.status = 'active'
    and pa.care_concluded_on is null
    and offen.items is not null
  order by pe.family_name, pe.given_name, pa.id;
end;
$$;

comment on function public.list_open_intakes() is
  'Personen in Versorgung mit offenen Punkten der Erstaufnahme (AKTE-007, ANN-224), je Person die offenen Punkte in fester Reihenfolge. Die vier Praxisrollen; ein abgewiesener Versuch wird als patient_directory.read protokolliert.';
