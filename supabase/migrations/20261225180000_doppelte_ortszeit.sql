-- Eine doppelte Ortszeit der Umstellung im Herbst gilt als die frühere (ANN-786): beim Eingang einer
-- Absage und bei der Erinnerung an das Tagebuch. Ein Absagewunsch gibt seinen Zeitpunkt genau
-- weiter; über Datum und Uhrzeit in Ortszeit verschob ihn die doppelte Stunde.

create function app.local_time_instant(p_local timestamp, p_time_zone text)
returns timestamptz
language plpgsql stable
set search_path to ''
as $$
declare
  v_spaet timestamptz := p_local at time zone p_time_zone;
  -- Um wie viel die Uhr seit gestern zurückgestellt wurde; ohne Umstellung im Herbst nichts.
  v_zurueck interval := ((v_spaet - interval '1 day') at time zone p_time_zone)
                        - ((v_spaet - interval '1 day') at time zone 'UTC')
                        - ((v_spaet at time zone p_time_zone) - (v_spaet at time zone 'UTC'));
begin
  -- PostgreSQL liest eine doppelte Ortszeit als die spätere. Gemeint ist die, die die Uhr zuerst
  -- zeigt: Sie liegt um die Rückstellung früher und zeigt dieselbe Ortszeit.
  if v_zurueck > interval '0' and ((v_spaet - v_zurueck) at time zone p_time_zone) = p_local then
    return v_spaet - v_zurueck;
  end if;
  return v_spaet;
end;
$$;

comment on function app.local_time_instant(timestamp, text) is 'Der Zeitpunkt einer Ortszeit in einer Zeitzone. Eine doppelte Ortszeit (Umstellung im Herbst) gilt als die frühere, nicht wie in PostgreSQL als die spätere; eine fehlende (Frühjahr) wie in PostgreSQL (ANN-786).';

revoke all on function app.local_time_instant(timestamp, text) from public, anon, authenticated;

create function app.cancel_appointment_received(
  p_appointment_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text,
  p_received_on date,
  p_received_time time,
  p_received_at timestamptz
)
returns uuid
language plpgsql security definer
set search_path to ''
as $$
declare
  v_actor   uuid;
  v_org     uuid;
  v_tz      text;
  v_alt     record;
  v_eingang timestamptz;
  v_anlass  text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Wie update_appointment: Den Kontext entscheidet der Riegel an der Zeile.
  if not (app.can_cancel_appointment() or app.can_write_training_relationships()) then
    raise exception 'not allowed to cancel appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to cancel appointments' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  -- Die Pflichtangabe wird vor jedem Lesen geprueft: eine unvollstaendige
  -- Eingabe darf nicht erst an der Constraint scheitern.
  if p_reason is null
     or p_reason not in ('patient_request', 'practice_request', 'patient_moved', 'practice_moved', 'other') then
    raise exception 'cancellation reason is required' using errcode = '22023';
  end if;

  -- Halb angegeben ist nicht angegeben: Ein Datum ohne Uhrzeit waere
  -- Mitternacht, und das ist eine Erfindung, keine Angabe.
  if (p_received_on is null) <> (p_received_time is null) then
    raise exception 'cancellation receipt needs date and time' using errcode = '22023';
  end if;

  if p_received_at is not null then
    -- Der Zeitpunkt eines Absagewunsches, genau und ohne Umweg über die Ortszeit (ANN-786).
    v_eingang := p_received_at;
  elsif p_received_on is null then
    v_eingang := now();
  else
    select o.time_zone into v_tz from public.organizations o where o.id = v_org;
    if v_tz is null then
      raise exception 'organization has no time zone' using errcode = '22023';
    end if;
    v_eingang := app.local_time_instant(p_received_on + p_received_time, v_tz);
  end if;

  -- Eine Absage, die noch nicht eingegangen ist, gibt es nicht. Ohne diese
  -- Grenze liesse sich die Frist durch ein Datum in der Zukunft aushebeln.
  if v_eingang > now() then
    raise exception 'cancellation cannot be received in the future' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.staff_member_id, a.status, a.kind, a.starts_at, a.updated_at, a.occasion,
         a.training_relationship_id
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
    -- Kein Durchgriff über den gemeinsamen Kalender (ADR-022 Punkt 11).
    and app.may_write_appointment_context(a.kind)
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_alt.status = 'cancelled' then
    raise exception 'appointment is already cancelled' using errcode = '22023';
  end if;

  if v_alt.status in ('completed', 'no_show') then
    raise exception 'completed appointment must be reopened first' using errcode = '22023';
  end if;

  if v_alt.status <> 'confirmed' then
    raise exception 'documented appointment cannot be changed' using errcode = '22023';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  -- Die Frist rechnet der Server aus dem Eingang und dem vereinbarten Beginn, nie aus der
  -- Eingabezeit und nie im Browser (PROJECT_PRINCIPLES.md 8).
  v_anlass := case
    -- Nur an einer Behandlung: Ein Ereignis der Praxis, ein Trainingstermin (ANN-178) und die
    -- Ernährungsberatung (ANN-664) lösen kein Ausfallhonorar aus.
    when v_alt.kind = 'therapy' and v_alt.occasion = 'regular'
     and app.is_late_cancellation(p_reason, v_eingang, v_alt.starts_at) then 'late_cancellation'
    else null
  end;

  update public.appointments
     set status                   = 'cancelled',
         cancellation_reason      = p_reason,
         cancellation_received_at = v_eingang,
         fee_basis                = v_anlass,
         cancelled_at             = now(),
         cancelled_by             = v_actor,
         updated_at               = now()
   where id = p_appointment_id
     and updated_at = p_expected_updated_at
     and status = 'confirmed';

  if not found then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  return p_appointment_id;
end;
$$;

comment on function app.cancel_appointment_received(uuid, timestamptz, text, date, time, timestamptz) is 'Die Absage eines bestaetigten Termins hinter public.cancel_appointment: Eingang aus Datum und Uhrzeit in Ortszeit, sonst jetzt; p_received_at gibt einen Zeitpunkt genau vor, nur fuer public.cancel_appointment_from_request (ANN-786). Keine API-Rolle ruft sie direkt.';

revoke all on function app.cancel_appointment_received(uuid, timestamptz, text, date, time, timestamptz)
  from public, anon, authenticated;

create or replace function public.cancel_appointment(
  p_appointment_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text,
  p_received_on date,
  p_received_time time
)
returns uuid
language plpgsql security definer
set search_path to ''
as $$
begin
  return app.cancel_appointment_received(
    p_appointment_id, p_expected_updated_at, p_reason, p_received_on, p_received_time, null);
end;
$$;

comment on function public.cancel_appointment(uuid, timestamptz, text, date, time) is 'Sagt einen bestaetigten Termin mit Pflichtgrund ab, haelt den Eingang der Absage in Ortszeit fest, rechnet die 24-Stunden-Frist serverseitig; Eingang, Person und Zeitpunkt stehen an der Zeile, nicht im Auditlog (CAL-003, CAL-008b, CAL-014b, CAL-016, ADR-018 Fassung 2, ADR-010). Ein Gebuehrenanlass entsteht nur an einer Behandlung. Datum und Uhrzeit beide null heisst "jetzt"; eine doppelte Ortszeit (Umstellung im Herbst) gilt als die fruehere (ANN-786).';

create or replace function public.cancel_appointment_from_request(
  p_request_id uuid,
  p_expected_updated_at timestamptz
)
returns uuid
language plpgsql security definer
set search_path to ''
as $$
declare
  v_org    uuid;
  v_wunsch record;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to cancel appointments' using errcode = '42501';
  end if;

  select w.id, w.appointment_id, w.created_at, w.kind into v_wunsch
  from public.platform_appointment_requests w
  where w.id = p_request_id and w.organization_id = v_org and w.status = 'open'
  for update;
  if not found then
    raise exception 'request not found' using errcode = 'P0002';
  end if;
  if v_wunsch.kind <> 'cancel' or v_wunsch.appointment_id is null then
    raise exception 'request is not a cancellation' using errcode = '22023';
  end if;

  -- Als Eingang gilt der Zeitpunkt des Wunsches (ANN-247), genau: Rolle, Zustand, Frist und
  -- Gleichzeitigkeit prüft dieselbe Absage wie in der Oberfläche (ANN-786).
  perform app.cancel_appointment_received(
    v_wunsch.appointment_id, p_expected_updated_at, 'patient_request', null, null,
    v_wunsch.created_at);

  update public.platform_appointment_requests
     set status = 'done', resolved_at = now(), resolved_by = auth.uid()
   where id = p_request_id;

  return v_wunsch.appointment_id;
end;
$$;

create function app.nutrition_diary_reminder_due(p_now timestamptz, p_time_zone text, p_remind_at time)
returns timestamptz
language sql stable
set search_path to ''
as $$
  select app.local_time_instant((p_now at time zone p_time_zone)::date + p_remind_at, p_time_zone)
$$;

comment on function app.nutrition_diary_reminder_due(timestamptz, text, time) is 'Wann eine Erinnerung an das Tagebuch heute faellig ist: die gewaehlte Uhrzeit am heutigen Tag der Praxis; eine doppelte Ortszeit gilt als die fruehere (ANN-786). Mit festem p_now pruefbar.';

revoke all on function app.nutrition_diary_reminder_due(timestamptz, text, time)
  from public, anon, authenticated;

create or replace function public.enqueue_nutrition_diary_reminders()
returns integer
language plpgsql security definer
set search_path to ''
as $$
declare
  v_anzahl integer;
begin
  insert into public.notification_deliveries
    (organization_id, access_id, kind, channel, subject_id, subject_at, due_at)
  select r.organization_id, r.access_id, 'nutrition_diary_reminder', w.channel, r.id, z.am, z.am
  from public.nutrition_diary_reminders r
  join public.organizations o on o.id = r.organization_id
  join public.platform_notification_settings s on s.access_id = r.access_id
  cross join (values ('email'), ('push')) w(channel)
  cross join lateral (
    select app.nutrition_diary_reminder_due(now(), o.time_zone, r.remind_at) as am
  ) z
  where z.am <= now() and z.am > now() - interval '20 minutes'
    and not exists (
      select 1 from public.notification_kind_switches k
      where k.organization_id = r.organization_id and k.kind = 'nutrition_diary_reminder')
    and (
      (w.channel = 'email' and 'nutrition_diary_reminder' = any (s.email_kinds))
      or (w.channel = 'push' and 'nutrition_diary_reminder' = any (s.push_kinds)
          and exists (select 1 from public.platform_push_subscriptions p
                      where p.access_id = r.access_id))
    )
    -- Was in die Ruhezeit fiele, entfällt (ADR-024 Punkt 15): Eine
    -- Erinnerung an den heutigen Eintrag hat am nächsten Morgen keinen Sinn.
    and app.notification_due_at(
          z.am, o.time_zone,
          coalesce(s.quiet_from, app.notification_rule('quiet_from')::smallint),
          coalesce(s.quiet_until, app.notification_rule('quiet_until')::smallint)) = z.am
    and app.nutrition_diary_reminder_live(r.id, z.am)
  on conflict (access_id, kind, channel, subject_id, subject_at)
    where kind = 'nutrition_diary_reminder' do nothing;
  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;
