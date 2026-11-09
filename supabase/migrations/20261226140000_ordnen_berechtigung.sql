-- Ordnen getippter Notizen über das AI Gateway (ANN-861, ADR-005 Punkt 3): Die Datenbank sagt
-- dem Gateway nur Ja oder Nein, mit dem Token der Person. Wer nicht dokumentieren darf, steht als
-- access.denied im Protokoll (ADR-010 Punkt 16); ein erlaubter Aufruf schreibt nichts.
create function public.check_note_arrangement_access(p_appointment_id uuid)
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
  -- Erst die Rolle, dann die Eingabe (ADR-023 Punkt 21).
  if not app.can_write_treatment_note() then
    perform app.record_denied_read(v_actor, 'treatment_note.arranged',
                                   'not allowed to arrange treatment documentation');
    return false;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    return false;
  end if;
  return exists (
    select 1
    from public.appointments a
    where a.id = p_appointment_id
      and a.organization_id = v_org
      and a.kind = 'therapy'
      and a.status not in ('cancelled', 'no_show')
  );
end;
$$;

revoke all on function public.check_note_arrangement_access(uuid) from public, anon;
grant execute on function public.check_note_arrangement_access(uuid) to authenticated;

comment on function public.check_note_arrangement_access(uuid) is
  'Darf die angemeldete Person getippte Notizen zu diesem Behandlungstermin vom AI Gateway ordnen lassen (ANN-861, ADR-005)? Aufgerufen nur vom Gateway mit dem Token der Person. Ohne Schreibrecht false mit access.denied (treatment_note.arranged); sonst schreibt die Funktion nichts.';
