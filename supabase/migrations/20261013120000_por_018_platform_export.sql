-- =============================================================================
-- POR-018: Datenexport als Funktion (IDEA-QSN-003; ADR-023 Punkte 12, 13, 19,
-- 22, 24; ADR-010 Punkt 16 "Exporte: Auskunft nach Art. 15"; DSN-001 4.1)
--
-- Die Person laedt ihre Daten selbst herunter, maschinenlesbar (JSON). Die
-- lesbare Fassung baut die Seite aus derselben Antwort.
--
-- WAS drin steht: genau das, was die Plattform der Person zeigt - und zwar
-- AUS DEN PLATTFORMPROJEKTIONEN SELBST. Jede Projektion hat ihre feste
-- Feldliste (Punkt 22); der Export setzt sie nur zusammen und hat keine
-- eigene. Dazu die Stammdaten des Verhaeltnisses, die die Person der Praxis
-- gegeben hat (Name, Geburtsdatum, Anschrift, Telefon, E-Mail). Keine
-- Befunde, keine Dokumentation, keine internen Notizen, keine Fotos, keine
-- Koordinaten. Die Plattform ist keine Akteneinsicht (Punkt 12): Die Kopie
-- der Akte nach Art. 15 Abs. 3 bzw. Par. 630g BGB bleibt der Weg in der Praxis
-- (export_patient_record, OPS-006). Die Seite sagt das.
--
-- WER: die Person selbst und ihre rechtliche Vertretung (Recht `export`), nie
-- die Begleitung (Punkt 13). Nur waehrend der Lesezeit: Nach der Lesefrist
-- zeigen die Projektionen nichts mehr, und eine Auskunft gibt die Praxis
-- (ANN-261 Fassung 2).
--
-- PROTOKOLL: jeder Export als `patient_record.exported` (ADR-010 Punkt 16,
-- "Exporte: Auskunft nach Art. 15") mit Akteur Plattformkonto bzw. Vertretung,
-- Gegenstand das Verhaeltnis. Keine neue Aktion (ANN-265).
-- =============================================================================

create function public.platform_export(p_access_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang  public.platform_accesses%rowtype;
  v_person  jsonb;
  v_ergebnis jsonb;
begin
  if not app.platform_access_allows(p_access_id, 'export') then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;

  -- Die Stammdaten, die die Person der Praxis gegeben hat. Keine
  -- Einrichtung, keine Koordinaten (abgeleitet, nicht von ihr).
  if v_zugang.relationship_kind = 'treatment' then
    select jsonb_build_object(
             'given_name', pe.given_name,
             'family_name', pe.family_name,
             'date_of_birth', c.date_of_birth,
             'email', c.email,
             'phone', c.phone,
             'phone_mobile', c.phone_mobile,
             'phone_work', c.phone_work,
             'street', c.street,
             'house_number', c.house_number,
             'postal_code', c.postal_code,
             'city', c.city
           )
      into v_person
    from public.patients p
    join public.persons pe on pe.id = p.person_id
    left join public.patient_contact_details c on c.patient_id = p.id
    where p.id = v_zugang.relationship_id and p.organization_id = v_zugang.organization_id;
  else
    select jsonb_build_object(
             'given_name', pe.given_name,
             'family_name', pe.family_name,
             'date_of_birth', c.date_of_birth,
             'email', c.email,
             'phone', c.phone,
             'street', c.street,
             'house_number', c.house_number,
             'postal_code', c.postal_code,
             'city', c.city
           )
      into v_person
    from public.training_relationships t
    join public.persons pe on pe.id = t.person_id
    left join public.training_contact_details c on c.training_relationship_id = t.id
    where t.id = v_zugang.relationship_id and t.organization_id = v_zugang.organization_id;
  end if;

  v_ergebnis := jsonb_build_object(
    'format', 'plattform-export',
    'format_version', 1,
    'exported_at', now(),
    'organization', (select o.name from public.organizations o where o.id = v_zugang.organization_id),
    'relationship', v_zugang.relationship_kind,
    'exported_by', v_zugang.access_kind,
    'person', coalesce(v_person, '{}'::jsonb),
    'appointments', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
                     from public.platform_appointments(p_access_id) x),
    'appointment_requests', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
                             from public.platform_appointment_requests(p_access_id) x),
    'questionnaires', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
                       from public.platform_questionnaire(p_access_id) x),
    -- Rechnungen nur mit dem Recht billing - die Projektion prueft selbst.
    'invoices', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
                 from public.platform_invoices(p_access_id) x),
    -- Nur die Liste; jedes Dokument holt die Person einzeln (protokolliert).
    'documents', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
                  from public.platform_files(p_access_id) x),
    'consents', (select coalesce(jsonb_agg(to_jsonb(x) - 'can_grant'), '[]'::jsonb)
                 from public.platform_consents(p_access_id) x)
  );

  -- ANN-265: ein Eintrag je Export, wie die Auskunft in der Praxis.
  insert into public.audit_log (
    organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
  )
  values (
    v_zugang.organization_id, auth.uid(),
    case when v_zugang.access_kind = 'self' then 'platform' else 'representative' end,
    'patient_record.exported',
    case v_zugang.relationship_kind when 'treatment' then 'patient' else 'training_relationship' end,
    v_zugang.relationship_id, 'success',
    jsonb_build_object('surface', 'platform', 'purpose', 'platform_export',
                       'platform_access_id', v_zugang.id, 'access_kind', v_zugang.access_kind)
  );

  return v_ergebnis;
end;
$$;

revoke all on function public.platform_export(uuid) from public, anon;
grant execute on function public.platform_export(uuid) to authenticated;

comment on function public.platform_export(uuid) is
  'POR-018 (IDEA-QSN-003): die eigenen Daten der Plattform als JSON - zusammengesetzt aus den Plattformprojektionen (feste Feldlisten, ADR-023 Punkt 22) und den eigenen Stammdaten. Recht export (Person, rechtliche Vertretung), nie Begleitung; protokolliert als patient_record.exported (ANN-265). Keine Akteneinsicht.';
