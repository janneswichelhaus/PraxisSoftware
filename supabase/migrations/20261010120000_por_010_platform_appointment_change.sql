-- =============================================================================
-- POR-010: Termin aendern oder absagen - als Wunsch (DSN-001 4.1, D4;
-- PROJECT_PRINCIPLES.md 8; ADR-018 Punkt 8; ADR-023 Punkte 19, 23, 24)
--
-- Am eigenen bestaetigten Termin kann die Person einen Aenderungs- oder
-- Absagewunsch hinterlassen (ANN-244). Beides ist ein Wunsch (8, D4): Die
-- Absage traegt das Buero ein, und als Eingang der Absage (ADR-018 Punkt 8
-- Nr. 1) gilt der Zeitpunkt des Wunsches - das macht POR-011 mit
-- `cancel_appointment_from_request`. Hier entsteht nur der Datensatz.
--
-- Die Frist rechnet der Server (8, ADR-018 Punkt 8 Nr. 2): `platform_
-- appointments` sagt je kuenftigem Termin, ob ein Absagewunsch JETZT unter
-- 24 Stunden laege (`late_notice`), damit die Oberflaeche den Hinweis zum
-- Ausfallhonorar deutlich zeigt, bevor die Person sendet. Ausserdem nennt sie
-- den offenen Wunsch am Termin (`open_request_kind`): hoechstens einer je
-- Termin (Index aus POR-009).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Aenderungs- oder Absagewunsch am eigenen Termin
-- -----------------------------------------------------------------------------
create function public.request_platform_appointment_change(
  p_access_id      uuid,
  p_appointment_id uuid,
  p_kind           text,
  p_days           date[],
  p_times          text[],
  p_note           text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
  v_termin record;
  v_zone   text;
  v_heute  date;
  v_tage   date[];
  v_id     uuid;
begin
  if not app.platform_access_allows(p_access_id, 'request') then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;

  if p_kind is null or p_kind not in ('change', 'cancel') then
    raise exception 'unknown request kind' using errcode = '22023';
  end if;

  -- Nur der eigene, bestaetigte, kuenftige Termin. Ein fremder und ein nicht
  -- vorhandener sehen gleich aus.
  select a.id, a.status, a.starts_at into v_termin
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_zugang.organization_id
    and (
      (v_zugang.relationship_kind = 'treatment' and a.kind = 'therapy'
         and a.patient_id = v_zugang.relationship_id)
      or
      (v_zugang.relationship_kind = 'training' and a.kind = 'training'
         and a.training_relationship_id = v_zugang.relationship_id)
    );
  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;
  if v_termin.status <> 'confirmed' then
    raise exception 'appointment is not confirmed' using errcode = '22023';
  end if;
  if v_termin.starts_at <= now() then
    raise exception 'appointment has started' using errcode = '22023';
  end if;

  select o.time_zone into v_zone from public.organizations o where o.id = v_zugang.organization_id;
  v_heute := (now() at time zone v_zone)::date;

  -- Wunschtage nur bei einer Aenderung; dieselben Grenzen wie POR-009.
  if p_kind = 'change' then
    select coalesce(array_agg(distinct t order by t), '{}'::date[]) into v_tage
    from unnest(coalesce(p_days, '{}'::date[])) t;
    if cardinality(v_tage) > 14 then
      raise exception 'too many days' using errcode = '22023';
    end if;
    if exists (select 1 from unnest(v_tage) t where t < v_heute or t > v_heute + 365) then
      raise exception 'day out of range' using errcode = '22023';
    end if;
    if not (coalesce(p_times, '{}'::text[]) <@ array['morning', 'midday', 'afternoon']::text[]) then
      raise exception 'unknown time of day' using errcode = '22023';
    end if;
  else
    v_tage := '{}'::date[];
  end if;
  if p_note is not null and length(btrim(p_note)) > 500 then
    raise exception 'note too long' using errcode = '22023';
  end if;

  begin
    insert into public.platform_appointment_requests (
      organization_id, relationship_kind, relationship_id, patient_id, training_relationship_id,
      appointment_id, kind, preferred_days, preferred_times, note, created_by_access_id, created_by
    )
    values (
      v_zugang.organization_id, v_zugang.relationship_kind, v_zugang.relationship_id,
      v_zugang.patient_id, v_zugang.training_relationship_id,
      p_appointment_id, p_kind, v_tage,
      case when p_kind = 'change'
        then (select coalesce(array_agg(distinct t), '{}'::text[])
              from unnest(coalesce(p_times, '{}'::text[])) t)
        else '{}'::text[] end,
      nullif(btrim(p_note), ''), v_zugang.id, auth.uid()
    )
    returning id into v_id;
  exception when unique_violation then
    raise exception 'request already open' using errcode = '23505';
  end;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read',
    jsonb_build_object('view', 'request_' || p_kind)
  );
  return v_id;
end;
$$;

revoke all on function public.request_platform_appointment_change(uuid, uuid, text, date[], text[], text)
  from public, anon;
grant execute on function public.request_platform_appointment_change(uuid, uuid, text, date[], text[], text)
  to authenticated;

comment on function public.request_platform_appointment_change(uuid, uuid, text, date[], text[], text) is
  'POR-010: Aenderungs- oder Absagewunsch am eigenen bestaetigten, kuenftigen Termin (DSN-001 D4, ANN-244). Ein Wunsch, keine Absage; als Eingang gilt spaeter der Zeitpunkt des Wunsches. Hoechstens ein offener Wunsch je Termin (23505).';

-- -----------------------------------------------------------------------------
-- 2. platform_appointments mit Frist und offenem Wunsch
-- -----------------------------------------------------------------------------
drop function public.platform_appointments(uuid);

create function public.platform_appointments(p_access_id uuid)
returns table (
  id                 uuid,
  starts_at          timestamptz,
  ends_at            timestamptz,
  appointment_type   text,
  status             text,
  staff_name         text,
  location_name      text,
  visit_street       text,
  visit_house_number text,
  visit_postal_code  text,
  visit_city         text,
  -- POR-010: Ein Absagewunsch jetzt laege unter 24 Stunden (ADR-018 Punkt 8;
  -- vom Server gerechnet, nie im Browser). Nur am bestaetigten kuenftigen
  -- Termin, sonst null.
  late_notice        boolean,
  -- POR-010: der offene Wunsch an diesem Termin (change, cancel) oder null.
  open_request_kind  text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
begin
  if not app.platform_access_allows(p_access_id, 'read') then
    return;
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'appointments')
  );

  return query
  select a.id,
         a.starts_at,
         a.ends_at,
         a.appointment_type,
         case a.status
           when 'documented' then 'completed'
           when 'invoiced' then
             case a.fee_basis
               when 'no_show' then 'no_show'
               when 'late_cancellation' then 'cancelled'
               else 'completed'
             end
           else a.status
         end,
         nullif(concat_ws(' ', pe.given_name, pe.family_name), ''),
         l.name,
         a.visit_street,
         a.visit_house_number,
         a.visit_postal_code,
         a.visit_city,
         case when a.status = 'confirmed' and a.starts_at > now()
           then a.starts_at - now() < app.cancellation_notice_period()
         end,
         (select w.kind from public.platform_appointment_requests w
           where w.appointment_id = a.id and w.status = 'open' limit 1)
  from public.appointments a
  left join public.staff_members s on s.id = a.staff_member_id
  left join public.persons pe on pe.id = s.person_id
  left join public.locations l on l.id = a.location_id
  where a.organization_id = v_zugang.organization_id
    and (
      (v_zugang.relationship_kind = 'treatment'
         and a.kind = 'therapy'
         and a.patient_id = v_zugang.relationship_id)
      or
      (v_zugang.relationship_kind = 'training'
         and a.kind = 'training'
         and a.training_relationship_id = v_zugang.relationship_id)
    )
    and a.starts_at >= now() - app.platform_appointment_history()
  order by a.starts_at, a.id;
end;
$$;

revoke all on function public.platform_appointments(uuid) from public, anon;
grant execute on function public.platform_appointments(uuid) to authenticated;

comment on function public.platform_appointments(uuid) is
  'POR-008/POR-010: Plattformprojektion "Termine" (DSN-001 4.1): die eigenen Termine des Verhaeltnisses hinter einem lesbaren Zugang, kuenftige und die der letzten zwoelf Monate (ANN-248), mit Frist des Ausfallhonorars (late_notice, ADR-018 Punkt 8) und offenem Wunsch. Feste Spaltenliste (ADR-023 Punkt 22). Ueber eine Vertretung protokolliert (Punkt 24).';
