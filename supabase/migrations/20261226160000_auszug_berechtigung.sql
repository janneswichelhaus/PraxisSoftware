-- Verlauf in Auszügen über das AI Gateway (ANN-861, ADR-005 Punkt 3): Die Datenbank sagt dem
-- Gateway nur Ja oder Nein. Gelesen hat die Einträge schon die Akte, mit ihrer Protokollierung;
-- hier geht es allein darum, ob ihr Wortlaut für eine Auswahl zum Gateway gehen darf.
create function public.check_history_excerpt_access(p_patient_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_org   uuid;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- Erst die Rolle, dann die Eingabe (ADR-023 Punkt 21). Wer behandelt, bereitet vor; das
  -- Leserecht des Büros reicht dafür nicht.
  if not app.can_write_treatment_note() then
    perform app.record_denied_read(v_actor, 'treatment_note.excerpted',
                                   'not allowed to excerpt treatment documentation');
    return false;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    return false;
  end if;
  return exists (
    select 1
    from public.patients p
    where p.id = p_patient_id
      and p.organization_id = v_org
  );
end;
$$;

revoke all on function public.check_history_excerpt_access(uuid) from public, anon;
grant execute on function public.check_history_excerpt_access(uuid) to authenticated;

comment on function public.check_history_excerpt_access(uuid) is
  'Darf die angemeldete Person aus den Einträgen dieser Akte vom AI Gateway Sätze auswählen lassen (ANN-861, ADR-005)? Aufgerufen nur vom Gateway mit dem Token der Person. Ohne Schreibrecht an der Dokumentation false mit access.denied (treatment_note.excerpted); sonst schreibt die Funktion nichts.';
