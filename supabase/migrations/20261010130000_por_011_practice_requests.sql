-- =============================================================================
-- POR-011: Terminwuensche in der Praxis (DSN-001 Abschnitt 6, D4;
-- PROJECT_PRINCIPLES.md 8; ADR-018 Punkt 8)
--
-- Was von der Plattform kommt, landet dort, wo die Arbeit liegt: in Offene
-- Punkte und im Kalender. Wer Wuensche sieht und beantwortet, sind die
-- Rollen, die Termine des Kontexts verwalten (4.3; im Training ANN-176) -
-- dieselbe Stelle wie beim Termin selbst (app.may_write_appointment_context).
--
-- Drei Funktionen:
--   list_platform_appointment_requests   die Wuensche mit Person und Termin
--   resolve_platform_appointment_request erledigt oder nicht moeglich, mit
--                                        kurzer Antwort an die Person
--   cancel_appointment_from_request      die Absage aus dem Absagewunsch:
--                                        Grund patient_request, EINGANG =
--                                        Zeitpunkt des Wunsches (D4, ANN-244),
--                                        dieselbe Fristenrechnung wie heute
--
-- Die Antwort ist Nachweis am Datensatz (resolved_by), kein Auditeintrag
-- (ADR-010 Fassung 3). Die Absage selbst protokolliert cancel_appointment wie
-- bisher (appointment.cancelled).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Lesen
-- -----------------------------------------------------------------------------
create function public.list_platform_appointment_requests(p_status text default 'open')
returns table (
  id                       uuid,
  kind                     text,
  relationship_kind        text,
  patient_id               uuid,
  training_relationship_id uuid,
  given_name               text,
  family_name              text,
  appointment_id           uuid,
  appointment_starts_at    timestamptz,
  appointment_ends_at      timestamptz,
  appointment_updated_at   timestamptz,
  appointment_status       text,
  preferred_days           date[],
  preferred_times          text[],
  note                     text,
  status                   text,
  created_at               timestamptz,
  requested_by             text,
  representative_name      text,
  resolved_at              timestamptz,
  answer                   text,
  resulting_appointment_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not (app.may_write_appointment_context('therapy')
          or app.may_write_appointment_context('training')) then
    perform app.record_denied_read(auth.uid(), 'appointments.read', 'not allowed to read requests');
    return;
  end if;
  v_org := app.current_organization_id();
  if p_status is not null and p_status not in ('open', 'done', 'declined', 'withdrawn') then
    raise exception 'unknown status' using errcode = '22023';
  end if;

  return query
  select w.id, w.kind, w.relationship_kind, w.patient_id, w.training_relationship_id,
         pe.given_name, pe.family_name,
         w.appointment_id, a.starts_at, a.ends_at, a.updated_at, a.status,
         w.preferred_days, w.preferred_times, w.note, w.status, w.created_at,
         z.access_kind, case when z.access_kind <> 'self' then z.representative_name end,
         w.resolved_at, w.answer, w.resulting_appointment_id
  from public.platform_appointment_requests w
  join public.platform_accesses z on z.id = w.created_by_access_id
  left join public.patients pa on pa.id = w.patient_id
  left join public.training_relationships t on t.id = w.training_relationship_id
  left join public.persons pe on pe.id = coalesce(pa.person_id, t.person_id)
  left join public.appointments a on a.id = w.appointment_id
  where w.organization_id = v_org
    and (p_status is null or w.status = p_status)
    -- Je Kontext nur, wer dort Termine verwaltet (4.8).
    and app.may_write_appointment_context(
          case w.relationship_kind when 'training' then 'training' else 'therapy' end)
  order by (w.status <> 'open'), w.created_at, w.id;
end;
$$;

revoke all on function public.list_platform_appointment_requests(text) from public, anon;
grant execute on function public.list_platform_appointment_requests(text) to authenticated;

comment on function public.list_platform_appointment_requests(text) is
  'POR-011: Terminwuensche von der Plattform fuer die Praxis (DSN-001 Abschnitt 6): je Kontext die Rollen der Terminverwaltung (app.may_write_appointment_context). Mit Person, Termin und Urheber (Person oder Vertretung). Abgewiesen wird mit null Zeilen und denied-Eintrag.';

-- -----------------------------------------------------------------------------
-- 2. Beantworten
-- -----------------------------------------------------------------------------
create function public.resolve_platform_appointment_request(
  p_request_id               uuid,
  p_outcome                  text,
  p_answer                   text default null,
  p_resulting_appointment_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
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
    raise exception 'not allowed to resolve requests' using errcode = '42501';
  end if;
  if p_outcome is null or p_outcome not in ('done', 'declined') then
    raise exception 'unknown outcome' using errcode = '22023';
  end if;
  if p_answer is not null and length(btrim(p_answer)) > 300 then
    raise exception 'answer too long' using errcode = '22023';
  end if;

  select w.id, w.relationship_kind, w.kind into v_wunsch
  from public.platform_appointment_requests w
  where w.id = p_request_id and w.organization_id = v_org and w.status = 'open'
  for update;
  if not found then
    raise exception 'request not found' using errcode = 'P0002';
  end if;
  if not app.may_write_appointment_context(
           case v_wunsch.relationship_kind when 'training' then 'training' else 'therapy' end) then
    raise exception 'not allowed to resolve requests' using errcode = '42501';
  end if;

  -- Ein Termin als Ergebnis nur an einem erledigten Wunsch, und nur einer der
  -- eigenen Praxis.
  if p_resulting_appointment_id is not null then
    if p_outcome <> 'done' then
      raise exception 'resulting appointment needs outcome done' using errcode = '22023';
    end if;
    perform 1 from public.appointments a
    where a.id = p_resulting_appointment_id and a.organization_id = v_org;
    if not found then
      raise exception 'appointment not found' using errcode = 'P0002';
    end if;
  end if;

  update public.platform_appointment_requests
     set status = p_outcome,
         resolved_at = now(),
         resolved_by = auth.uid(),
         answer = nullif(btrim(p_answer), ''),
         resulting_appointment_id = p_resulting_appointment_id
   where id = p_request_id;
  return true;
end;
$$;

revoke all on function public.resolve_platform_appointment_request(uuid, text, text, uuid) from public, anon;
grant execute on function public.resolve_platform_appointment_request(uuid, text, text, uuid) to authenticated;

comment on function public.resolve_platform_appointment_request(uuid, text, text, uuid) is
  'POR-011: Die Praxis beantwortet einen Terminwunsch (erledigt oder nicht moeglich) mit einer kurzen Antwort an die Person; Nachweis am Datensatz (resolved_by). Rollen der Terminverwaltung des Kontexts.';

-- -----------------------------------------------------------------------------
-- 3. Die Absage aus dem Absagewunsch (D4)
-- -----------------------------------------------------------------------------
create function public.cancel_appointment_from_request(
  p_request_id          uuid,
  p_expected_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_wunsch  record;
  v_zone    text;
  v_eingang timestamptz;
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

  -- D4, ANN-244: Als Eingang gilt der Zeitpunkt des Wunsches. cancel_appointment
  -- rechnet daraus die Frist (ADR-018 Punkt 8) und prueft Rolle, Zustand und
  -- Gleichzeitigkeit wie bei jeder Absage. Der Eingang geht als Datum und
  -- Uhrzeit in Ortszeit hinein - dieselbe Schnittstelle wie die Oberflaeche.
  select o.time_zone into v_zone from public.organizations o where o.id = v_org;
  v_eingang := v_wunsch.created_at;

  perform public.cancel_appointment(
    v_wunsch.appointment_id,
    p_expected_updated_at,
    'patient_request',
    (v_eingang at time zone v_zone)::date,
    (v_eingang at time zone v_zone)::time
  );

  update public.platform_appointment_requests
     set status = 'done', resolved_at = now(), resolved_by = auth.uid()
   where id = p_request_id;

  return v_wunsch.appointment_id;
end;
$$;

revoke all on function public.cancel_appointment_from_request(uuid, timestamptz) from public, anon;
grant execute on function public.cancel_appointment_from_request(uuid, timestamptz) to authenticated;

comment on function public.cancel_appointment_from_request(uuid, timestamptz) is
  'POR-011 (DSN-001 D4, ANN-244): Die Praxis traegt die Absage aus einem Absagewunsch ein: Grund patient_request, Eingang = Zeitpunkt des Wunsches, Frist und Protokoll wie cancel_appointment. Der Wunsch wird erledigt.';
