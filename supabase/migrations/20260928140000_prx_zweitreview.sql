-- =============================================================================
-- PRX-EPIC-001: Befunde des Zweitreviews
--
--   1. BLOCKIEREND. find_free_slots lieferte als Nachbartermin auch einen
--      Trainingstermin - Kennung und Koordinaten - an Rollen, die ihn nicht
--      lesen duerfen (ADR-022 Punkt 11). Die Nachbarn kommen jetzt nur aus
--      einem lesbaren Kontext. rate_slot_travel nahm jede Kennung der
--      Organisation und verriet ueber die Fahrzeit Beginn und Ende; es nimmt
--      jetzt nur einen lesbaren, nicht abgesagten Termin derselben Person am
--      selben Tag - alles andere gilt als "nicht geprueft", ohne Meldung, ob
--      es die Kennung gibt. Die Belegung selbst zaehlt weiter ueber alle
--      Kontexte: Das ist die bewusst bezahlte Restoffenbarung "belegt".
--   2. Eine falsch erfasste Grundlage liess sich nicht loeschen, wenn die
--      Person zugleich einen offenen Eintrag ohne Grundlage hatte: Das
--      Nullsetzen traf den Eindeutigkeitsindex. Ein Trigger nimmt den
--      Eintrag der Grundlage dann zurueck (auditiert) - der Wunsch steht im
--      anderen Eintrag weiter.
--   3. create_appointment_from_waitlist nimmt die Person der Adresszeile mit
--      und prueft sie gegen den Eintrag.
--   5. reapply_deletion_journal loescht Wartelisteneintraege vor ihrer
--      Grundlage.
-- =============================================================================

create or replace function public.find_free_slots(
  p_patient_id        uuid,
  p_staff_member_id   uuid,
  p_appointment_type  text,
  p_duration_minutes  integer,
  p_from              date,
  p_to                date,
  p_windows           jsonb default '[]'::jsonb,
  p_limit             integer default 20
)
returns table (
  staff_member_id      uuid,
  staff_name           text,
  slot_date            date,
  start_time           time,
  end_time             time,
  territory_status     text,
  prev_appointment_id  uuid,
  prev_lat             double precision,
  prev_lon             double precision,
  next_appointment_id  uuid,
  next_lat             double precision,
  next_lon             double precision,
  target_lat           double precision,
  target_lon           double precision
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org      uuid;
  v_tz       text;
  v_grid     integer;
  v_heute    date;
  v_jetzt    integer;
  v_von      date;
  v_plz      text;
  v_lat      double precision;
  v_lon      double precision;
  v_fenster  jsonb := coalesce(p_windows, '[]'::jsonb);
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_create_appointment() then
    perform app.record_denied_read(auth.uid(), 'appointments.read', 'not allowed to create appointments');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to create appointments' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.patients p where p.id = p_patient_id and p.organization_id = v_org
  ) then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;
  if p_staff_member_id is not null and not app.is_assignable_therapist(p_staff_member_id, v_org) then
    raise exception 'staff member not assignable' using errcode = 'P0002';
  end if;
  if p_appointment_type is null or p_appointment_type not in ('home_visit', 'practice', 'video') then
    raise exception 'invalid appointment type' using errcode = '22023';
  end if;
  if not app.waitlist_windows_valid(v_fenster) then
    raise exception 'invalid time windows' using errcode = '22023';
  end if;
  if p_limit is null or p_limit not between 1 and 50 then
    raise exception 'limit must be between 1 and 50' using errcode = '22023';
  end if;

  select o.time_zone, o.appointment_grid_minutes into v_tz, v_grid
  from public.organizations o where o.id = v_org;

  if p_duration_minutes is null or p_duration_minutes > 240
     or not app.is_valid_treatment_length(make_interval(mins => p_duration_minutes), v_grid) then
    raise exception 'invalid duration' using errcode = '22023';
  end if;

  v_heute := (now() at time zone v_tz)::date;
  v_jetzt := extract(hour from (now() at time zone v_tz))::integer * 60
             + extract(minute from (now() at time zone v_tz))::integer;
  v_von := greatest(p_from, v_heute);
  if p_from is null or p_to is null or p_to < v_von or p_to - v_von > 41 then
    raise exception 'date range must lie ahead and span at most 42 days' using errcode = '22023';
  end if;

  if p_appointment_type = 'home_visit' then
    select cd.postal_code, cd.lat, cd.lon into v_plz, v_lat, v_lon
    from public.patient_contact_details cd
    where cd.patient_id = p_patient_id;
  end if;

  return query
  with tage as (
    select d::date as tag
    from generate_series(v_von::timestamp, p_to::timestamp, interval '1 day') d
  ),
  personen as (
    select sm.id,
           nullif(btrim(concat_ws(' ', pe.given_name, pe.family_name)), '') as name
    from public.staff_members sm
    join public.persons pe on pe.id = sm.person_id
    where sm.organization_id = v_org
      and (p_staff_member_id is null or sm.id = p_staff_member_id)
      and app.is_assignable_therapist(sm.id, v_org)
  ),
  arbeit as (
    select p.id as staff, p.name, t.tag, app.working_ranges(p.id, v_org, t.tag) as bereiche
    from personen p cross join tage t
  ),
  -- Belegt ist, was die Person ODER die Patient:in an diesem Tag schon hat
  -- (§8: Patienten- und Therapeutenverfuegbarkeit sind harte Constraints).
  belegt as (
    select a.staff, a.tag,
           range_agg(app.timerange(
             greatest(t.starts_at at time zone v_tz, a.tag::timestamp)::time,
             case when t.ends_at at time zone v_tz >= (a.tag + 1)::timestamp
                  then time '24:00'
                  else (t.ends_at at time zone v_tz)::time end,
             '[)'
           )) as zeiten
    from arbeit a
    join public.appointments t
      on t.organization_id = v_org
     and t.status <> 'cancelled'
     and (t.staff_member_id = a.staff or t.patient_id = p_patient_id)
     and t.starts_at < ((a.tag + 1)::timestamp at time zone v_tz)
     and t.ends_at > (a.tag::timestamp at time zone v_tz)
    where a.bereiche is not null
    group by a.staff, a.tag
  ),
  -- Wunschzeiten als Zeitraeume je Tag; ohne Wunschzeiten der ganze Tag.
  -- Geschnitten wird VOR dem Packen, damit ein Vorschlag am Beginn des
  -- Wunschfensters beginnt und nicht an einem Raster, das die Luecke vorgibt.
  wunsch as (
    select t.tag,
           case when jsonb_array_length(v_fenster) = 0
                then app.timemultirange(app.timerange(time '00:00', time '24:00', '[)'))
                else (
                  select range_agg(app.timerange((w ->> 'from')::time, (w ->> 'to')::time, '[)'))
                  from jsonb_array_elements(v_fenster) w
                  where (w ->> 'weekday')::int = extract(isodow from t.tag)::int
                ) end as zeiten
    from tage t
  ),
  frei as (
    select a.staff, a.name, a.tag,
           unnest((a.bereiche - coalesce(b.zeiten, '{}'::app.timemultirange)) * w.zeiten) as r
    from arbeit a
    join wunsch w on w.tag = a.tag
    left join belegt b on b.staff = a.staff and b.tag = a.tag
    where a.bereiche is not null
      and w.zeiten is not null
  ),
  grenzen as (
    select f.staff, f.name, f.tag,
           (extract(epoch from lower(f.r)) / 60)::integer as von_min,
           (extract(epoch from upper(f.r)) / 60)::integer as bis_min
    from frei f
  ),
  kandidaten as (
    select g.staff, g.name, g.tag, k.beginn
    from grenzen g,
         generate_series(
           (ceil(greatest(
              g.von_min,
              case when g.tag = v_heute then v_jetzt + 1 else 0 end
            )::numeric / v_grid) * v_grid)::integer,
           g.bis_min - p_duration_minutes,
           p_duration_minutes
         ) as k(beginn)
  ),
  passend as (
    select k.*,
           make_time(k.beginn / 60, k.beginn % 60, 0) as zeit_von,
           make_time((k.beginn + p_duration_minutes) / 60 % 24, (k.beginn + p_duration_minutes) % 60, 0) as zeit_bis
    from kandidaten k
    where k.beginn + p_duration_minutes <= 24 * 60 - 1
  ),
  bewertet as (
    select p.*,
           case when p_appointment_type = 'home_visit'
                then app.territory_day_status(v_org, v_plz, p.tag, p.zeit_von)
                else 'none' end as gebiet,
           ((p.tag + p.zeit_von)::timestamp at time zone v_tz) as ab,
           ((p.tag + p.zeit_von)::timestamp at time zone v_tz) + make_interval(mins => p_duration_minutes) as bis
    from passend p
  ),
  auswahl as (
    select b.*
    from bewertet b
    order by (b.gebiet = 'match') desc, (b.gebiet = 'outside') asc, b.tag, b.beginn, b.name
    limit p_limit
  )
  select a.staff,
         a.name,
         a.tag,
         a.zeit_von,
         a.zeit_bis,
         a.gebiet,
         vor.id, vor.visit_lat, vor.visit_lon,
         nach.id, nach.visit_lat, nach.visit_lon,
         v_lat, v_lon
  from auswahl a
  left join lateral (
    select t.id, t.visit_lat, t.visit_lon
    from public.appointments t
    where t.organization_id = v_org
      and t.staff_member_id = a.staff
      and t.status <> 'cancelled'
      -- Zweitreview 1: nur Termine eines lesbaren Kontexts (ADR-022 Punkt 11).
      and app.may_read_appointment_context(t.kind)
      and t.ends_at <= a.ab
      and t.ends_at > (a.tag::timestamp at time zone v_tz)
    order by t.ends_at desc
    limit 1
  ) vor on p_appointment_type = 'home_visit'
  left join lateral (
    select t.id, t.visit_lat, t.visit_lon
    from public.appointments t
    where t.organization_id = v_org
      and t.staff_member_id = a.staff
      and t.status <> 'cancelled'
      and app.may_read_appointment_context(t.kind)
      and t.starts_at >= a.bis
      and t.starts_at < ((a.tag + 1)::timestamp at time zone v_tz)
    order by t.starts_at
    limit 1
  ) nach on p_appointment_type = 'home_visit'
  order by (a.gebiet = 'match') desc, (a.gebiet = 'outside') asc, a.tag, a.beginn, a.name;
end;
$$;

-- -----------------------------------------------------------------------------
-- rate_slot_travel - Nachbarn nur aus einem lesbaren Kontext, derselben
-- Person, demselben Tag
-- -----------------------------------------------------------------------------
create or replace function public.rate_slot_travel(p_items jsonb)
returns table (
  item_index        integer,
  status            text,
  shortfall_minutes integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_tz      text;
  v_grid    integer;
  v_item    jsonb;
  v_staff   uuid;
  v_tag     date;
  v_ab      timestamptz;
  v_bis     timestamptz;
  v_zu      integer;
  v_von     integer;
  v_ende    timestamptz;
  v_beginn  timestamptz;
  v_knapp   boolean;
  v_unklar  boolean;
  v_frueh   timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_create_appointment() then
    perform app.record_denied_read(auth.uid(), 'appointments.read', 'not allowed to create appointments');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to create appointments' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 25 then
    raise exception 'items must be an array of at most 25 entries' using errcode = '22023';
  end if;

  select o.time_zone, o.appointment_grid_minutes into v_tz, v_grid
  from public.organizations o where o.id = v_org;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    begin
      item_index := (v_item ->> 'index')::integer;
      v_staff := (v_item ->> 'staff_member_id')::uuid;
      v_tag   := (v_item ->> 'date')::date;
      v_ab    := (v_tag + (v_item ->> 'start')::time)::timestamp at time zone v_tz;
      v_bis   := (v_tag + (v_item ->> 'end')::time)::timestamp at time zone v_tz;
      v_zu    := nullif(v_item ->> 'travel_to_seconds', '')::numeric::integer;
      v_von   := nullif(v_item ->> 'travel_from_seconds', '')::numeric::integer;
    exception
      when others then
        raise exception 'invalid item' using errcode = '22023';
    end;
    if item_index is null or v_staff is null or v_tag is null
       or (v_zu is not null and v_zu not between 0 and 86400)
       or (v_von is not null and v_von not between 0 and 86400) then
      raise exception 'invalid item' using errcode = '22023';
    end if;

    v_knapp := false;
    v_unklar := false;
    shortfall_minutes := 0;

    if v_item ->> 'prev_appointment_id' is not null then
      -- Ein Nachbar, den diese Person nicht lesen darf oder der nicht passt,
      -- ist "nicht geprueft" - ohne zu sagen, ob es ihn gibt.
      v_ende := null;
      begin
        select a.ends_at into v_ende from public.appointments a
        where a.id = (v_item ->> 'prev_appointment_id')::uuid
          and a.organization_id = v_org
          and a.staff_member_id = v_staff
          and a.status <> 'cancelled'
          and app.may_read_appointment_context(a.kind)
          and a.ends_at <= v_ab
          and a.ends_at > (v_tag::timestamp at time zone v_tz);
      exception
        when invalid_text_representation then
          v_ende := null;
      end;
      if v_ende is null or v_zu is null then
        v_unklar := true;
      else
        v_frueh := app.earliest_follow_up_start(v_ende, v_zu, v_grid, v_tz);
        if v_frueh > v_ab then
          v_knapp := true;
          shortfall_minutes := greatest(
            shortfall_minutes, ceil(extract(epoch from (v_frueh - v_ab)) / 60)::integer
          );
        end if;
      end if;
    end if;

    if v_item ->> 'next_appointment_id' is not null then
      v_beginn := null;
      begin
        select a.starts_at into v_beginn from public.appointments a
        where a.id = (v_item ->> 'next_appointment_id')::uuid
          and a.organization_id = v_org
          and a.staff_member_id = v_staff
          and a.status <> 'cancelled'
          and app.may_read_appointment_context(a.kind)
          and a.starts_at >= v_bis
          and a.starts_at < ((v_tag + 1)::timestamp at time zone v_tz);
      exception
        when invalid_text_representation then
          v_beginn := null;
      end;
      if v_beginn is null or v_von is null then
        v_unklar := true;
      else
        v_frueh := app.earliest_follow_up_start(v_bis, v_von, v_grid, v_tz);
        if v_frueh > v_beginn then
          v_knapp := true;
          shortfall_minutes := greatest(
            shortfall_minutes, ceil(extract(epoch from (v_frueh - v_beginn)) / 60)::integer
          );
        end if;
      end if;
    end if;

    status := case when v_knapp then 'tight' when v_unklar then 'unknown' else 'ok' end;
    return next;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Grundlage loeschen mit offenem Eintrag (Befund 2)
-- -----------------------------------------------------------------------------
create function app.waitlist_before_basis_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eintrag record;
begin
  for v_eintrag in
    select w.id, w.organization_id, w.patient_id
    from public.waitlist_entries w
    where w.treatment_basis_id = old.id
      and w.status = 'open'
      and exists (
        select 1 from public.waitlist_entries d
        where d.patient_id = w.patient_id
          and d.status = 'open'
          and d.treatment_basis_id is null
      )
    for update
  loop
    update public.waitlist_entries w
       set status = 'withdrawn',
           closed_at = clock_timestamp(),
           closed_by = auth.uid(),
           updated_at = clock_timestamp(),
           updated_by = auth.uid()
     where w.id = v_eintrag.id;

    insert into public.audit_log (
      organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
    ) values (
      v_eintrag.organization_id, auth.uid(),
      case when auth.uid() is null then 'system' else 'user' end,
      'waitlist_entry.closed', 'waitlist_entry', v_eintrag.id, 'success',
      jsonb_build_object(
        'surface', 'web',
        'patient_id', v_eintrag.patient_id,
        'outcome', 'withdrawn',
        'reason', 'treatment_basis_deleted'
      )
    );
  end loop;
  return old;
end;
$$;

comment on function app.waitlist_before_basis_delete() is
  'Zweitreview PRX-EPIC-001, Befund 2: Faellt eine Grundlage, waehrend die Person zugleich einen offenen Eintrag ohne Grundlage hat, wird der Eintrag der Grundlage zurueckgenommen statt auf null gesetzt - sonst schluege der Eindeutigkeitsindex zu. Auditiert.';
revoke all on function app.waitlist_before_basis_delete() from public, anon, authenticated;

create trigger treatment_bases_waitlist_before_delete
  before delete on public.treatment_bases
  for each row execute function app.waitlist_before_basis_delete();

-- -----------------------------------------------------------------------------
-- create_appointment_from_waitlist mit Person (Befund 3)
-- -----------------------------------------------------------------------------
drop function public.create_appointment_from_waitlist(uuid, uuid, text, date, time, time, uuid, boolean, uuid, boolean);

create function public.create_appointment_from_waitlist(
  p_entry_id                     uuid,
  p_patient_id                   uuid,
  p_staff_member_id              uuid,
  p_appointment_type             text,
  p_date                         date,
  p_start_time                   time,
  p_end_time                     time,
  p_location_id                  uuid default null,
  p_allow_outside_working_hours  boolean default false,
  p_treatment_basis_id           uuid default null,
  p_confirmed_past               boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid;
  v_org     uuid;
  v_eintrag public.waitlist_entries;
  v_termin  uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_create_appointment() then
    raise exception 'not allowed to create appointments' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to create appointments' using errcode = '42501';
  end if;

  select * into v_eintrag
  from public.waitlist_entries w
  where w.id = p_entry_id and w.organization_id = v_org
  for update;
  if not found then
    raise exception 'waitlist entry not found' using errcode = 'P0002';
  end if;
  -- Die Person im Formular muss die des Eintrags sein - ein veralteter oder
  -- veraenderter Verweis legt sonst den Termin fuer jemand anderen an.
  if p_patient_id is null or v_eintrag.patient_id <> p_patient_id then
    raise exception 'waitlist entry belongs to another patient' using errcode = '22023';
  end if;
  if v_eintrag.status <> 'open' then
    raise exception 'waitlist entry closed' using errcode = '22023';
  end if;

  v_termin := public.create_appointment(
    v_eintrag.patient_id,
    p_staff_member_id,
    p_appointment_type,
    p_date,
    p_start_time,
    p_end_time,
    p_location_id,
    p_allow_outside_working_hours,
    p_treatment_basis_id,
    p_confirmed_past
  );

  perform app.close_waitlist_entry(v_org, v_actor, p_entry_id, 'placed', v_termin);

  return v_termin;
end;
$$;

comment on function public.create_appointment_from_waitlist(uuid, uuid, uuid, text, date, time, time, uuid, boolean, uuid, boolean) is
  'Nachruecken (PRX-004): legt den Termin fuer die Person eines offenen Wartelisteneintrags ueber create_appointment an und schliesst den Eintrag als eingeplant - in einer Transaktion. Die Person der Adresszeile muss die des Eintrags sein (Zweitreview 3).';
revoke all on function public.create_appointment_from_waitlist(uuid, uuid, uuid, text, date, time, time, uuid, boolean, uuid, boolean) from public, anon;
grant execute on function public.create_appointment_from_waitlist(uuid, uuid, uuid, text, date, time, time, uuid, boolean, uuid, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- reapply_deletion_journal (Befund 5). Rumpf sonst unveraendert aus
-- 20260928100000_prx_001_waitlist.sql.
-- -----------------------------------------------------------------------------
create or replace function public.reapply_deletion_journal()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reihenfolge text[] := array[
    'invoice_payment_reminders',
    'invoice_cancellations',
    'payments',
    'invoice_items',
    'invoices',
    'invoice_recipients',
    'billable_services',
    'treatment_note_versions',
    'treatment_notes',
    'patient_files',
    -- Vor Grundlage und Termin: ein Eintrag zeigt auf beide (on delete set
    -- null) - geloescht wird er vorher, damit nichts umgeschrieben wird
    -- (PRX-001, Zweitreview 5).
    'waitlist_entries',
    'treatment_base_items',
    'treatment_bases',
    'appointments',
    'legal_holds',
    'patient_contact_details',
    'patient_care_details',
    'patients',
    -- Vor persons: die Person faellt erst, wenn kein Verhaeltnis mehr auf
    -- sie zeigt - nach einem Restore genauso wie im Lauf (LEI-002).
    'training_relationships',
    'persons',
    'audit_log',
    'staff_account_invitations'
  ];
  v_tabelle   text;
  v_ids       uuid[];
  v_geloescht uuid[];
  v_unbekannt text[];
  v_gesamt    integer := 0;
  v_org       record;
begin
  select array_agg(distinct j.target_table)
    into v_unbekannt
  from public.deletion_journal j
  where not (j.target_table = any (v_reihenfolge));

  if v_unbekannt is not null then
    raise exception 'deletion journal references tables without a reapply order: %', v_unbekannt
      using errcode = '22023';
  end if;

  foreach v_tabelle in array v_reihenfolge
  loop
    select array_agg(j.target_id)
      into v_ids
    from public.deletion_journal j
    where j.target_table = v_tabelle;

    continue when v_ids is null;

    -- Tabellenname aus der festen Liste oben, nie aus Benutzereingabe;
    -- die Kennungen gehen als Parameter, nicht als Text.
    execute format(
      'with g as (delete from public.%I where id = any($1) returning id) select array_agg(id) from g',
      v_tabelle
    )
    into v_geloescht
    using v_ids;

    if v_geloescht is not null then
      update public.deletion_journal
         set reapplied_at = now()
       where target_table = v_tabelle
         and target_id = any (v_geloescht);

      v_gesamt := v_gesamt + array_length(v_geloescht, 1);
    end if;
  end loop;

  if v_gesamt > 0 then
    for v_org in
      select j.organization_id as id, count(*) as anzahl
      from public.deletion_journal j
      where j.reapplied_at = now()
      group by j.organization_id
    loop
      insert into public.audit_log (
        organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
      )
      values (
        v_org.id, null, 'system', 'retention.reapplied', 'organization', v_org.id, 'success',
        jsonb_build_object('surface', 'restore', 'records', v_org.anzahl)
      );
    end loop;
  end if;

  return v_gesamt;
end;
$$;
