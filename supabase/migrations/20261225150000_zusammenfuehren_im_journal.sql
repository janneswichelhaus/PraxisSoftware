-- Das Zusammenführen steht im Löschjournal (ANN-150 Fassung 3): ein Eintrag mit der bleibenden Akte
-- statt einer Löschung der Dublette. Kommt eine Sicherung von vor dem Zusammenführen zurück, führt das
-- Nachziehen die Dublette erneut zusammen, statt sie samt ihren Zeilen zu löschen.

alter table public.deletion_journal
  add column merged_into uuid,
  add constraint deletion_journal_merged_into_patients
    check (merged_into is null or target_table = 'patients');

comment on column public.deletion_journal.merged_into is
  'Bleibende Akte, wenn die Dublette zusammengeführt statt gelöscht wurde; das Nachziehen führt dann erneut zusammen (ANN-150).';

create function app.merge_patients_core(
  p_org        uuid,
  p_source     uuid,
  p_target     uuid,
  p_actor      uuid,
  p_merged_at  timestamptz,
  p_nachziehen boolean
)
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
  -- Der Plattformzugang der Dublette bleibt als Nachweis (set null).
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

comment on function app.merge_patients_core(uuid, uuid, uuid, uuid, timestamptz, boolean) is
  'Kern des Zusammenführens ohne Rollenprüfung: aus merge_patients und beim Nachziehen nach einer Wiederherstellung (ANN-150).';

revoke all on function app.merge_patients_core(uuid, uuid, uuid, uuid, timestamptz, boolean)
  from public, anon, authenticated, service_role;

create or replace function public.merge_patients(p_source_patient_id uuid, p_target_patient_id uuid)
returns jsonb
language plpgsql security definer
set search_path to ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
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

  return app.merge_patients_core(
    v_org, p_source_patient_id, p_target_patient_id, v_actor, now(), false
  );
end;
$$;

comment on function public.merge_patients(uuid, uuid) is
  'Führt eine Dublette in die bleibende Akte über (PRX-017, ANN-147 bis ANN-150): Bezüge wechseln, Inhalte nicht; die leere Akte fällt, ihre Person nur ohne andere Bezüge. Nur owner, abgewiesen mit denied-Eintrag und HTTP 403 (G6c). Steht im Löschjournal als Zusammenführung; das Nachziehen nach einem Restore führt erneut zusammen.';

create or replace function public.reapply_deletion_journal()
returns integer
language plpgsql security definer
set search_path to ''
as $$
declare
  v_tabelle    text;
  v_schluessel text;
  v_ids        uuid[];
  v_geloescht  uuid[];
  v_unbekannt  text[];
  v_gesamt     integer := 0;
  v_merge      public.deletion_journal%rowtype;
  v_person     uuid;
  v_ziel       uuid;
  v_weiter     uuid;
begin
  -- Was hier fällt, steht schon im Journal; der Auslöser schreibt nichts dazu.
  perform pg_catalog.set_config('app.journal_paused', 'on', true);

  select array_agg(distinct j.target_table)
    into v_unbekannt
  from public.deletion_journal j
  where j.target_table not in ('auth_users', 'team_message_contents')
    and not exists (
      select 1 from public.data_registry r
       where r.table_name = j.target_table and r.journal_mode = 'row');

  if v_unbekannt is not null then
    raise exception 'deletion journal references tables without a reapply order: %', v_unbekannt
      using errcode = '22023';
  end if;

  -- Die Reihenfolge steht im Register: Kinder vor ihren Eltern (data-registry.test.ts).
  for v_tabelle, v_schluessel in
    select t.tabelle, t.schluessel
      from (
        select r.table_name as tabelle, r.journal_key as schluessel, r.journal_rank::integer as rang
          from public.data_registry r
         where r.journal_mode = 'row'
        union all
        -- Nur der Inhalt fiel, die Nachricht blieb als Anker: vor den Nachrichten selbst.
        select 'team_message_contents', 'id', r.journal_rank - 1
          from public.data_registry r
         where r.table_name = 'team_messages'
        union all
        select 'auth_users', 'id', 2147483647
      ) t
     order by t.rang, t.tabelle
  loop
    select array_agg(j.target_id)
      into v_ids
    from public.deletion_journal j
    where j.target_table = v_tabelle and j.merged_into is null;

    continue when v_ids is null;

    -- Die Person einer zurückgekehrten Dublette fällt erst nach dem Zusammenführen (unten).
    if v_tabelle = 'persons' then
      select array_agg(i) into v_ids
        from unnest(v_ids) i
       where not exists (select 1 from public.patients p
                           join public.deletion_journal m
                             on m.target_id = p.id and m.merged_into is not null
                          where p.person_id = i);
      continue when v_ids is null;
    end if;

    -- Das Konto liegt beim Anmeldedienst (ADR-023 Punkt 5): Was der Restore zurückbringt, verliert
    -- sofort jeden Zugang und bekommt einen Löschauftrag; erneut angewandt gilt der Eintrag erst
    -- mit der Bestätigung (confirm_platform_account_deletion).
    if v_tabelle = 'auth_users' then
      update public.platform_accesses a
         set status = 'revoked',
             revoked_at = coalesce(a.revoked_at, now()),
             revoked_by = null,
             revoked_reason = 'account_deleted',
             locked_at = null,
             locked_by = null
       where a.account_user_id = any (v_ids) and a.status <> 'revoked';

      perform app.order_platform_account_deletion(
        j.target_id, j.organization_id, null, j.due_at, 'reapply')
      from public.deletion_journal j
      join auth.users u on u.id = j.target_id
      where j.target_table = 'auth_users'
        and j.target_id = any (v_ids);
      v_geloescht := null;
    -- Nur der Inhalt fiel (Anker mit Antworten) - leeren, nicht löschen, sonst nähme cascade die
    -- Antworten mit. Wer entfernt hat, steht nach einem Restore nicht mehr fest.
    elsif v_tabelle = 'team_message_contents' then
      delete from public.team_message_mentions where message_id = any (v_ids);
      with g as (
        update public.team_messages
           set body = null, edited_at = null, author_staff_member_id = null,
               removed_at = coalesce(removed_at, now()),
               removed_kind = coalesce(removed_kind, 'author')
         where id = any (v_ids) and body is not null
        returning id
      )
      select array_agg(id) into v_geloescht from g;
    elsif v_schluessel <> 'id' then
      -- Der Schlüssel ist das Verhältnis: Was nach der Löschung neu angelegt wurde, etwa nach
      -- einem wieder geöffneten Vertrag, trägt denselben Schlüssel und bleibt.
      execute format(
        'with g as (delete from public.%1$I t using public.deletion_journal j
                     where j.target_table = %2$L and t.%3$I = j.target_id
                       and t.created_at <= j.deleted_at
                    returning t.%3$I as id)
         select array_agg(distinct id) from g',
        v_tabelle, v_tabelle, v_schluessel
      )
      into v_geloescht;
    else
      -- Zugewiesene Trainingspläne aus der Teillöschung fallen auch, wenn ihr Verhältnis steht
      -- (ANN-183).
      if v_tabelle = 'exercise_plans' then
        perform pg_catalog.set_config('app.retention_deletion', 'on', true);
      end if;
      -- Die zurückgebrachte Menge an der Grundlage fällt mit ihrer Leistung, wie beim Entfernen
      -- (delete_billable_services); sonst fehlte der Verordnung ein Termin.
      if v_tabelle = 'billable_services' then
        update public.treatment_base_items p
           set used_quantity = greatest(p.used_quantity - b.menge, 0)
          from (select s.treatment_base_item_id, sum(s.quantity)::smallint as menge
                  from public.billable_services s
                 where s.id = any (v_ids) and s.treatment_base_item_id is not null
                 group by s.treatment_base_item_id) b
         where p.id = b.treatment_base_item_id;
      end if;
      execute format(
        'with g as (delete from public.%I where id = any($1) returning id) select array_agg(id) from g',
        v_tabelle
      )
      into v_geloescht
      using v_ids;
      perform pg_catalog.set_config('app.retention_deletion', 'off', true);
    end if;

    if v_geloescht is not null then
      update public.deletion_journal
         set reapplied_at = now()
       where target_table = v_tabelle
         and target_id = any (v_geloescht);

      v_gesamt := v_gesamt + array_length(v_geloescht, 1);
    end if;
  end loop;

  -- Eine Sicherung von vor dem Zusammenführen bringt die Dublette zurück: Sie geht erneut in der
  -- bleibenden Akte auf, nach den Löschungen, die einen Sperrgrund genommen haben können (ANN-150).
  for v_merge in
    select j.* from public.deletion_journal j
     where j.merged_into is not null
       and exists (select 1 from public.patients p where p.id = j.target_id)
     order by j.deleted_at, j.id
  loop
    -- Ging die bleibende Akte später selbst in einer anderen auf, folgt das Ziel dieser Kette.
    v_ziel := v_merge.merged_into;
    for v_schritt in 1 .. 50 loop
      exit when exists (select 1 from public.patients p where p.id = v_ziel);
      v_weiter := null;
      select j.merged_into into v_weiter from public.deletion_journal j
       where j.target_table = 'patients' and j.target_id = v_ziel and j.merged_into is not null
       order by j.deleted_at desc, j.id desc
       limit 1;
      exit when v_weiter is null;
      v_ziel := v_weiter;
    end loop;

    begin
      if exists (select 1 from public.patients p where p.id = v_ziel) then
        perform app.merge_patients_core(v_merge.organization_id, v_merge.target_id, v_ziel,
                                        null, v_merge.deleted_at, true);
      elsif exists (select 1 from public.deletion_journal j
                     where j.target_table = 'patients' and j.target_id = v_ziel
                       and j.merged_into is null) then
        -- Die bleibende Akte wurde gelöscht; mit ihr fällt, was in ihr aufgegangen war.
        select p.person_id into v_person from public.patients p where p.id = v_merge.target_id;
        delete from public.patients where id = v_merge.target_id;
        if not exists (select 1 from public.patients p where p.person_id = v_person)
           and not exists (select 1 from public.staff_members s where s.person_id = v_person)
           and not exists (select 1 from public.user_profiles u where u.person_id = v_person)
           and not exists (select 1 from public.training_relationships t
                            where t.person_id = v_person)
        then
          delete from public.persons where id = v_person;
        end if;
      else
        -- Die Sicherung kennt die bleibende Akte nicht, gelöscht wurde sie nicht: Die Dublette ist
        -- dann die einzige Fassung der Akte und bleibt, der Eintrag offen.
        raise warning 'deletion journal entry % left open: merge target missing', v_merge.id;
        continue;
      end if;
      update public.deletion_journal set reapplied_at = now() where id = v_merge.id;
      v_gesamt := v_gesamt + 1;
    exception when sqlstate '22023' or sqlstate '23503' then
      -- Eine Sperre oder ein Bezug lässt nur diesen Eintrag offen, nicht das ganze Nachziehen.
      raise warning 'deletion journal entry % left open: %', v_merge.id, sqlerrm;
    end;
  end loop;

  -- Personen, die eine zurückgekehrte Dublette noch hielt, fallen jetzt.
  with g as (
    delete from public.persons pe
     using public.deletion_journal j
     where j.target_table = 'persons' and j.target_id = pe.id
       and not exists (select 1 from public.patients p where p.person_id = pe.id)
    returning pe.id
  )
  update public.deletion_journal j
     set reapplied_at = now()
    from g
   where j.target_table = 'persons' and j.target_id = g.id;

  -- Anonyme Rückmeldungen schreibt der Lauf mit neuer Kennung neu; ein älteres Backup trägt
  -- andere Kennungen als das Journal. Was nach dem Restore über der Frist liegt, fällt hier.
  delete from public.staff_feedback f
  using public.organizations o
  where o.id = f.organization_id
    and app.retention_due_at(
          (f.month + interval '1 month' - interval '1 day')::date,
          app.retention_interval('rueckmeldung'),
          o.time_zone
        ) <= now();

  -- Fällige Ausgangsnachrichten mit laufenden Antworten verlieren ihren Inhalt nach der Regel,
  -- nicht über das Journal (ANN-610).
  perform app.strip_due_team_anchors(o.id, o.time_zone) from public.organizations o;

  -- Ein Bild, das ein Restore zurückbringt, obwohl die Person inzwischen ausgeschieden ist, fällt
  -- nach der Regel (ANN-667), mit Eintrag im Löschjournal wie jede Löschung eines Bildes.
  perform pg_catalog.set_config('app.journal_paused', 'off', true);
  perform app.forget_profile_picture(p.organization_id, p.id)
  from public.staff_profile_pictures p
  join public.staff_members sm on sm.id = p.staff_member_id
  where sm.employment_status <> 'active';

  return v_gesamt;
end;
$$;
