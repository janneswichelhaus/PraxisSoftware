-- =============================================================================
-- Dauerfehlzeit: eine Serie gleichartiger Ereignisse (CAL-021)
--
-- Eine Fehlzeit ist ein Ereignis - dieselbe Tabelle, derselbe Zustandsautomat,
-- dieselben Regeln (PROJECT_PRINCIPLES.md 8.1 "keine Behandlung", 19 "keine
-- abrechenbare Leistung"). Neu ist allein die WIEDERHOLUNG: das Teammeeting
-- jeden Dienstag, die Mittagspause jeden Tag.
--
-- Vier Festlegungen:
--
--   * EINE ZWEITE KENNUNG, NICHT EINE DOPPELT BELEGTE (ANN-059). CAL-017 hat
--     die `event_group_id`: Zeilen mit derselben Kennung sind DASSELBE
--     Ereignis - eine Zeit, mehrere Beteiligte, gemeinsam geaendert und
--     abgesagt. Genau darauf steht "dieses Vorkommen". Traege dieselbe Spalte
--     auch die Serie, waere "dieses Vorkommen" nicht mehr ausdrueckbar: Jede
--     Aenderung an einer Woche traefe alle sechs. Deshalb eine zweite Spalte
--     neben der ersten - `event_series_id` klammert die Gruppen, die Gruppe
--     klammert weiter die Beteiligten.
--   * KEINE ZWEITE FACHLOGIK. `create_event_series` ruft je Vorkommen
--     `create_appointment_event` auf, `update_event_series` ruft
--     `update_appointment_event`, `cancel_event_series` ruft
--     `cancel_appointment_event` - dasselbe Muster wie
--     `create_appointment_series` (CAL-007) und `cancel_staff_day` (CAL-009).
--     Raster, Arbeitszeit, Ueberschneidung, Berechtigung und Auditeintrag
--     gelten damit unveraendert und an genau einer Stelle.
--   * DIE SERIE IST KEINE ENTITAET. ADR-018 Punkt 5 gilt hier wie bei der
--     Terminserie: keine Tabelle, kein Serienstatus, kein eigener Uebergang.
--     Die Kennung ist eine Klammer, kein Zustandstraeger; jedes Vorkommen
--     traegt seinen Zustand selbst.
--   * SERIENWEITE VORGAENGE WIRKEN NACH VORN (ANN-059). Geaendert und abgesagt
--     werden die noch nicht begonnenen Vorkommen. Ein Teammeeting, das letzte
--     Woche stattgefunden hat, wird nicht nachtraeglich zu einem abgesagten -
--     das waere eine Aussage ueber die Vergangenheit, die niemand getroffen
--     hat (PROJECT_PRINCIPLES.md 13).
--
-- Bewusst NICHT hier: ein Ende der Serie als Datum ("bis 31.12."), das
-- Einfuegen weiterer Vorkommen in eine bestehende Serie, Ausnahmen einzelner
-- Wochen als eigenes Merkmal. Nichts davon braucht CAL-021, und ADR-014
-- verbietet den Vorbau. Wer ein einzelnes Vorkommen anders legen will, aendert
-- es als Vorkommen; wer die Serie verlaengern will, legt eine zweite an.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die zweite Klammer
-- -----------------------------------------------------------------------------
alter table public.appointments add column event_series_id uuid;

comment on column public.appointments.event_series_id is
  'Klammer ueber die Vorkommen EINER Serie gleichartiger Ereignisse - Dauerfehlzeit (CAL-021, ANN-059). Neben event_group_id, nicht statt ihrer: die Gruppe ist ein Vorkommen, die Serie sind alle. Null bei jedem Ereignis, das keiner Serie angehoert.';

-- Eine Serienkennung an einer Behandlung waere ein Widerspruch: Serien von
-- Behandlungen sind Terminserien, und die sind ausdruecklich keine Entitaet
-- (CAL-007, ADR-018 Punkt 5).
alter table public.appointments
  add constraint appointments_event_series check (
    event_series_id is null or kind = 'event'
  );

create index appointments_event_series_idx
  on public.appointments (organization_id, event_series_id)
  where event_series_id is not null;

-- -----------------------------------------------------------------------------
-- 2. Wie die Kennung an die Zeile kommt
--
-- `create_appointment_event` legt die Zeilen an, und es soll dabei bleiben
-- (keine zweite Fachlogik). Die Funktion kennt aber keine Serie. Statt ihre
-- Signatur zu erweitern - ein weiterer Parameter mit Vorbelegung macht jeden
-- bestehenden Aufruf mehrdeutig - traegt die Serie sich selbst ein:
-- `create_event_series` setzt die Kennung transaktionslokal, ein Trigger
-- stempelt sie auf die Zeilen, die in dieser Transaktion entstehen.
--
-- Dasselbe Muster wie `app.event_group_update` in CAL-017: eine Einstellung,
-- die mit der Transaktion endet, von genau einer Funktion gesetzt und dort
-- ausdruecklich wieder zurueckgenommen wird.
-- -----------------------------------------------------------------------------
create function app.serie_kennung()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(coalesce(current_setting('app.event_series_id', true), ''), '')::uuid;
$$;

comment on function app.serie_kennung() is
  'Die Serie, zu der die Ereignisse dieser Transaktion gehoeren - oder null. Nur create_event_series setzt sie, transaktionslokal (CAL-021).';

create function public.appointments_event_series_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'event' and new.event_series_id is null then
    new.event_series_id := app.serie_kennung();
  end if;
  return new;
end;
$$;

comment on function public.appointments_event_series_stamp() is
  'Traegt die laufende Serienkennung in ein neu angelegtes Ereignis ein (CAL-021). Ausserhalb von create_event_series ist sie nicht gesetzt, und die Zeile bleibt ohne Serie.';

create trigger appointments_event_series_stamp
  before insert on public.appointments
  for each row execute function public.appointments_event_series_stamp();

-- -----------------------------------------------------------------------------
-- 3. Der Riegel aus CAL-017 deckt die zweite Kennung mit ab
--
-- Unveraendert aus 20260913100000_event_groups.sql bis auf die erste
-- Bedingung: Die Serienkennung wird beim Anlegen gesetzt und danach von
-- keinem Schreibweg mehr angefasst. Sie steht VOR der Ausnahme fuer die
-- gruppenweite Aenderung, denn auch diese hat an ihr nichts zu suchen - ein
-- Vorkommen wechselt nicht die Serie.
-- -----------------------------------------------------------------------------
create or replace function public.appointments_event_group_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.event_series_id is distinct from old.event_series_id then
    raise exception 'event series cannot be changed' using errcode = '22023';
  end if;

  if new.kind <> 'event' then
    return new;
  end if;

  if app.ereignis_gruppenweise_aktiv() then
    return new;
  end if;

  if new.title            is distinct from old.title
     or new.starts_at        is distinct from old.starts_at
     or new.ends_at          is distinct from old.ends_at
     or new.appointment_type is distinct from old.appointment_type
     or new.location_id      is distinct from old.location_id
     or new.event_group_id   is distinct from old.event_group_id then
    raise exception 'event must be changed as a whole' using errcode = '22023';
  end if;

  return new;
end;
$$;

comment on function public.appointments_event_group_guard() is
  'Haelt die Zeilen eines Ereignisses zusammen: Bezeichnung, Zeit, Art und Ort aendert nur update_appointment_event, und dann fuer alle Beteiligten zugleich (CAL-017). Die Serienkennung aendert ueberhaupt kein Schreibweg (CAL-021). Der Wechsel der beteiligten Person, die Absage und das Wiederoeffnen einer einzelnen Teilnahme bleiben moeglich.';

-- -----------------------------------------------------------------------------
-- 4. Die Serie anlegen
--
-- Die Tage kommen fertig gerechnet aus der Oberflaeche (`serienTermine`,
-- dieselbe Rechnung wie bei der Terminserie, dieselben drei Rhythmen). Die
-- Datenbank prueft, dass sie aufsteigend und verschieden sind - eine Serie
-- mit zwei Vorkommen am selben Tag zur selben Zeit koennte gar nicht
-- entstehen, sie schluege an der Ueberschneidung fehl, aber erst nach dem
-- halben Vorgang.
-- -----------------------------------------------------------------------------
create function public.create_event_series(
  p_title            text,
  p_staff_member_ids uuid[],
  p_appointment_type text,
  p_dates            date[],
  p_start_time       time,
  p_end_time         time,
  p_location_id      uuid default null,
  p_allow_outside_working_hours boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_serie  uuid;
  v_anzahl integer;
  v_i      integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Die aufgerufene Funktion prueft dasselbe Recht noch einmal. Hier steht es,
  -- damit die Meldung die Ursache trifft, statt auf halbem Weg zu scheitern.
  if not app.can_create_appointment() then
    raise exception 'not allowed to create appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to create appointments' using errcode = '42501';
  end if;

  v_anzahl := coalesce(array_length(p_dates, 1), 0);

  if v_anzahl = 0 then
    raise exception 'series needs at least one date' using errcode = '22023';
  end if;

  if v_anzahl > app.appointment_series_limit() then
    raise exception 'series is limited to % appointments', app.appointment_series_limit()
      using errcode = '22023';
  end if;

  for v_i in 1 .. v_anzahl loop
    if p_dates[v_i] is null then
      raise exception 'series date % is missing', v_i using errcode = '22023';
    end if;
    if v_i > 1 and p_dates[v_i] <= p_dates[v_i - 1] then
      raise exception 'series dates must be distinct and ascending' using errcode = '22023';
    end if;
  end loop;

  v_serie := gen_random_uuid();
  perform set_config('app.event_series_id', v_serie::text, true);

  for v_i in 1 .. v_anzahl loop
    -- Die Ueberschneidung bekommt ihren Tag mit: Bei einer Serie ueber sechs
    -- Wochen ist "jemand ist belegt" ohne das Datum keine brauchbare Auskunft.
    begin
      perform public.create_appointment_event(
        p_title,
        p_staff_member_ids,
        p_appointment_type,
        p_dates[v_i],
        p_start_time,
        p_end_time,
        p_location_id,
        p_allow_outside_working_hours
      );
    exception
      when sqlstate '23P01' then
        raise exception 'occurrence on % overlaps an existing appointment', p_dates[v_i]
          using errcode = '23P01';
    end;
  end loop;

  perform set_config('app.event_series_id', '', true);

  return v_serie;
end;
$$;

comment on function public.create_event_series(text, uuid[], text, date[], time, time, uuid, boolean) is
  'Legt eine Serie gleichartiger Ereignisse an - je Tag ein Vorkommen, je Vorkommen eine Zeile pro beteiligter Person, alles oder nichts (CAL-021). Ruft je Vorkommen create_appointment_event auf und gibt die Serienkennung zurueck.';

revoke all on function public.create_event_series(text, uuid[], text, date[], time, time, uuid, boolean)
  from public, anon;
grant execute on function public.create_event_series(text, uuid[], text, date[], time, time, uuid, boolean)
  to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Die Serie lesen
--
-- Ein Zeile je Vorkommen, dazu der juengste Stand der ganzen Serie - genau
-- den erwarten die beiden serienweiten Schreibwege, wie die Gruppe ihn in
-- `list_event_participants` liefert.
-- -----------------------------------------------------------------------------
create function public.list_event_series(p_event_series_id uuid)
returns table (
  event_group_id    uuid,
  title             text,
  starts_at         timestamptz,
  ends_at           timestamptz,
  open_count        integer,
  cancelled_count   integer,
  series_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_stand timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_appointments() then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  if p_event_series_id is null then
    raise exception 'event series is required' using errcode = '22023';
  end if;

  select max(a.updated_at) into v_stand
  from public.appointments a
  where a.organization_id = v_org
    and a.event_series_id = p_event_series_id;

  return query
    select a.event_group_id,
           min(a.title),
           min(a.starts_at),
           max(a.ends_at),
           count(*) filter (where a.status <> 'cancelled')::integer,
           count(*) filter (where a.status =  'cancelled')::integer,
           v_stand
    from public.appointments a
    where a.organization_id = v_org
      and a.event_series_id = p_event_series_id
    group by a.event_group_id
    order by min(a.starts_at);
end;
$$;

comment on function public.list_event_series(uuid) is
  'Die Vorkommen EINER Serie gleichartiger Ereignisse mit Zeit, Bezeichnung und Zustand, dazu der juengste Stand der Serie (CAL-021). Kein klinischer Inhalt, kein Patientenbezug.';

revoke all on function public.list_event_series(uuid) from public, anon;
grant execute on function public.list_event_series(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Die ganze Serie aendern
--
-- Bezeichnung, Uhrzeit, Laenge, Art und Ort - fuer jedes noch nicht begonnene
-- Vorkommen. NICHT das Datum: Die Tage sind der Rhythmus, und eine Serie um
-- Tage zu verschieben hiesse, sie neu zu rechnen. Wer das will, sagt sie ab
-- und legt eine neue an; wer eine Woche anders legen will, aendert dieses
-- Vorkommen.
--
-- Uebersprungen wird, was schon begonnen hat oder eine abgesagte Zeile traegt:
-- `update_appointment_event` wiese beides ab, und ein Vorgang, der an Woche
-- drei scheitert, weil Woche eins vorbei ist, waere unbrauchbar.
-- -----------------------------------------------------------------------------
create function public.update_event_series(
  p_event_series_id     uuid,
  p_expected_updated_at timestamptz,
  p_title               text,
  p_appointment_type    text,
  p_start_time          time,
  p_end_time            time,
  p_location_id         uuid default null,
  p_allow_outside_working_hours boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org      uuid;
  v_tz       text;
  v_stand    timestamptz;
  v_vorkommen record;
  v_anzahl   integer := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_update_appointment() then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  if p_event_series_id is null or p_expected_updated_at is null then
    raise exception 'event series and expected updated_at are required' using errcode = '22023';
  end if;

  select o.time_zone into v_tz
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  -- Erst sperren, dann pruefen: sonst entschiede ein paralleler Vorgang
  -- zwischen Pruefung und Schreiben (wie in update_appointment_event).
  perform 1
  from public.appointments a
  where a.organization_id = v_org
    and a.event_series_id = p_event_series_id
  for update;

  select max(a.updated_at) into v_stand
  from public.appointments a
  where a.organization_id = v_org
    and a.event_series_id = p_event_series_id;

  if v_stand is null then
    raise exception 'event series not found' using errcode = 'P0002';
  end if;

  if v_stand is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  for v_vorkommen in
    select a.event_group_id,
           min(a.starts_at) as beginn,
           max(a.updated_at) as stand
    from public.appointments a
    where a.organization_id = v_org
      and a.event_series_id = p_event_series_id
    group by a.event_group_id
    having min(a.starts_at) > now()
       and count(*) filter (where a.status <> 'confirmed') = 0
    order by min(a.starts_at)
  loop
    perform public.update_appointment_event(
      v_vorkommen.event_group_id,
      v_vorkommen.stand,
      p_title,
      p_appointment_type,
      (v_vorkommen.beginn at time zone v_tz)::date,
      p_start_time,
      p_end_time,
      p_location_id,
      p_allow_outside_working_hours
    );
    v_anzahl := v_anzahl + 1;
  end loop;

  return v_anzahl;
end;
$$;

comment on function public.update_event_series(uuid, timestamptz, text, text, time, time, uuid, boolean) is
  'Aendert Bezeichnung, Uhrzeit, Laenge, Art und Ort ALLER noch nicht begonnenen Vorkommen einer Serie in einer Transaktion (CAL-021, ANN-059). Die Tage bleiben; begonnene und abgesagte Vorkommen bleiben unberuehrt. Erwartet den juengsten Stand der Serie.';

revoke all on function public.update_event_series(uuid, timestamptz, text, text, time, time, uuid, boolean)
  from public, anon;
grant execute on function public.update_event_series(uuid, timestamptz, text, text, time, time, uuid, boolean)
  to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Die ganze Serie absagen
--
-- Je Vorkommen `cancel_appointment_event`, und das ruft je Zeile
-- `cancel_appointment`. Dort stehen Berechtigung, Zustandspruefung,
-- Auditeintrag - und die Gewissheit, dass an einem Ereignis kein
-- Gebuehrenanlass entsteht (CAL-016).
-- -----------------------------------------------------------------------------
create function public.cancel_event_series(
  p_event_series_id     uuid,
  p_expected_updated_at timestamptz,
  p_reason              text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org       uuid;
  v_stand     timestamptz;
  v_vorkommen record;
  v_anzahl    integer := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_cancel_appointment() then
    raise exception 'not allowed to cancel appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to cancel appointments' using errcode = '42501';
  end if;

  if p_event_series_id is null or p_expected_updated_at is null then
    raise exception 'event series and expected updated_at are required' using errcode = '22023';
  end if;

  perform 1
  from public.appointments a
  where a.organization_id = v_org
    and a.event_series_id = p_event_series_id
  for update;

  select max(a.updated_at) into v_stand
  from public.appointments a
  where a.organization_id = v_org
    and a.event_series_id = p_event_series_id;

  if v_stand is null then
    raise exception 'event series not found' using errcode = 'P0002';
  end if;

  if v_stand is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  for v_vorkommen in
    select a.event_group_id,
           max(a.updated_at) as stand
    from public.appointments a
    where a.organization_id = v_org
      and a.event_series_id = p_event_series_id
    group by a.event_group_id
    having min(a.starts_at) > now()
       and count(*) filter (where a.status = 'confirmed') > 0
    order by min(a.starts_at)
  loop
    perform public.cancel_appointment_event(
      v_vorkommen.event_group_id,
      v_vorkommen.stand,
      p_reason
    );
    v_anzahl := v_anzahl + 1;
  end loop;

  -- Kein eigenes Sammelereignis: je Absage steht ein appointment.cancelled im
  -- Auditlog, und das ist der auditpflichtige Vorgang (ADR-010).
  return v_anzahl;
end;
$$;

comment on function public.cancel_event_series(uuid, timestamptz, text) is
  'Sagt alle noch nicht begonnenen Vorkommen einer Serie gleichartiger Ereignisse in einer Transaktion ab und liefert ihre Anzahl (CAL-021, ANN-059). Begonnene Vorkommen bleiben stehen. Ein Gebuehrenanlass entsteht dabei nie (CAL-016).';

revoke all on function public.cancel_event_series(uuid, timestamptz, text) from public, anon;
grant execute on function public.cancel_event_series(uuid, timestamptz, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Die Serienkennung in der Terminsicht
--
-- Unveraendert aus 20260916100000_home_visit_scenarios.sql bis auf die eine
-- Spalte. Die Detailansicht braucht sie, um von einem Vorkommen zur Serie zu
-- kommen - und um ueberhaupt zu wissen, dass es eine gibt.
-- -----------------------------------------------------------------------------
drop view public.appointment_directory;

create view public.appointment_directory
with (security_invoker = true) as
select
  a.id,
  a.organization_id,
  a.patient_id,
  a.staff_member_id,
  a.location_id,
  a.prescription_id,
  a.appointment_type,
  a.kind,
  a.title,
  a.event_group_id,
  a.event_series_id,
  a.status,
  a.starts_at,
  a.ends_at,
  a.updated_at,
  a.visit_street,
  a.visit_house_number,
  a.visit_postal_code,
  a.visit_city,
  a.completed_at,
  a.cancellation_reason,
  a.cancellation_received_at,
  a.fee_basis,
  a.no_show_recorded_at,
  a.no_show_protocol_confirmed,
  pp.given_name  as patient_given_name,
  pp.family_name as patient_family_name,
  sp.given_name  as staff_given_name,
  sp.family_name as staff_family_name,
  l.name         as location_name,
  o.time_zone    as organization_time_zone,
  -- Nur die Wege, nicht wer wann vermerkt hat: Akteure stehen im Auditlog
  -- (ADR-010), und die Detailansicht zeigt sie auch sonst nicht.
  coalesce(
    (select array_agg(distinct n.channel order by n.channel)
     from public.appointment_notifications n
     where n.appointment_id = a.id
       and n.notified_at >= a.updated_at),
    array[]::text[]
  ) as notification_channels
from public.appointments a
left join public.patients p  on p.id  = a.patient_id
left join public.persons pp  on pp.id = p.person_id
join public.staff_members sm on sm.id = a.staff_member_id
join public.persons sp       on sp.id = sm.person_id
join public.organizations o  on o.id  = a.organization_id
left join public.locations l on l.id = a.location_id;

comment on view public.appointment_directory is
  'Terminsicht fuer die Anwendung, Behandlungen wie Ereignisse. security_invoker: RLS der Basistabellen gilt unveraendert. Enthaelt nur organisatorische Angaben. Die vermerkende Person bleibt aussen vor - Akteure stehen im Auditlog (ADR-010). Seit CAL-017 mit der Gruppenkennung des Ereignisses, seit CAL-018 mit der Protokollbestaetigung des Nichtantreffens, seit CAL-021 mit der Serienkennung der Dauerfehlzeit.';

revoke all on public.appointment_directory from anon, authenticated;
grant select on public.appointment_directory to authenticated;
