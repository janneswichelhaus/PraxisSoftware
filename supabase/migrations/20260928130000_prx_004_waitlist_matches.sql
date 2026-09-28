-- =============================================================================
-- Nachruecken von der Warteliste (PRX-EPIC-001, Story PRX-004)
--
-- Wird ein Platz frei - durch eine Absage oder als freie Stelle im Kalender -,
-- zeigt die Anwendung die Eintraege der Warteliste, die auf ihn passen. Die
-- Praxis ruft an und uebernimmt; der Termin entsteht und der Eintrag wird in
-- DERSELBEN Transaktion geschlossen. Nichts wird versendet (B15), nichts
-- automatisch vergeben (§8).
--
--   * PASSEN heisst: Eintrag offen; die Dauer des Wunsches passt in den Platz;
--     "fruehestens ab" nicht nach dem Tag; ohne Wunschzeiten oder mit einer
--     Wunschzeit an diesem Wochentag, die Beginn und Ende des Wunsches
--     enthaelt; ohne Wunsch-Therapeut:in oder genau diese; die Person hat zu
--     der Zeit keinen anderen Termin; nicht die Person, die gerade abgesagt
--     hat. Reihenfolge wie die Liste: "bis spaetestens", dann Wartezeit (ANN-132).
--   * Die Terminart des Wunsches bestimmt den Vorschlag; beim Hausbesuch sagt
--     der Gebietstag der Adresse dazu, ob es passt (PRX-002) - als Hinweis.
--   * WER: Terminverwaltung; abgewiesen als waitlist.read (G6b). Die Uebernahme
--     ruft create_appointment unveraendert auf - alle Pruefungen gelten - und
--     schliesst danach app.close_waitlist_entry mit 'placed'.
-- =============================================================================

create function public.list_waitlist_matches(
  p_staff_member_id    uuid,
  p_date               date,
  p_start_time         time,
  p_end_time           time,
  p_exclude_patient_id uuid default null
)
returns table (
  id                   uuid,
  patient_id           uuid,
  patient_given_name   text,
  patient_family_name  text,
  phone                text,
  phone_mobile         text,
  treatment_basis_id   uuid,
  appointment_type     text,
  duration_minutes     smallint,
  time_windows         jsonb,
  needed_by            date,
  priority_reason      text,
  territory_status     text,
  updated_at           timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_tz    text;
  v_platz integer;
  v_von   integer;
  v_ab    timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_create_appointment() then
    perform app.record_denied_read(auth.uid(), 'waitlist.read', 'not allowed to read waitlist');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read waitlist' using errcode = '42501';
  end if;
  if p_date is null or p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
    raise exception 'invalid slot' using errcode = '22023';
  end if;
  if p_staff_member_id is null or not app.is_assignable_therapist(p_staff_member_id, v_org) then
    raise exception 'staff member not assignable' using errcode = 'P0002';
  end if;

  select o.time_zone into v_tz from public.organizations o where o.id = v_org;
  v_von   := (extract(epoch from p_start_time) / 60)::integer;
  v_platz := (extract(epoch from (p_end_time - p_start_time)) / 60)::integer;
  v_ab    := (p_date + p_start_time)::timestamp at time zone v_tz;

  return query
  select w.id,
         w.patient_id,
         pe.given_name,
         pe.family_name,
         cd.phone,
         cd.phone_mobile,
         w.treatment_basis_id,
         w.appointment_type,
         w.duration_minutes,
         w.time_windows,
         w.needed_by,
         w.priority_reason,
         case when w.appointment_type = 'home_visit'
              then app.territory_day_status(v_org, cd.postal_code, p_date, p_start_time)
              else 'none' end,
         w.updated_at
  from public.waitlist_entries w
  join public.patients pa on pa.id = w.patient_id
  join public.persons pe on pe.id = pa.person_id
  left join public.patient_contact_details cd on cd.patient_id = w.patient_id
  where w.organization_id = v_org
    and w.status = 'open'
    and w.duration_minutes <= v_platz
    and (w.earliest_on is null or w.earliest_on <= p_date)
    and (w.preferred_staff_member_id is null or w.preferred_staff_member_id = p_staff_member_id)
    and (p_exclude_patient_id is null or w.patient_id <> p_exclude_patient_id)
    and (
      jsonb_array_length(w.time_windows) = 0
      or exists (
        select 1 from jsonb_array_elements(w.time_windows) f
        where (f ->> 'weekday')::int = extract(isodow from p_date)::int
          and v_von >= (extract(epoch from (f ->> 'from')::time) / 60)::integer
          and v_von + w.duration_minutes <= (extract(epoch from (f ->> 'to')::time) / 60)::integer
      )
    )
    and not exists (
      select 1 from public.appointments a
      where a.organization_id = v_org
        and a.patient_id = w.patient_id
        and a.status <> 'cancelled'
        and tstzrange(a.starts_at, a.ends_at, '[)')
            && tstzrange(v_ab, v_ab + make_interval(mins => w.duration_minutes), '[)')
    )
  order by w.needed_by asc nulls last, w.created_at asc
  limit 20;
end;
$$;

comment on function public.list_waitlist_matches(uuid, date, time, time, uuid) is
  'Nachruecken (PRX-004): offene Wartelisteneintraege, die auf einen freien Platz passen - Dauer, fruehestens ab, Wunschzeit, Wunsch-Therapeut:in, keine eigene Ueberschneidung. Hoechstens 20, geordnet wie die Liste. Nur Terminverwaltung; versendet nichts.';
revoke all on function public.list_waitlist_matches(uuid, date, time, time, uuid) from public, anon;
grant execute on function public.list_waitlist_matches(uuid, date, time, time, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- create_appointment_from_waitlist - Termin anlegen und Eintrag schliessen,
-- alles oder nichts.
-- -----------------------------------------------------------------------------
create function public.create_appointment_from_waitlist(
  p_entry_id                     uuid,
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

  -- Zuerst sperren: Zwei Personen am Telefon sollen denselben Eintrag nicht
  -- zweimal einplanen.
  select * into v_eintrag
  from public.waitlist_entries w
  where w.id = p_entry_id and w.organization_id = v_org
  for update;
  if not found then
    raise exception 'waitlist entry not found' using errcode = 'P0002';
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

comment on function public.create_appointment_from_waitlist(uuid, uuid, text, date, time, time, uuid, boolean, uuid, boolean) is
  'Nachruecken (PRX-004): legt den Termin fuer die Person eines offenen Wartelisteneintrags ueber create_appointment an und schliesst den Eintrag als eingeplant - in einer Transaktion. Alle Pruefungen von create_appointment gelten unveraendert.';
revoke all on function public.create_appointment_from_waitlist(uuid, uuid, text, date, time, time, uuid, boolean, uuid, boolean) from public, anon;
grant execute on function public.create_appointment_from_waitlist(uuid, uuid, text, date, time, time, uuid, boolean, uuid, boolean) to authenticated;
