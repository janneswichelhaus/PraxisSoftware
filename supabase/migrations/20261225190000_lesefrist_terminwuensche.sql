-- In der Lesefrist liest die Plattform nur (ADR-023 Punkt 5, „30 Tage lesend“): Terminwünsche,
-- Änderungs- und Absagewünsche weist der Server ab wie Nachrichten und Check-ins. Bisher ließ nur
-- die Liste den Knopf weg (ANN-774); einen offenen Wunsch zurückziehen geht weiter (ANN-807).

create or replace function public.request_platform_appointment(p_access_id uuid, p_days date[], p_times text[], p_note text)
returns uuid
language plpgsql security definer
set search_path to ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
  v_zone   text;
  v_heute  date;
  v_tage   date[];
  v_id     uuid;
begin
  -- Wünschen dürfen alle drei Arten des Zugangs (ADR-023 Punkt 13, W3), in der Lesefrist keine.
  if not app.platform_access_allows(p_access_id, 'request')
     or not app.platform_access_writable(p_access_id) then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;

  select o.time_zone into v_zone from public.organizations o where o.id = v_zugang.organization_id;
  v_heute := (now() at time zone v_zone)::date;

  -- Tage: mindestens einer, hoechstens 14, keiner vor heute, keiner weiter
  -- als ein Jahr voraus; doppelte werden zusammengefasst.
  select array_agg(distinct t order by t) into v_tage
  from unnest(coalesce(p_days, '{}'::date[])) t;
  if v_tage is null or cardinality(v_tage) = 0 then
    raise exception 'at least one day is required' using errcode = '22023';
  end if;
  if cardinality(v_tage) > 14 then
    raise exception 'too many days' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_tage) t where t < v_heute or t > v_heute + 365) then
    raise exception 'day out of range' using errcode = '22023';
  end if;
  if not (coalesce(p_times, '{}'::text[]) <@ array['morning', 'midday', 'afternoon']::text[]) then
    raise exception 'unknown time of day' using errcode = '22023';
  end if;
  if p_note is not null and length(btrim(p_note)) > 500 then
    raise exception 'note too long' using errcode = '22023';
  end if;

  insert into public.platform_appointment_requests (
    organization_id, relationship_kind, relationship_id, patient_id, training_relationship_id,
    kind, preferred_days, preferred_times, note, created_by_access_id, created_by
  )
  values (
    v_zugang.organization_id, v_zugang.relationship_kind, v_zugang.relationship_id,
    v_zugang.patient_id, v_zugang.training_relationship_id,
    'new', v_tage,
    (select coalesce(array_agg(distinct t), '{}'::text[]) from unnest(coalesce(p_times, '{}'::text[])) t),
    nullif(btrim(p_note), ''), v_zugang.id, auth.uid()
  )
  returning id into v_id;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'request')
  );
  return v_id;
end;
$$;

comment on function public.request_platform_appointment(uuid, date[], text[], text) is
  'POR-009: Termin wuenschen ueber die Plattform (PROJECT_PRINCIPLES.md 8, ANN-246): Tage, Tageszeiten, freie Zeile. Ein Wunsch, kein Termin; Recht request (alle Arten des Zugangs), nicht in der Lesefrist (ANN-807). Nachweis am Datensatz, Vertretung protokolliert.';

create or replace function public.request_platform_appointment_change(p_access_id uuid, p_appointment_id uuid, p_kind text, p_days date[], p_times text[], p_note text)
returns uuid
language plpgsql security definer
set search_path to ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
  v_termin record;
  v_zone   text;
  v_heute  date;
  v_tage   date[];
  v_id     uuid;
begin
  if not app.platform_access_allows(p_access_id, 'request')
     or not app.platform_access_writable(p_access_id) then
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

  -- Wunschtage nur bei einer Aenderung; dieselben Grenzen wie beim neuen Wunsch.
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

comment on function public.request_platform_appointment_change(uuid, uuid, text, date[], text[], text) is
  'POR-010: Aenderungs- oder Absagewunsch am eigenen bestaetigten, kuenftigen Termin (DSN-001 D4, ANN-247), nicht in der Lesefrist (ANN-807). Ein Wunsch, keine Absage; als Eingang gilt spaeter der Zeitpunkt des Wunsches. Hoechstens ein offener Wunsch je Termin (23505).';
