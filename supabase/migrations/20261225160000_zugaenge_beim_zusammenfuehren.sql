-- Zusammenführen (ANN-753, L-A4 der Tiefenanalyse): Ein beendeter Plattformzugang der Dublette zieht
-- samt Verhältnis auf die bleibende Akte, statt den Bezug zu verlieren (set null). So steht er in deren
-- Auskunft. Ein laufender Zugang sperrt das Zusammenführen weiter.

create or replace function app.platform_accesses_guard()
returns trigger
language plpgsql security definer
set search_path to ''
as $$
declare
  v_person uuid;
begin
  -- Faellt das Verhaeltnis (on delete set null), endet der Zugang, und seine
  -- Einladungen verlieren die Adresse (ADR-023 Punkt 5).
  if tg_op = 'UPDATE'
     and new.patient_id is null and new.training_relationship_id is null
     and (old.patient_id is not null or old.training_relationship_id is not null) then
    if new.status <> 'revoked' then
      new.status := 'revoked';
      new.revoked_at := now();
      new.revoked_by := null;
      new.revoked_reason := 'relationship_deleted';
      new.locked_at := null;
      new.locked_by := null;
    end if;
    update public.platform_access_invitations i
       set email = null,
           status = case when i.status = 'pending' then 'revoked' else i.status end,
           revoked_at = case when i.status = 'pending' then now() else i.revoked_at end
     where i.platform_access_id = new.id;
    -- Das Ende mit dem Verhaeltnis zeigt der Zugang selbst (revoked_reason
    -- 'relationship_deleted', revoked_at); im Loeschlauf zaehlt retention.applied.
    return new;
  end if;

  -- Beim Zusammenführen zieht ein beendeter Zugang der Dublette samt Verhältnis auf die bleibende
  -- Akte (ANN-753); sonst bleibt beides fest. Einen laufenden sperrt der Plan.
  if tg_op = 'UPDATE' and app.patient_merge_active() and old.status = 'revoked'
     and old.relationship_kind = 'treatment' and new.relationship_id = new.patient_id
     and to_jsonb(new) - array['patient_id', 'relationship_id']
         = to_jsonb(old) - array['patient_id', 'relationship_id']
     and exists (select 1 from public.patients p
                  where p.id = new.patient_id and p.organization_id = old.organization_id) then
    return new;
  end if;

  -- Art und Nachweis eines Zugangs aendern sich nie. Ein anderer
  -- Umfang ist eine neue Einladung.
  if tg_op = 'UPDATE' and (
       new.access_kind is distinct from old.access_kind
       or new.legal_basis is distinct from old.legal_basis
       or new.representative_name is distinct from old.representative_name
       or new.proof_documents is distinct from old.proof_documents
       or new.consent_text_version is distinct from old.consent_text_version
       or new.consent_earlier_messages is distinct from old.consent_earlier_messages
       or new.health_scope is distinct from old.health_scope
       or new.finance_scope is distinct from old.finance_scope
       or new.proof_recorded_by is distinct from old.proof_recorded_by
       or new.proof_recorded_at is distinct from old.proof_recorded_at
       or new.consent_recorded_by is distinct from old.consent_recorded_by
       or new.consent_recorded_at is distinct from old.consent_recorded_at
       or new.relationship_kind is distinct from old.relationship_kind
       or new.organization_id is distinct from old.organization_id
       or new.relationship_id is distinct from old.relationship_id) then
    raise exception 'platform access kind and proof are fixed' using errcode = '23514';
  end if;

  if new.account_user_id is not null
     and (tg_op = 'INSERT' or new.account_user_id is distinct from old.account_user_id) then
    perform pg_advisory_xact_lock(hashtext('platform_account:' || new.account_user_id::text));

    if exists (select 1 from public.user_profiles up where up.id = new.account_user_id) then
      raise exception 'practice account cannot hold platform access' using errcode = '23514';
    end if;

    select r.person_id into v_person
    from app.platform_relationship(new.relationship_kind, new.relationship_id) r;

    perform pg_advisory_xact_lock(hashtext('platform_person:' || v_person::text));

    if new.access_kind = 'self' then
      if exists (
        select 1 from public.user_profiles up
        join public.user_roles ur on ur.user_id = up.id
        where up.person_id = v_person
      ) then
        raise exception 'person has a practice account' using errcode = '23514';
      end if;

      if exists (
        select 1
        from public.platform_accesses a
        cross join lateral app.platform_relationship(a.relationship_kind, a.relationship_id) r
        where a.id <> new.id
          and a.access_kind = 'self'
          and a.status <> 'revoked'
          and a.account_user_id is not null
          and a.account_user_id <> new.account_user_id
          and r.person_id = v_person
      ) then
        raise exception 'person already has another account' using errcode = '23514';
      end if;

      if exists (
        select 1
        from public.platform_accesses a
        cross join lateral app.platform_relationship(a.relationship_kind, a.relationship_id) r
        where a.account_user_id = new.account_user_id
          and a.id <> new.id
          and a.access_kind = 'self'
          and a.status <> 'revoked'
          and r.person_id is distinct from v_person
      ) then
        raise exception 'account belongs to another person' using errcode = '23514';
      end if;

      -- Wer diese Person vertritt, ist nicht diese Person.
      if exists (
        select 1
        from public.platform_accesses a
        cross join lateral app.platform_relationship(a.relationship_kind, a.relationship_id) r
        where a.account_user_id = new.account_user_id
          and a.id <> new.id
          and a.access_kind <> 'self'
          and a.status <> 'revoked'
          and r.person_id = v_person
      ) then
        raise exception 'account represents this person' using errcode = '23514';
      end if;
    else
      -- Eine Vertretung ist nie das Konto der vertretenen Person
      -- (Punkt 13: "Gehoert das Konto nicht zur Person des Verhaeltnisses").
      if exists (
        select 1
        from public.platform_accesses a
        cross join lateral app.platform_relationship(a.relationship_kind, a.relationship_id) r
        where a.account_user_id = new.account_user_id
          and a.id <> new.id
          and a.access_kind = 'self'
          and a.status <> 'revoked'
          and r.person_id = v_person
      ) then
        raise exception 'account belongs to the represented person' using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function app.merge_patients_core(p_org uuid, p_source uuid, p_target uuid, p_actor uuid, p_merged_at timestamp with time zone, p_nachziehen boolean)
returns jsonb
language plpgsql security definer
set search_path to ''
as $$
declare
  v_plan      jsonb;
  v_quelle    public.patients%rowtype;
  v_ziel      public.patients%rowtype;
  v_person    uuid;
  v_status    text;
  v_ende_on   date;
  v_ende_at   timestamptz;
  v_ende_by   uuid;
  v_beginn    date;
  v_anschrift boolean;
  v_fotos     integer := 0;
  v_pause     text := coalesce(current_setting('app.journal_paused', true), '');
begin
  -- Beide Akten sperren, in fester Reihenfolge: Zwei gleichzeitige Vorgänge über dasselbe Paar
  -- warten aufeinander statt sich zu verklemmen.
  perform 1 from public.patients p
  where p.id in (p_source, p_target)
    and p.organization_id = p_org
  order by p.id
  for update;
  -- Dieselbe Sperre je Person wie beim Anlegen eines Ernährungsprofils, nach den Zeilensperren:
  -- So entsteht zwischen Plan und Umzug keine zweite laufende Beratung (ADR-027 Punkt 1).
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('nutrition:' || p.person_id::text, 0))
  from public.patients p
  where p.id in (p_source, p_target)
    and p.organization_id = p_org
  order by p.person_id;

  select * into v_quelle from public.patients p
  where p.id = p_source and p.organization_id = p_org;
  select * into v_ziel from public.patients p
  where p.id = p_target and p.organization_id = p_org;
  if v_quelle.id is null or v_ziel.id is null then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  v_plan := app.patient_merge_plan(p_org, v_quelle.id, v_ziel.id);
  if jsonb_array_length(v_plan -> 'blockers') > 0 then
    raise exception 'patient merge blocked: %',
      (select string_agg(x, ', ') from jsonb_array_elements_text(v_plan -> 'blockers') x)
      using errcode = '22023';
  end if;

  -- Die Dublette fällt als Zusammenführung, nicht als Löschung (ANN-150): Der Auslöser des
  -- Journals schweigt; fällige Fotos tragen ihre Einträge selbst ein.
  perform pg_catalog.set_config('app.journal_paused', 'on', true);

  -- Was vor dem Zusammenführen schon fällig war, fällt unter dem Stand, der es fällig gemacht hat
  -- (ADR-017 Punkt 36 und 38).
  v_fotos := v_fotos + app.delete_due_patient_photos(
    p_org, v_quelle.id, extensions.gen_random_uuid(), p_actor, 'patient_merged'
  );
  v_fotos := v_fotos + app.delete_due_patient_photos(
    p_org, v_ziel.id, extensions.gen_random_uuid(), p_actor, 'patient_merged'
  );

  -- Die Zahlen des Nachweises erst jetzt: Ein eben gelöschtes Foto ist nicht mitgewandert.
  v_plan := app.patient_merge_plan(p_org, v_quelle.id, v_ziel.id);

  perform pg_catalog.set_config('app.patient_merge', 'on', true);

  -- Stammdaten (ANN-147)
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

    -- Zweiter Schritt, weil der Auslöser die Koordinate bei jeder Adressänderung leert: Die
    -- Anschrift kommt mit ihrer Verortung.
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

  -- Der Bezug wechselt. Zwei Standardempfänger gibt es nicht; der der bleibenden Akte bleibt.
  if exists (
    select 1 from public.invoice_recipients r where r.patient_id = v_ziel.id and r.is_default
  ) then
    update public.invoice_recipients
       set is_default = false
     where patient_id = v_quelle.id and is_default;
  end if;

  -- Was überlappt (Vereinbarungen, Abos, laufende Beratungen, Entwürfe), sperrt schon der Plan.
  update public.invoice_recipients           set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.patient_fee_agreements       set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.aftercare_subscriptions      set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.training_offers              set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.exercise_plans               set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.treatment_bases              set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.appointments                 set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.billable_services            set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.invoices                     set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.patient_files                set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.patient_privacy_records      set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.patient_questionnaire_responses set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.patient_course_events        set patient_id = v_ziel.id where patient_id = v_quelle.id;
  -- Rückfragen, Terminwünsche, Check-ins, Gewohnheiten und Ernährungsprofile ziehen samt
  -- Verhältnis mit, sonst fielen sie mit der Dublette (cascade).
  update public.platform_messages
     set patient_id = v_ziel.id, relationship_id = v_ziel.id
   where patient_id = v_quelle.id;
  update public.platform_appointment_requests
     set patient_id = v_ziel.id, relationship_id = v_ziel.id
   where patient_id = v_quelle.id;
  update public.checkins
     set patient_id = v_ziel.id, relationship_id = v_ziel.id
   where patient_id = v_quelle.id;
  -- Den Takt behält die bleibende Akte; hat sie keinen, zieht der der Dublette mit (ANN-350).
  if exists (select 1 from public.checkin_schedules s where s.patient_id = v_ziel.id) then
    delete from public.checkin_schedules where patient_id = v_quelle.id;
  else
    update public.checkin_schedules
       set patient_id = v_ziel.id, relationship_id = v_ziel.id
     where patient_id = v_quelle.id;
  end if;
  -- Mehr als drei laufende Gewohnheiten sind danach möglich; die Grenze gilt beim Eintragen
  -- (ANN-370).
  update public.habits
     set patient_id = v_ziel.id, relationship_id = v_ziel.id
   where patient_id = v_quelle.id;
  -- Ernährungsprofile ohne Zähler im Vermerk: Den lesen auch Rollen ohne die Fähigkeit (ADR-027
  -- Punkt 4).
  update public.nutrition_profiles
     set patient_id = v_ziel.id, relationship_id = v_ziel.id
   where patient_id = v_quelle.id;
  -- Beendete Zugänge ziehen mit, sonst stünden sie in keiner Auskunft (ANN-753); ihre Einladungen
  -- hängen am Zugang. Einen laufenden sperrt der Plan.
  update public.platform_accesses
     set patient_id = v_ziel.id, relationship_id = v_ziel.id
   where patient_id = v_quelle.id;
  update public.therapy_reports              set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.tasks                        set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.waitlist_entries             set patient_id = v_ziel.id where patient_id = v_quelle.id;
  -- Ein Legal Hold folgt den Daten, die er schützt; alle Gründe bleiben wirksam (ANN-150).
  update public.legal_holds
     set subject_id = v_ziel.id
   where subject_type = 'patient' and subject_id = v_quelle.id;
  -- Frühere Nachweise der Dublette ziehen mit.
  update public.patient_merge_records set target_patient_id = v_ziel.id
   where target_patient_id = v_quelle.id;

  perform pg_catalog.set_config('app.patient_merge', 'off', true);

  -- Versorgungsstand (ANN-148)
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

  -- Die Einwilligungsvermerke beider Akten gelten jetzt gemeinsam: Ein Widerruf in der einen trifft
  -- die älteren Fotos der anderen, sofort wie beim Widerruf selbst (ADR-017 Punkt 36).
  v_fotos := v_fotos + app.delete_due_patient_photos(
    p_org, v_ziel.id, extensions.gen_random_uuid(), p_actor, 'patient_merged'
  );

  -- Die leere Akte fällt samt Kontakt und Versorgungsangaben, soweit sie eingeflossen sind; die
  -- Person nur, wenn nichts anderes an ihr hängt (ANN-150).
  delete from public.patient_contact_details where patient_id = v_quelle.id;
  delete from public.patient_care_details where patient_id = v_quelle.id;
  delete from public.patients where id = v_quelle.id;

  v_person := v_quelle.person_id;
  if not exists (select 1 from public.patients p where p.person_id = v_person)
     and not exists (select 1 from public.staff_members s where s.person_id = v_person)
     and not exists (select 1 from public.user_profiles u where u.person_id = v_person)
     and not exists (select 1 from public.training_relationships t where t.person_id = v_person) then
    delete from public.persons where id = v_person;
  end if;

  perform pg_catalog.set_config('app.journal_paused', v_pause, true);

  -- Nachweis an der bleibenden Akte, so lange wie sie: nicht allein im Auditlog.
  insert into public.patient_merge_records (
    organization_id, target_patient_id, source_patient_id, merged_by, counts, photos_deleted,
    merged_at
  )
  values (p_org, v_ziel.id, v_quelle.id, p_actor, v_plan -> 'counts', v_fotos, p_merged_at);

  -- Und im Löschjournal, das eine Wiederherstellung überdauert; beim Nachziehen steht er schon.
  if not p_nachziehen then
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at, merged_into)
    values (p_org, extensions.gen_random_uuid(), 'patients', v_quelle.id, 'patientenakte', now(),
            v_ziel.id);
  end if;

  return jsonb_build_object(
    'target_patient_id', v_ziel.id,
    'moved', v_plan -> 'counts',
    'photos_deleted', v_fotos
  );
end;
$$;

update public.data_registry
   set merge_mode = 'repoint',
       decision_note = 'Ein laufender Zugang der Dublette sperrt das Zusammenführen (BEF-132); ein '
                       || 'beendeter zieht samt Verhältnis auf die bleibende Akte und steht in deren '
                       || 'Auskunft (ANN-753).'
 where table_name = 'platform_accesses';
