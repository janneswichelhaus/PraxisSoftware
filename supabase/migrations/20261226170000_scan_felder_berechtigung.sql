-- Felder vom Foto einer Verordnung über das AI Gateway (ANN-861, ADR-005 Punkt 3): Die Datenbank
-- sagt dem Gateway nur Ja oder Nein. Hinaus darf nur ein offener Verordnungsscan, und nur mit der
-- Prüfsumme seiner abgelegten Bytes - nie ein Foto der Person (ADR-017 Punkt 39).
create function public.check_prescription_scan_access(p_file_id uuid, p_checksum text)
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
  -- Erst die Rolle, dann die Eingabe (ADR-023 Punkt 21): übertragen darf, wer Grundlagen schreibt.
  if not app.can_write_treatment_bases() then
    perform app.record_denied_read(v_actor, 'patient_file.fields_proposed',
                                   'not allowed to propose prescription fields');
    return false;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    return false;
  end if;
  -- Offen heißt: bestätigt, noch an keiner Grundlage - wie in assign_prescription_scan.
  return exists (
    select 1
    from public.patient_files f
    where f.id = p_file_id
      and f.organization_id = v_org
      and f.status = 'ready'
      and f.document_type = 'verordnungsscan'
      and f.treatment_basis_id is null
      and f.checksum_sha256 = p_checksum
  );
end;
$$;

revoke all on function public.check_prescription_scan_access(uuid, text) from public, anon;
grant execute on function public.check_prescription_scan_access(uuid, text) to authenticated;

comment on function public.check_prescription_scan_access(uuid, text) is
  'Darf die angemeldete Person aus diesem offenen Verordnungsscan vom AI Gateway Felder vorschlagen lassen (ANN-861, ADR-005, ADR-017 Punkt 39)? Aufgerufen nur vom Gateway mit dem Token der Person und der SHA-256 der empfangenen Bytes. Ohne Schreibrecht an Grundlagen false mit access.denied (patient_file.fields_proposed); sonst schreibt die Funktion nichts.';
