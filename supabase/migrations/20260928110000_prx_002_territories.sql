-- =============================================================================
-- Gebietstage fuer die Terminvergabe (PRX-EPIC-001, Story PRX-002)
--
-- Die Praxis ordnet Gebieten - einer Liste von Postleitzahlen - feste
-- Wochentage oder Tageshaelften zu. Beim Anlegen eines Hausbesuchs, bei der
-- Serie und in der Terminsuche (PRX-003) sagt die Anwendung, ob der Termin im
-- Gebietstag der Adresse liegt. Eine Vorbelegung, keine Optimierung, und kein
-- Verbot: Die Regel warnt, Termine bleiben frei vergebbar (IDEA-PRX-031).
--
--   * PRAXISREGEL, KEINE AUSWERTUNG (B6). Ein Gebiet ist Konfiguration ohne
--     Personenbezug; es sagt nichts ueber eine Person, eine Tour oder eine
--     Mitarbeiterin. Datenklasse: Betriebsdaten.
--   * ZUORDNUNG UEBER DIE GENAUE POSTLEITZAHL (ANN-135). Eine Liste, kein
--     Praefix; eine Postleitzahl gehoert hoechstens zu einem Gebiet (Unique).
--     Vormittag heisst Beginn vor 12:00, Nachmittag Beginn ab 12:00, in
--     Praxiszeit. Ein Termin liegt im Gebietstag, wenn sein Beginn in einen
--     der eingetragenen Teile faellt.
--   * EINE QUELLE. Ob ein Termin passt, rechnet app.territory_day_status; die
--     Formulare fragen check_territory_days, die Terminsuche ruft dieselbe
--     Funktion. Kein zweiter Rechenweg im Browser.
--   * WER: pflegen owner, team_lead, office (app.can_manage_working_hours, wie
--     die Arbeitszeiten); lesen die Rollen der Terminverwaltung. Audit:
--     territory.saved und territory.removed, nur Metadaten.
-- =============================================================================

create function app.territory_day_parts_valid(p_parts jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_teil jsonb;
  v_tag  numeric;
begin
  if p_parts is null or jsonb_typeof(p_parts) <> 'array' then
    return false;
  end if;
  if jsonb_array_length(p_parts) > 21 then
    return false;
  end if;
  for v_teil in select value from jsonb_array_elements(p_parts)
  loop
    if jsonb_typeof(v_teil) <> 'object'
       or (select count(*) from jsonb_object_keys(v_teil)) <> 2
       or jsonb_typeof(v_teil -> 'weekday') <> 'number'
       or jsonb_typeof(v_teil -> 'part') <> 'string'
       or (v_teil ->> 'part') not in ('am', 'pm', 'day') then
      return false;
    end if;
    v_tag := (v_teil ->> 'weekday')::numeric;
    if v_tag <> trunc(v_tag) or v_tag not between 1 and 7 then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

comment on function app.territory_day_parts_valid(jsonb) is
  'Prueft die Tage eines Gebiets: Liste von hoechstens 21 Objekten {weekday 1-7 ISO, part am|pm|day} (PRX-002).';

create table public.territories (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name            text not null check (length(btrim(name)) between 1 and 60),
  day_parts       jsonb not null default '[]'::jsonb check (app.territory_day_parts_valid(day_parts)),
  created_at      timestamptz not null default now(),
  created_by      uuid,
  updated_at      timestamptz not null default now(),
  updated_by      uuid
);

comment on table public.territories is
  'Gebiete fuer die Terminvergabe (PRX-002): Name und Gebietstage. Praxisregel ohne Personenbezug. Kein direkter Zugriff, nur ueber die Funktionen. Datenklasse: Betriebsdaten.';
comment on column public.territories.day_parts is
  'Gebietstage [{weekday 1-7 ISO, part am|pm|day}]; am = Beginn vor 12:00, pm = Beginn ab 12:00, Praxiszeit (ANN-135).';

create unique index territories_name_idx on public.territories (organization_id, lower(btrim(name)));

create table public.territory_postal_codes (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  territory_id    uuid not null references public.territories (id) on delete cascade,
  postal_code     text not null check (postal_code ~ '^[0-9]{5}$'),
  constraint territory_postal_codes_unique unique (organization_id, postal_code)
);

comment on table public.territory_postal_codes is
  'Postleitzahlen eines Gebiets (PRX-002, ANN-135). Eine Postleitzahl gehoert hoechstens zu einem Gebiet. Datenklasse: Betriebsdaten.';

create index territory_postal_codes_territory_idx on public.territory_postal_codes (territory_id);

alter table public.territories enable row level security;
alter table public.territory_postal_codes enable row level security;
revoke all on public.territories from public, anon, authenticated;
revoke all on public.territory_postal_codes from public, anon, authenticated;

insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values
  ('territories', 'betriebsdaten', 'keine',
   'Gebiete fuer die Terminvergabe. Praxisregel ohne Personenbezug; bleibt, bis die Praxis sie entfernt.', 215),
  ('territory_postal_codes', 'betriebsdaten', 'ueber_elterndatensatz',
   'Postleitzahlen eines Gebiets. Fallen mit dem Gebiet (FK on delete cascade).', 216);

-- -----------------------------------------------------------------------------
-- Auditkatalog
-- -----------------------------------------------------------------------------
alter table public.audit_log drop constraint audit_log_subject_type_check;
alter table public.audit_log add constraint audit_log_subject_type_check
  check (subject_type in (
    'patient',
    'organization',
    'appointment',
    'staff_working_hours',
    'staff_working_hour_exception',
    'staff_member',
    'treatment_note',
    'prescription',
    'treatment_basis',
    'text_snippet',
    'user_account',
    'patient_file',
    'storage_deletion_order',
    'service_catalog_version',
    'invoice_recipient',
    'invoice',
    'payment',
    'questionnaire_response',
    'patient_course_event',
    'therapy_report',
    'waitlist_entry',
    'territory'
  ));

alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  CHECK ((action = ANY (ARRAY['patient_record.viewed'::text, 'patient_record.exported'::text, 'audit_log.read'::text, 'patient.created'::text, 'patient.updated'::text, 'patient.status_changed'::text, 'patient.care_concluded'::text, 'patient.care_reopened'::text, 'legal_hold.placed'::text, 'legal_hold.released'::text, 'retention.applied'::text, 'retention.reapplied'::text, 'appointment.created'::text, 'appointment.updated'::text, 'appointment.rescheduled'::text, 'appointment.cancelled'::text, 'appointment.no_show'::text, 'appointment.completed'::text, 'appointment.documented'::text, 'appointment.reopened'::text, 'appointment.notified'::text, 'organization.appointment_grid_changed'::text, 'organization.documentation_deadline_changed'::text, 'organization.billing_profile_changed'::text, 'staff_working_hours.created'::text, 'staff_working_hours.updated'::text, 'staff_working_hours.removed'::text, 'staff_working_hour_exception.created'::text, 'staff_working_hour_exception.updated'::text, 'staff_working_hour_exception.removed'::text, 'staff_member.created'::text, 'staff_member.updated'::text, 'staff_member.status_changed'::text, 'staff_account.invited'::text, 'staff_account.invitation_revoked'::text, 'staff_account.invitation_accepted'::text, 'staff_account.roles_changed'::text, 'staff_account.locked'::text, 'staff_account.unlocked'::text, 'staff_account.password_reset_requested'::text, 'account.password_changed'::text, 'account.sessions_ended'::text, 'account.mfa_enrolled'::text, 'account.mfa_removed'::text, 'treatment_note.created'::text, 'treatment_note.updated'::text, 'treatment_note.viewed'::text, 'treatment_note.finalized'::text, 'treatment_note.auto_finalized'::text, 'treatment_note.revised'::text, 'treatment_note.addendum_created'::text, 'treatment_note.history_viewed'::text, 'prescription.viewed'::text, 'prescription.created'::text, 'prescription.updated'::text, 'prescription.deleted'::text, 'treatment_basis.viewed'::text, 'treatment_basis.created'::text, 'treatment_basis.updated'::text, 'treatment_basis.deleted'::text, 'treatment_basis.appointments_transferred'::text, 'patient_file.uploaded'::text, 'patient_file.link_issued'::text, 'patient_file.deleted'::text, 'patient_file.type_corrected'::text, 'storage_deletion.claimed'::text, 'storage_deletion.receipted'::text, 'storage_deletion.ordered'::text, 'text_snippet.created'::text, 'text_snippet.updated'::text, 'text_snippet.deleted'::text, 'service_catalog.version_created'::text, 'service_catalog.version_updated'::text, 'service_catalog.version_published'::text, 'service_catalog.version_deleted'::text, 'billable_service.recorded'::text, 'billable_service.removed'::text, 'invoice_recipient.created'::text, 'invoice_recipient.updated'::text, 'invoice_recipient.deleted'::text, 'invoice.draft_created'::text, 'invoice.draft_deleted'::text, 'invoice.recipient_changed'::text, 'invoice.issued'::text, 'invoice.cancelled'::text, 'invoice.reminder_created'::text, 'payment.recorded'::text, 'payment.voided'::text, 'organization.bootstrapped'::text, 'deletion_runs.read'::text, 'patient_privacy.recorded'::text, 'appointments.read'::text, 'patient_directory.read'::text, 'treatment_bases.read'::text, 'treatment_evidence.read'::text, 'patient_files.read'::text, 'text_snippets.read'::text, 'invoicing.read'::text, 'billable_services.read'::text, 'legal_holds.read'::text, 'storage_deletion.read'::text, 'patient.address_geocoded'::text, 'organization.tour_start_changed'::text, 'questionnaire_response.created'::text, 'questionnaire_response.updated'::text, 'questionnaire_response.completed'::text, 'questionnaire_response.discarded'::text, 'questionnaire_response.viewed'::text, 'patient_course_event.created'::text, 'patient_course_event.removed'::text, 'patient_course_event.viewed'::text, 'therapy_report.created'::text, 'therapy_report.updated'::text, 'therapy_report.completed'::text, 'therapy_report.discarded'::text, 'therapy_report.viewed'::text, 'therapy_report.exported'::text, 'patient_file.handed_out'::text, 'waitlist_entry.created'::text, 'waitlist_entry.updated'::text, 'waitlist_entry.closed'::text, 'waitlist.read'::text, 'territory.saved'::text, 'territory.removed'::text])));

-- -----------------------------------------------------------------------------
-- Die eine Regel: liegt ein Beginn im Gebietstag einer Postleitzahl?
--
-- 'none'    die Postleitzahl gehoert zu keinem Gebiet (oder fehlt)
-- 'match'   der Beginn liegt in einem eingetragenen Teil des Gebiets
-- 'outside' das Gebiet hat Tage, der Beginn liegt in keinem davon
-- Ein Gebiet ohne Tage liefert 'none': Es gibt nichts, wogegen zu pruefen ist.
-- -----------------------------------------------------------------------------
create function app.territory_day_status(
  p_org         uuid,
  p_postal_code text,
  p_date        date,
  p_start       time
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with gebiet as (
    select t.day_parts
    from public.territory_postal_codes pc
    join public.territories t on t.id = pc.territory_id
    where pc.organization_id = p_org
      and pc.postal_code = btrim(coalesce(p_postal_code, ''))
  )
  select case
    when not exists (select 1 from gebiet)
      or (select jsonb_array_length(day_parts) from gebiet) = 0 then 'none'
    when exists (
      select 1
      from gebiet g, jsonb_array_elements(g.day_parts) teil
      where (teil ->> 'weekday')::int = extract(isodow from p_date)::int
        and (
          teil ->> 'part' = 'day'
          or (teil ->> 'part' = 'am' and p_start < time '12:00')
          or (teil ->> 'part' = 'pm' and p_start >= time '12:00')
        )
    ) then 'match'
    else 'outside'
  end
$$;

comment on function app.territory_day_status(uuid, text, date, time) is
  'Gebietstag-Regel (PRX-002, ANN-135): none, match oder outside fuer Postleitzahl, Tag und Beginn in Praxiszeit. Einzige Stelle der Regel; Formulare und Terminsuche rufen sie.';
revoke all on function app.territory_day_status(uuid, text, date, time) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- list_territories
-- -----------------------------------------------------------------------------
create function public.list_territories()
returns table (
  id           uuid,
  name         text,
  day_parts    jsonb,
  postal_codes text[],
  updated_at   timestamptz
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
  if not app.can_create_appointment() then
    raise exception 'not allowed to read territories' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read territories' using errcode = '42501';
  end if;

  return query
  select t.id,
         t.name,
         t.day_parts,
         coalesce(
           (select array_agg(pc.postal_code order by pc.postal_code)
              from public.territory_postal_codes pc
             where pc.territory_id = t.id),
           array[]::text[]
         ),
         t.updated_at
  from public.territories t
  where t.organization_id = v_org
  order by lower(t.name);
end;
$$;

comment on function public.list_territories() is
  'Gebiete der eigenen Praxis mit Postleitzahlen und Gebietstagen (PRX-002). Rollen der Terminverwaltung. Kein Personenbezug, deshalb ohne Leseprotokoll.';
revoke all on function public.list_territories() from public, anon;
grant execute on function public.list_territories() to authenticated;

-- -----------------------------------------------------------------------------
-- save_territory - anlegen (p_territory_id null) oder ersetzen
-- -----------------------------------------------------------------------------
create function public.save_territory(
  p_territory_id        uuid,
  p_expected_updated_at timestamptz,
  p_name                text,
  p_postal_codes        text[],
  p_day_parts           jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_id     uuid;
  v_stand  timestamptz;
  v_codes  text[];
  v_belegt text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_manage_working_hours() then
    raise exception 'not allowed to write territories' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write territories' using errcode = '42501';
  end if;

  if p_name is null or length(btrim(p_name)) not between 1 and 60 then
    raise exception 'invalid name' using errcode = '22023';
  end if;
  if not app.territory_day_parts_valid(coalesce(p_day_parts, '[]'::jsonb)) then
    raise exception 'invalid day parts' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct btrim(c) order by btrim(c)), array[]::text[])
    into v_codes
  from unnest(coalesce(p_postal_codes, array[]::text[])) c
  where btrim(c) <> '';
  if cardinality(v_codes) > 200 then
    raise exception 'too many postal codes' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_codes) c where c !~ '^[0-9]{5}$') then
    raise exception 'invalid postal code' using errcode = '22023';
  end if;

  if p_territory_id is null then
    begin
      insert into public.territories (organization_id, name, day_parts, created_by, updated_by)
      values (v_org, btrim(p_name), coalesce(p_day_parts, '[]'::jsonb), v_actor, v_actor)
      returning id into v_id;
    exception
      when unique_violation then
        raise exception 'territory name taken' using errcode = '23505';
    end;
  else
    select t.updated_at into v_stand
    from public.territories t
    where t.id = p_territory_id and t.organization_id = v_org
    for update;
    if not found then
      raise exception 'territory not found' using errcode = 'P0002';
    end if;
    if p_expected_updated_at is null or v_stand <> p_expected_updated_at then
      raise exception 'territory changed' using errcode = '40001';
    end if;
    begin
      update public.territories t
         set name       = btrim(p_name),
             day_parts  = coalesce(p_day_parts, '[]'::jsonb),
             updated_at = clock_timestamp(),
             updated_by = v_actor
       where t.id = p_territory_id;
    exception
      when unique_violation then
        raise exception 'territory name taken' using errcode = '23505';
    end;
    v_id := p_territory_id;
    delete from public.territory_postal_codes pc where pc.territory_id = v_id;
  end if;

  -- Eine Postleitzahl, die schon einem anderen Gebiet gehoert, wird genannt:
  -- Sie ist eine Praxisregel und kein Personendatum.
  select pc.postal_code into v_belegt
  from public.territory_postal_codes pc
  where pc.organization_id = v_org
    and pc.postal_code = any (v_codes)
  order by pc.postal_code
  limit 1;
  if v_belegt is not null then
    raise exception 'postal code already assigned: %', v_belegt using errcode = '23505';
  end if;

  insert into public.territory_postal_codes (organization_id, territory_id, postal_code)
  select v_org, v_id, c from unnest(v_codes) c;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  ) values (
    v_org, v_actor, 'territory.saved', 'territory', v_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'created', p_territory_id is null,
      'postal_codes', cardinality(v_codes),
      'day_parts', jsonb_array_length(coalesce(p_day_parts, '[]'::jsonb))
    )
  );

  return v_id;
end;
$$;

comment on function public.save_territory(uuid, timestamptz, text, text[], jsonb) is
  'Legt ein Gebiet an oder ersetzt Name, Postleitzahlen und Gebietstage (PRX-002). owner, team_lead, office; Stand-Pruefung; eine Postleitzahl hoechstens in einem Gebiet; auditiert.';
revoke all on function public.save_territory(uuid, timestamptz, text, text[], jsonb) from public, anon;
grant execute on function public.save_territory(uuid, timestamptz, text, text[], jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- remove_territory
-- -----------------------------------------------------------------------------
create function public.remove_territory(p_territory_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_manage_working_hours() then
    raise exception 'not allowed to write territories' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write territories' using errcode = '42501';
  end if;

  delete from public.territories t where t.id = p_territory_id and t.organization_id = v_org;
  if not found then
    raise exception 'territory not found' using errcode = 'P0002';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  ) values (
    v_org, v_actor, 'territory.removed', 'territory', p_territory_id, 'success',
    jsonb_build_object('surface', 'web')
  );
end;
$$;

comment on function public.remove_territory(uuid) is
  'Entfernt ein Gebiet samt Postleitzahlen (PRX-002). owner, team_lead, office; auditiert. Termine bleiben unberuehrt.';
revoke all on function public.remove_territory(uuid) from public, anon;
grant execute on function public.remove_territory(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- check_territory_days - der Hinweis im Formular und in der Serie
--
-- p_slots: [{datum: YYYY-MM-DD, beginn: HH:MM}] wie check_appointment_slots.
-- Liefert je Zeile den Status und - nur bei outside - Name und Tage des
-- Gebiets, damit der Hinweis sagen kann, wann das Gebiet dran ist.
-- -----------------------------------------------------------------------------
create function public.check_territory_days(p_postal_code text, p_slots jsonb)
returns table (
  slot_index     integer,
  status         text,
  territory_name text,
  day_parts      jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_i      integer;
  v_datum  date;
  v_beginn time;
  v_name   text;
  v_teile  jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_create_appointment() then
    raise exception 'not allowed to read territories' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read territories' using errcode = '42501';
  end if;
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    raise exception 'slots must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_slots) > app.appointment_series_limit() then
    raise exception 'too many slots' using errcode = '22023';
  end if;

  select t.name, t.day_parts into v_name, v_teile
  from public.territory_postal_codes pc
  join public.territories t on t.id = pc.territory_id
  where pc.organization_id = v_org
    and pc.postal_code = btrim(coalesce(p_postal_code, ''));

  for v_i in 0 .. jsonb_array_length(p_slots) - 1 loop
    slot_index := v_i;
    begin
      v_datum  := (p_slots -> v_i ->> 'datum')::date;
      v_beginn := (p_slots -> v_i ->> 'beginn')::time;
    exception
      when others then
        v_datum := null;
        v_beginn := null;
    end;
    if v_datum is null or v_beginn is null then
      status := 'invalid';
      territory_name := null;
      day_parts := null;
    else
      status := app.territory_day_status(v_org, p_postal_code, v_datum, v_beginn);
      territory_name := case when status = 'none' then null else v_name end;
      day_parts := case when status = 'none' then null else v_teile end;
    end if;
    return next;
  end loop;
end;
$$;

comment on function public.check_territory_days(text, jsonb) is
  'Hinweis Gebietstag (PRX-002): je Termin none, match, outside oder invalid samt Gebiet. Warnt, sperrt nichts. Rollen der Terminverwaltung.';
revoke all on function public.check_territory_days(text, jsonb) from public, anon;
grant execute on function public.check_territory_days(text, jsonb) to authenticated;
