-- =============================================================================
-- Überholung 6 (geführte Abläufe): zwei kleine Erweiterungen am Server
--
-- 1. cancel_staff_day mit Auswahl (G2, ANN-574). „Tag umplanen“ wählt alle
--    bestätigten Behandlungstermine des Tages vor; einzelne lassen sich
--    abwählen, etwa wenn eine Kollegin einen Besuch übernimmt. Abgesagt wird
--    genau die Auswahl - weiter in einem Vorgang, alles oder nichts. Ohne
--    Auswahl bleibt alles wie bisher (der ganze Tag).
--
--    Die Auswahl muss zum Tag passen: Jede Kennung ist ein bestätigter
--    Behandlungstermin dieser Person an diesem Tag in der eigenen
--    Organisation. Sonst schreibt die Funktion nichts - eine Kennung, die nicht
--    passt, heißt, dass die Seite einen anderen Stand zeigte als den, den der
--    Server kennt, und dann soll niemand unbemerkt einen anderen Termin
--    absagen. Die Meldung ist für fremde und unpassende Kennungen dieselbe
--    (kein Orakel, PROJECT_PRINCIPLES.md 13).
--
-- 2. hand_over_fleet_key (G4, ANN-575). Ein Schlüssel, der bei jemandem liegt,
--    geht in einem Vorgang an eine andere Person aus dem Mitarbeiterstamm:
--    Der offene Vorgang endet (returned_at/by), ein neuer beginnt
--    (taken_at/by). Bisher ging das nur über „zurücklegen“ und „nehmen“ - zwei
--    Aufrufe, zwischen denen der Schlüssel im Tresor stand, obwohl er von Hand
--    zu Hand ging. Dieselben Rollen wie take_fleet_key (alle Praxisrollen der
--    Behandlung, BEF-066); nicht bei gesperrtem Rad.
--
-- Kein neues Auditereignis (ADR-010): Die Absage protokolliert je Termin wie
-- bisher, und die Übergabe ist selbst der Nachweis (wer, wann, an wen) in
-- fleet_key_handovers - wie take_fleet_key und return_fleet_key.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. cancel_staff_day mit Auswahl
-- -----------------------------------------------------------------------------
-- Eine neue Signatur statt eines Überladens: Mit einem zusätzlichen Parameter
-- mit Vorgabe gäbe es sonst zwei Funktionen desselben Namens, und PostgREST
-- wählte je nach Aufruf eine davon.
drop function public.cancel_staff_day(uuid, date, text);

create function public.cancel_staff_day(
  p_staff_member_id uuid,
  p_date            date,
  p_reason          text,
  p_appointment_ids uuid[] default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_tz      text;
  v_start   timestamptz;
  v_end     timestamptz;
  v_termin  record;
  v_anzahl  integer := 0;
  v_passend integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Die aufgerufene Funktion prueft dasselbe Recht noch einmal. Hier steht es,
  -- damit die Meldung die Ursache trifft, statt auf halbem Weg zu scheitern.
  if not app.can_cancel_appointment() then
    raise exception 'not allowed to cancel appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to cancel appointments' using errcode = '42501';
  end if;

  if p_staff_member_id is null or p_date is null then
    raise exception 'staff member and date are required' using errcode = '22023';
  end if;

  -- Der Ausfall einer behandelnden Person ist praxisbedingt. Der Grund bleibt
  -- eine Angabe - aber nicht jede (CAL-016).
  if p_reason is null or p_reason not in ('practice_request', 'practice_moved', 'other') then
    raise exception 'day rescheduling needs a practice reason' using errcode = '22023';
  end if;

  -- Eine leere Auswahl sagt nichts ab - das ist kein Umplanen, sondern ein
  -- Fehlgriff der Seite.
  if p_appointment_ids is not null and cardinality(p_appointment_ids) = 0 then
    raise exception 'appointment selection is empty' using errcode = '22023';
  end if;

  -- Zielsatz ausschliesslich in der eigenen Organisation suchen; sonst waere
  -- die Funktion ein Orakel fuer fremde Mitarbeiter-IDs
  -- (PROJECT_PRINCIPLES.md 13).
  if not exists (
    select 1 from public.staff_members sm
    where sm.id = p_staff_member_id
      and sm.organization_id = v_org
  ) then
    raise exception 'staff member not found' using errcode = 'P0002';
  end if;

  select o.time_zone into v_tz
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  -- Halboffenes Fenster [Tag 00:00, Folgetag 00:00) in der Zeitzone der Praxis
  -- - dieselbe Auslegung wie in list_day_plan und list_appointments.
  v_start := (p_date::timestamp) at time zone v_tz;
  v_end   := ((p_date + 1)::timestamp) at time zone v_tz;

  -- Die Auswahl passt zum Tag: jede Kennung genau ein bestätigter
  -- Behandlungstermin dieser Person an diesem Tag. Doppelte Kennungen zählen
  -- einmal. Gesperrt wird erst in der Schleife.
  if p_appointment_ids is not null then
    select count(*) into v_passend
    from public.appointments a
    where a.id = any (p_appointment_ids)
      and a.organization_id = v_org
      and a.staff_member_id = p_staff_member_id
      and a.starts_at >= v_start
      and a.starts_at <  v_end
      and a.status = 'confirmed'
      and a.kind = 'therapy';
    if v_passend <> (select count(distinct x) from unnest(p_appointment_ids) as x) then
      raise exception 'appointment selection does not match the day' using errcode = '22023';
    end if;
  end if;

  -- FOR UPDATE ohne SKIP LOCKED: ein Termin, an dem gerade jemand arbeitet,
  -- soll die Umplanung aufhalten und nicht stillschweigend stehen bleiben.
  for v_termin in
    select a.id, a.updated_at
    from public.appointments a
    where a.organization_id = v_org
      and a.staff_member_id = p_staff_member_id
      and a.starts_at >= v_start
      and a.starts_at <  v_end
      and a.status = 'confirmed'
      and a.kind = 'therapy'
      and (p_appointment_ids is null or a.id = any (p_appointment_ids))
    order by a.starts_at, a.id
    for update
  loop
    perform public.cancel_appointment(v_termin.id, v_termin.updated_at, p_reason, null, null);
    v_anzahl := v_anzahl + 1;
  end loop;

  -- Zwischen Prüfung und Sperre kann ein Termin der Auswahl abgeschlossen oder
  -- abgesagt worden sein: dann gilt die Auswahl nicht mehr, und alles wird
  -- zurückgenommen.
  if p_appointment_ids is not null and v_anzahl <> v_passend then
    raise exception 'appointment selection does not match the day' using errcode = '22023';
  end if;

  -- Kein eigenes Sammelereignis: je Absage steht ein appointment.cancelled im
  -- Auditlog, und das ist der auditpflichtige Vorgang (ADR-010, ADR-018
  -- Punkt 5). Ein zusaetzlicher Eintrag "Tag umgeplant" wuerde dieselbe
  -- Tatsache ein zweites Mal festhalten.
  return v_anzahl;
end;
$$;

revoke all on function public.cancel_staff_day(uuid, date, text, uuid[]) from public, anon;
grant execute on function public.cancel_staff_day(uuid, date, text, uuid[]) to authenticated;

comment on function public.cancel_staff_day(uuid, date, text, uuid[]) is
  'CAL-009, Überholung 6 (ANN-574): sagt die bestaetigten Behandlungstermine einer Person an einem Tag in einem Vorgang ab - alle oder genau die Auswahl (p_appointment_ids), die zum Tag passen muss. Praxisbedingter Grund Pflicht; Ereignisse des Praxisbetriebs bleiben. Je Termin protokolliert cancel_appointment.';

-- -----------------------------------------------------------------------------
-- 2. hand_over_fleet_key
-- -----------------------------------------------------------------------------
create function public.hand_over_fleet_key(p_bike_id uuid, p_holder_staff_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_offen   record;
  v_id      uuid;
begin
  v_org := app.fleet_org(app.can_read_fleet(), 'not allowed to use the fleet');

  if p_holder_staff_id is null then
    raise exception 'staff member is required' using errcode = '22023';
  end if;

  perform 1 from public.fleet_bikes b
  where b.id = p_bike_id and b.organization_id = v_org and b.archived_at is null
  for update;
  if not found then
    raise exception 'bike not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.fleet_blocks b where b.bike_id = p_bike_id and b.released_at is null
  ) then
    raise exception 'bike is blocked' using errcode = '55000';
  end if;

  select k.id, k.holder_staff_id into v_offen
  from public.fleet_key_handovers k
  where k.bike_id = p_bike_id and k.organization_id = v_org and k.returned_at is null
  for update;
  if not found then
    raise exception 'key is not taken' using errcode = '55000';
  end if;

  perform app.assert_staff_member_in_org(p_holder_staff_id, v_org);
  if v_offen.holder_staff_id = p_holder_staff_id then
    raise exception 'key already with this person' using errcode = '55000';
  end if;

  update public.fleet_key_handovers
     set returned_at = now(), returned_by = auth.uid()
   where id = v_offen.id;

  insert into public.fleet_key_handovers (organization_id, bike_id, holder_staff_id, taken_by)
  values (v_org, p_bike_id, p_holder_staff_id, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.hand_over_fleet_key(uuid, uuid) from public, anon;
grant execute on function public.hand_over_fleet_key(uuid, uuid) to authenticated;

comment on function public.hand_over_fleet_key(uuid, uuid) is
  'Überholung 6 (ANN-575): Schluessel eines Rads von Hand zu Hand - der offene Vorgang endet, ein neuer fuer eine andere Person aus dem Stamm beginnt, in einem Vorgang. Nicht bei gesperrtem Rad, nicht an dieselbe Person. Alle Praxisrollen der Behandlung (BEF-066).';
