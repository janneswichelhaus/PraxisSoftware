-- =============================================================================
-- PRX-015: Dublettenpruefung beim Anlegen (PRX-EPIC-003, IDEA-PRX-018)
--
-- Beim Anlegen einer Person weist die Anwendung auf moegliche Dubletten hin -
-- sie sperrt nicht. Zwei Akten fuer dieselbe Person sind teuer: Termine,
-- Dokumentation und Rechnungen verteilen sich, und das Zusammenfuehren
-- (PRX-EPIC-003b) beruehrt Unveraenderbares.
--
--   * DIE REGEL (ANN-145): gleicher Nachname UND (gleiches Geburtsdatum ODER
--     gleicher Vorname), verglichen in der Suchform (app.suchform: klein, ohne
--     Akzente, Umlaute aufgeloest). Eine Stelle, reversibel.
--   * NUR EIN HINWEIS. Die Serverfunktion create_patient bleibt, wie sie ist;
--     wer nach dem Hinweis anlegt, legt an. Namensgleiche gibt es.
--   * WER: wie die Kartei (app.can_read_patient_directory) - der Hinweis zeigt
--     nichts, was die Suche nicht auch zeigt: Name, Geburtsdatum, Status. Wie
--     die Trefferliste der Suche nicht auditiert (ADR-010: Oeffnen der Akte
--     ja, Trefferliste nein); ein abgewiesener Versuch schon.
-- =============================================================================

create function public.find_possible_duplicates(
  p_given_name    text,
  p_family_name   text,
  p_date_of_birth date default null
)
returns table (
  id            uuid,
  given_name    text,
  family_name   text,
  date_of_birth date,
  status        text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_vorname text;
  v_name    text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_read_patient_directory() then
    perform app.record_denied_read(auth.uid(), 'patient_directory.read', 'not allowed to read patient directory');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read patient directory' using errcode = '42501';
  end if;

  v_vorname := app.suchform(btrim(coalesce(p_given_name, '')));
  v_name    := app.suchform(btrim(coalesce(p_family_name, '')));

  -- Ohne Nachnamen keine Aussage - und kein Orakel ueber den Bestand.
  if length(v_name) = 0 then
    return;
  end if;

  return query
    select p.id, pe.given_name, pe.family_name, pc.date_of_birth, p.status
    from public.patients p
    join public.persons pe on pe.id = p.person_id
    left join public.patient_contact_details pc on pc.patient_id = p.id
    where p.organization_id = v_org
      -- ANN-145: gleicher Nachname und (gleiches Geburtsdatum oder gleicher
      -- Vorname).
      and app.suchform(pe.family_name) = v_name
      and (
        (p_date_of_birth is not null and pc.date_of_birth = p_date_of_birth)
        or (length(v_vorname) > 0 and app.suchform(pe.given_name) = v_vorname)
      )
    order by (p.status = 'active') desc, pe.family_name, pe.given_name, p.id
    limit 5;
end;
$$;

comment on function public.find_possible_duplicates(text, text, date) is
  'Moegliche Dubletten beim Anlegen (PRX-015, ANN-145): gleicher Nachname und gleiches Geburtsdatum oder gleicher Vorname, in der Suchform. Hoechstens fuenf, nur Name, Geburtsdatum und Status. Rollen wie die Kartei; ein abgewiesener Versuch wird als patient_directory.read protokolliert.';

revoke all on function public.find_possible_duplicates(text, text, date) from public, anon;
grant execute on function public.find_possible_duplicates(text, text, date) to authenticated;
