-- =============================================================================
-- BEF-131: Terminwuensche der Plattform ziehen beim Zusammenfuehren mit
-- (KOM-EPIC-001, Pruefung von merge_patients beim Einbau der Rueckfragen)
--
-- `platform_appointment_requests` (POR-009) haengt mit `on delete cascade` an
-- der Akte. `merge_patients` haengte die Wuensche nicht um; ein offener oder
-- beantworteter Terminwunsch der Dublette fiel mit ihr still weg.
--
-- Jetzt wie die Rueckfragen (KOM-004): Bezug und Verhaeltnis wechseln zur
-- bleibenden Akte, sonst bleibt der Wunsch unveraendert (Tage, Zustand,
-- Antwort, Urheber). Kein Riegel an der Tabelle, keine neue Sperre im Plan.
-- Rechte und Rueckgabe unveraendert; Rumpf sonst unveraendert aus
-- 20261020120000_kom_004_messages_in_record.sql.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.merge_patients(p_source_patient_id uuid, p_target_patient_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor       uuid;
  v_org         uuid;
  v_plan        jsonb;
  v_quelle      public.patients%rowtype;
  v_ziel        public.patients%rowtype;
  v_person      uuid;
  v_status      text;
  v_ende_on     date;
  v_ende_at     timestamptz;
  v_ende_by     uuid;
  v_beginn      date;
  v_anschrift   boolean;
  v_fotos       integer := 0;
  v_sperre      uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_merge_patients() then
    perform app.record_denied_write(v_actor, 'patient.merged', 'not allowed to merge patients');
    return null;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to merge patients' using errcode = '42501';
  end if;

  if p_source_patient_id is not distinct from p_target_patient_id then
    raise exception 'a patient cannot be merged into itself' using errcode = '22023';
  end if;

  -- Beide Akten sperren, in fester Reihenfolge - zwei gleichzeitige Vorgaenge
  -- ueber dasselbe Paar warten aufeinander statt sich zu verklemmen.
  perform 1 from public.patients p
  where p.id in (p_source_patient_id, p_target_patient_id)
    and p.organization_id = v_org
  order by p.id
  for update;

  select * into v_quelle from public.patients p
  where p.id = p_source_patient_id and p.organization_id = v_org;
  select * into v_ziel from public.patients p
  where p.id = p_target_patient_id and p.organization_id = v_org;
  if v_quelle.id is null or v_ziel.id is null then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  v_plan := app.patient_merge_plan(v_org, v_quelle.id, v_ziel.id);
  if jsonb_array_length(v_plan -> 'blockers') > 0 then
    raise exception 'patient merge blocked: %',
      (select string_agg(x, ', ') from jsonb_array_elements_text(v_plan -> 'blockers') x)
      using errcode = '22023';
  end if;

  -- Was vor dem Zusammenfuehren schon faellig war, faellt unter dem Stand, der
  -- es faellig gemacht hat (ADR-017 Punkt 36 und 38).
  v_fotos := v_fotos + app.delete_due_patient_photos(
    v_org, v_quelle.id, extensions.gen_random_uuid(), v_actor, 'patient_merged'
  );
  v_fotos := v_fotos + app.delete_due_patient_photos(
    v_org, v_ziel.id, extensions.gen_random_uuid(), v_actor, 'patient_merged'
  );

  -- Die Zahlen des Nachweises erst jetzt: Ein eben geloeschtes Foto ist
  -- nicht mitgewandert und steht schon in photos_deleted.
  v_plan := app.patient_merge_plan(v_org, v_quelle.id, v_ziel.id);

  perform pg_catalog.set_config('app.patient_merge', 'on', true);

  -- Stammdaten (ANN-147) --------------------------------------------------
  if exists (select 1 from public.patient_contact_details c where c.patient_id = v_ziel.id) then
    select coalesce(z.street, z.house_number, z.postal_code, z.city) is null
       and coalesce(q.street, q.house_number, q.postal_code, q.city) is not null
      into v_anschrift
    from public.patient_contact_details z
    left join public.patient_contact_details q on q.patient_id = v_quelle.id
    where z.patient_id = v_ziel.id;

    update public.patient_contact_details z
       set date_of_birth = coalesce(z.date_of_birth, q.date_of_birth),
           email         = coalesce(z.email, q.email),
           phone         = coalesce(z.phone, q.phone),
           phone_mobile  = coalesce(z.phone_mobile, q.phone_mobile),
           phone_work    = coalesce(z.phone_work, q.phone_work),
           institution   = coalesce(z.institution, q.institution),
           street        = case when v_anschrift then q.street else z.street end,
           house_number  = case when v_anschrift then q.house_number else z.house_number end,
           postal_code   = case when v_anschrift then q.postal_code else z.postal_code end,
           city          = case when v_anschrift then q.city else z.city end
      from public.patient_contact_details q
     where z.patient_id = v_ziel.id
       and q.patient_id = v_quelle.id;

    -- Zweiter Schritt, weil der Trigger die Koordinate bei jeder
    -- Adressaenderung leert: Die Anschrift kommt mit ihrer Verortung.
    if v_anschrift then
      update public.patient_contact_details z
         set lat = q.lat, lon = q.lon, geocode_precision = q.geocode_precision
        from public.patient_contact_details q
       where z.patient_id = v_ziel.id
         and q.patient_id = v_quelle.id;
    end if;
  else
    update public.patient_contact_details
       set patient_id = v_ziel.id
     where patient_id = v_quelle.id;
  end if;

  if exists (select 1 from public.patient_care_details d where d.patient_id = v_ziel.id) then
    update public.patient_care_details z
       set primary_therapist_staff_member_id =
             coalesce(z.primary_therapist_staff_member_id, q.primary_therapist_staff_member_id),
           treatment_table_required = coalesce(z.treatment_table_required, q.treatment_table_required),
           home_visit_access_note = app.merge_note(z.home_visit_access_note, q.home_visit_access_note),
           special_note           = app.merge_note(z.special_note, q.special_note),
           remark                 = app.merge_note(z.remark, q.remark),
           take_along_items       = app.merge_take_along(z.take_along_items, q.take_along_items)
      from public.patient_care_details q
     where z.patient_id = v_ziel.id
       and q.patient_id = v_quelle.id;
  else
    update public.patient_care_details
       set patient_id = v_ziel.id
     where patient_id = v_quelle.id;
  end if;

  -- Der Bezug wechselt ----------------------------------------------------
  -- Zwei Standardempfaenger kann es nicht geben; der der bleibenden Akte bleibt.
  if exists (
    select 1 from public.invoice_recipients r where r.patient_id = v_ziel.id and r.is_default
  ) then
    update public.invoice_recipients
       set is_default = false
     where patient_id = v_quelle.id and is_default;
  end if;

  update public.invoice_recipients           set patient_id = v_ziel.id where patient_id = v_quelle.id;
  -- ABR-030: Die Honorarvereinbarungen ziehen mit; gleiche Tage sperrt der Plan.
  update public.patient_fee_agreements       set patient_id = v_ziel.id where patient_id = v_quelle.id;
  -- ANG-001: Das Nachsorge-Abo zieht mit; sich ueberschneidende sperrt der Plan.
  update public.aftercare_subscriptions      set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.training_offers              set patient_id = v_ziel.id where patient_id = v_quelle.id;
  -- UEB-004: Die Behandlungsplaene ziehen mit; der Riegel laesst nur patient_id wechseln.
  update public.exercise_plans               set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.treatment_bases              set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.appointments                 set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.billable_services            set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.invoices                     set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.patient_files                set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.patient_privacy_records      set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.patient_questionnaire_responses set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.patient_course_events        set patient_id = v_ziel.id where patient_id = v_quelle.id;
  -- KOM-004: Rueckfragen ueber die Plattform ziehen mit, zugeordnete wie
  -- nicht zugeordnete - sonst fielen sie mit der Dublette (cascade). Der
  -- Riegel an der Zuordnung laesst das Verhaeltnis nur hier wechseln.
  update public.platform_messages
     set patient_id = v_ziel.id, relationship_id = v_ziel.id
   where patient_id = v_quelle.id;
  -- BEF-131: Terminwuensche ueber die Plattform ziehen mit, offene wie
  -- beantwortete - sonst fielen sie mit der Dublette (cascade). Der
  -- Plattformzugang der Dublette bleibt als Nachweis (set null, BEF-132).
  update public.platform_appointment_requests
     set patient_id = v_ziel.id, relationship_id = v_ziel.id
   where patient_id = v_quelle.id;
  update public.therapy_reports              set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.tasks                        set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.waitlist_entries             set patient_id = v_ziel.id where patient_id = v_quelle.id;
  -- Ein Legal Hold folgt den Daten, die er schuetzt (ANN-150). Seit ABN-018
  -- (BEF-108) bleiben alle Gruende wirksam: Eine Akte kann mehrere aktive
  -- Sperren tragen, keine wird beim Zusammenfuehren aufgehoben.
  v_sperre := null;
  update public.legal_holds
     set subject_id = v_ziel.id
   where subject_type = 'patient' and subject_id = v_quelle.id;
  -- Fruehere Nachweise der Dublette ziehen mit (ABN-018).
  update public.patient_merge_records set target_patient_id = v_ziel.id
   where target_patient_id = v_quelle.id;

  perform pg_catalog.set_config('app.patient_merge', 'off', true);

  -- Versorgungsstand (ANN-148) --------------------------------------------
  v_status := case
    when v_quelle.status = 'active' or v_ziel.status = 'active' then 'active'
    else 'inactive'
  end;
  v_beginn := least(v_quelle.care_started_on, v_ziel.care_started_on);

  if v_quelle.care_concluded_on is null or v_ziel.care_concluded_on is null then
    null;
  elsif (v_quelle.care_concluded_on, v_quelle.care_concluded_at)
        > (v_ziel.care_concluded_on, v_ziel.care_concluded_at) then
    v_ende_on := v_quelle.care_concluded_on;
    v_ende_at := v_quelle.care_concluded_at;
    v_ende_by := v_quelle.care_concluded_by;
  else
    v_ende_on := v_ziel.care_concluded_on;
    v_ende_at := v_ziel.care_concluded_at;
    v_ende_by := v_ziel.care_concluded_by;
  end if;

  update public.patients
     set status            = v_status,
         care_started_on   = v_beginn,
         care_concluded_on = v_ende_on,
         care_concluded_at = v_ende_at,
         care_concluded_by = v_ende_by
   where id = v_ziel.id;

  -- Die Einwilligungsvermerke beider Akten gelten jetzt gemeinsam: Ein
  -- Widerruf in der einen trifft die aelteren Fotos der anderen - sofort,
  -- wie beim Widerruf selbst (ADR-017 Punkt 36).
  v_fotos := v_fotos + app.delete_due_patient_photos(
    v_org, v_ziel.id, extensions.gen_random_uuid(), v_actor, 'patient_merged'
  );

  -- Die leere Akte faellt (ANN-150) -----------------------------------------
  -- Was noch an ihr haengt, faellt mit ihr (Kontakt und Versorgungsangaben der
  -- Dublette, soweit sie in die bleibende Akte eingeflossen sind).
  delete from public.patient_contact_details where patient_id = v_quelle.id;
  delete from public.patient_care_details where patient_id = v_quelle.id;
  delete from public.patients where id = v_quelle.id;

  -- Die Person nur, wenn nichts anderes an ihr haengt: Mitarbeiter:in, Konto,
  -- Trainingsverhaeltnis (ADR-021) bleiben, wie sie sind.
  v_person := v_quelle.person_id;
  if not exists (select 1 from public.patients p where p.person_id = v_person)
     and not exists (select 1 from public.staff_members s where s.person_id = v_person)
     and not exists (select 1 from public.user_profiles u where u.person_id = v_person)
     and not exists (select 1 from public.training_relationships t where t.person_id = v_person) then
    delete from public.persons where id = v_person;
  end if;

  -- Nachweis an der bleibenden Akte, so lange wie sie (ABN-018, BEF-108):
  -- nicht allein im dreijaehrigen Auditlog.
  insert into public.patient_merge_records (
    organization_id, target_patient_id, source_patient_id, merged_by, counts, photos_deleted
  )
  values (v_org, v_ziel.id, v_quelle.id, v_actor, v_plan -> 'counts', v_fotos);


  return jsonb_build_object(
    'target_patient_id', v_ziel.id,
    'moved', v_plan -> 'counts',
    'photos_deleted', v_fotos
  );
end;
$function$;
