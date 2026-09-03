-- =============================================================================
-- Audit fuer Arbeitszeitaenderungen (CAL-005, Nachtrag)
--
-- Der Auftrag verlangt Auditereignisse fuer Schreibvorgaenge an Arbeitszeiten.
-- In der ersten Umsetzung fehlten sie; nachgetragen wird hier, ohne die
-- Fachlogik zu veraendern.
--
-- Ereignisnamen folgen dem bestehenden Katalog `<subjekt>.<partizip>`
-- (patient.created, appointment.cancelled, organization.appointment_grid_changed):
--
--   staff_working_hours.created / .updated / .removed
--   staff_working_hour_exception.created / .updated / .removed
--
-- Beide RPCs ersetzen eine organisatorische Einheit vollstaendig - einen
-- Wochentag beziehungsweise einen Kalendertag. Die Art des Vorgangs ergibt
-- sich deshalb aus dem Vergleich von vorher und nachher:
--
--   vorher leer, nachher belegt  -> created
--   vorher belegt, nachher leer  -> removed  (wirksame Aufhebung)
--   beides belegt                -> updated
--   beides gleich                -> gar nichts (No-op)
--
-- Ein No-op schreibt weder Daten noch Audit - dieselbe Festlegung wie bei
-- update_appointment und set_appointment_grid.
--
-- Atomar ist das von selbst: eine plpgsql-Funktion laeuft in EINER Transaktion.
-- Schlaegt die Fachaenderung fehl, wird die Funktion mit einer Ausnahme
-- verlassen und der Auditeintrag rollt mit zurueck. Es kann damit weder eine
-- halbe Fachaenderung noch ein isoliertes Erfolgsaudit entstehen.
--
-- Auditkontext strikt nach Auftrag: Akteur und Organisation als Spalten,
-- dazu ausschliesslich surface, staff_member_id, record_ids und - bei den
-- Abweichungen - die Art der Aktion. AUSDRUECKLICH NICHT: Mitarbeitername,
-- konkrete Beginn- und Endzeiten, Wochentag, Datum, private Daten, Notizen,
-- Patientenbezug (ADR-010).
--
-- ANN-004 (docs/decisions/ASSUMPTIONS.md): Dieser Zuschnitt des Auditkontexts
-- ist eine vorlaeufige Annahme fuer beide Funktionen dieser Datei.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Ereigniskatalog (ADR-010)
--
-- Muss deckungsgleich mit AUDIT_ACTIONS in src/features/audit/actions.ts
-- bleiben; ein Datenbanktest prueft beides gegeneinander.
-- -----------------------------------------------------------------------------
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in (
    'patient_record.viewed',
    'audit_log.read',
    'patient.created',
    'patient.updated',
    'patient.status_changed',
    'appointment.created',
    'appointment.updated',
    'appointment.rescheduled',
    'appointment.cancelled',
    'appointment.completed',
    'appointment.reopened',
    'organization.appointment_grid_changed',
    'staff_working_hours.created',
    'staff_working_hours.updated',
    'staff_working_hours.removed',
    'staff_working_hour_exception.created',
    'staff_working_hour_exception.updated',
    'staff_working_hour_exception.removed'
  ));

-- Der Gegenstand des Ereignisses. Die beiden Ebenen bleiben getrennt: ein
-- Wochenplan und eine datumsbezogene Abweichung sind fachlich verschiedene
-- Dinge und sollen im Auditlog auch getrennt filterbar sein.
alter table public.audit_log drop constraint audit_log_subject_type_check;
alter table public.audit_log add constraint audit_log_subject_type_check
  check (subject_type in (
    'patient',
    'organization',
    'appointment',
    'staff_working_hours',
    'staff_working_hour_exception'
  ));

-- -----------------------------------------------------------------------------
-- Art des Vorgangs aus vorher/nachher
--
-- Reine Rechnung ohne Datenzugriff. Ausgelagert, weil beide Schreibpfade
-- dieselbe Regel brauchen und sie nur an einer Stelle stehen soll.
-- -----------------------------------------------------------------------------
create or replace function app.working_hour_action(p_vorher integer, p_nachher integer)
returns text
language sql
immutable
as $$
  select case
           when p_vorher = 0 and p_nachher > 0 then 'created'
           when p_vorher > 0 and p_nachher = 0 then 'removed'
           else 'updated'
         end
$$;

comment on function app.working_hour_action(integer, integer) is
  'Leitet aus Anzahl vorher und nachher die Art des Arbeitszeitvorgangs ab: created, updated oder removed (CAL-005).';

grant execute on function app.working_hour_action(integer, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- set_staff_working_hours
--
-- Unveraendert in der Fachlogik. Neu: Zeitzonenpruefung wie an den uebrigen
-- Schreibpfaden, No-op-Erkennung vor jedem Schreibzugriff und der
-- Auditeintrag in derselben Transaktion.
-- -----------------------------------------------------------------------------
create or replace function public.set_staff_working_hours(
  p_staff_member_id uuid,
  p_weekday         smallint,
  p_blocks          jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid;
  v_org      uuid;
  v_tz       text;
  v_alt      jsonb;
  v_neu      jsonb;
  v_alt_ids  uuid[];
  v_neu_ids  uuid[];
  v_aktion   text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_working_hours() then
    raise exception 'not allowed to manage working hours' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage working hours' using errcode = '42501';
  end if;

  -- Arbeitszeiten sind Ortszeiten. Ohne hinterlegte Praxiszeitzone waeren sie
  -- nicht auswertbar; dieselbe Vorbedingung gilt an allen Schreibpfaden mit
  -- Zeitbezug (CAL-001).
  select o.time_zone into v_tz
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  if p_weekday is null or p_weekday not between 1 and 7 then
    raise exception 'weekday must be between 1 and 7' using errcode = '22023';
  end if;

  -- Fremde und unbekannte Personen sind ununterscheidbar.
  if not app.is_assignable_therapist(p_staff_member_id, v_org) then
    raise exception 'staff member not assignable' using errcode = 'P0002';
  end if;

  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' then
    raise exception 'blocks must be an array' using errcode = '22023';
  end if;

  -- Bestehender Stand, normalisiert und sortiert - Grundlage fuer die
  -- No-op-Erkennung und fuer die Art des Vorgangs.
  select coalesce(
           jsonb_agg(jsonb_build_array(h.starts_at::text, h.ends_at::text) order by h.starts_at),
           '[]'::jsonb
         ),
         coalesce(array_agg(h.id order by h.starts_at), '{}'::uuid[])
    into v_alt, v_alt_ids
  from public.staff_working_hours h
  where h.staff_member_id = p_staff_member_id
    and h.organization_id = v_org
    and h.weekday = p_weekday;

  begin
    select coalesce(
             jsonb_agg(jsonb_build_array(w.von::text, w.bis::text) order by w.von),
             '[]'::jsonb
           )
      into v_neu
    from (
      select (b ->> 'von')::time as von, (b ->> 'bis')::time as bis
      from jsonb_array_elements(p_blocks) as b
    ) w;
  exception
    -- Unbrauchbare Zeitangaben im Array sind ein Eingabefehler, kein interner
    -- Fehler. Bewusst nur diese Faelle - ein `when others` wuerde echte
    -- Stoerungen verschlucken.
    when invalid_datetime_format or datetime_field_overflow
         or invalid_text_representation then
      raise exception 'working hour block is invalid' using errcode = '22023';
  end;

  -- Speichern ohne tatsaechliche Aenderung ist kein Vorgang: weder
  -- Schreibzugriff noch Auditeintrag.
  if v_alt = v_neu then
    return jsonb_array_length(v_alt);
  end if;

  delete from public.staff_working_hours
   where staff_member_id = p_staff_member_id
     and organization_id = v_org
     and weekday = p_weekday;

  begin
    with eingefuegt as (
      insert into public.staff_working_hours (
        organization_id, staff_member_id, weekday, starts_at, ends_at, created_by
      )
      select v_org, p_staff_member_id, p_weekday,
             (b ->> 'von')::time, (b ->> 'bis')::time, v_actor
      from jsonb_array_elements(p_blocks) as b
      returning id
    )
    select coalesce(array_agg(id), '{}'::uuid[]) into v_neu_ids from eingefuegt;
  exception
    when exclusion_violation then
      raise exception 'working hours overlap' using errcode = '23P01';
    when check_violation or not_null_violation
         or invalid_datetime_format or datetime_field_overflow then
      raise exception 'working hour block is invalid' using errcode = '22023';
  end;

  v_aktion := app.working_hour_action(
    jsonb_array_length(v_alt), jsonb_array_length(v_neu)
  );

  -- Derselbe Transaktionsrahmen wie die Fachaenderung oben: schlaegt sie fehl,
  -- gibt es auch keinen Eintrag.
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'staff_working_hours.' || v_aktion, 'staff_working_hours',
    p_staff_member_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'staff_member_id', p_staff_member_id,
      -- Bei einer Entfernung die aufgehobenen, sonst die jetzt gueltigen
      -- Datensaetze. Keine Zeiten, kein Wochentag (ADR-010).
      -- ANN-004 (docs/decisions/ASSUMPTIONS.md): Arbeitszeiten sind
      -- Beschaeftigtendaten und bleiben aus dem Auditkontext heraus.
      'record_ids', to_jsonb(case when v_aktion = 'removed' then v_alt_ids else v_neu_ids end)
    )
  );

  return jsonb_array_length(v_neu);
end;
$$;

comment on function public.set_staff_working_hours(uuid, smallint, jsonb) is
  'Ersetzt den Wochenplan einer Person fuer einen Wochentag vollstaendig und protokolliert staff_working_hours.created/.updated/.removed (CAL-005, ADR-010). Zeiten sind Ortszeiten der Praxis.';

revoke all on function public.set_staff_working_hours(uuid, smallint, jsonb) from public, anon;
grant execute on function public.set_staff_working_hours(uuid, smallint, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- set_staff_working_hour_exception
--
-- Wie oben. Zusaetzlich traegt der Auditkontext die Art der organisatorischen
-- Aktion: 'unavailable' fuer einen ganzen Tag ohne Termine, 'block' fuer
-- abweichende Zeitbloecke. Bei einer Aufhebung entfaellt sie - dann sagt schon
-- der Ereignisname alles.
-- -----------------------------------------------------------------------------
create or replace function public.set_staff_working_hour_exception(
  p_staff_member_id uuid,
  p_date            date,
  p_unavailable     boolean,
  p_blocks          jsonb default '[]'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid;
  v_org      uuid;
  v_tz       text;
  v_abwesend boolean;
  v_alt      jsonb;
  v_neu      jsonb;
  v_alt_ids  uuid[];
  v_neu_ids  uuid[];
  v_aktion   text;
  v_art      text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_working_hours() then
    raise exception 'not allowed to manage working hours' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage working hours' using errcode = '42501';
  end if;

  select o.time_zone into v_tz
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  if p_date is null then
    raise exception 'date is required' using errcode = '22023';
  end if;

  if not app.is_assignable_therapist(p_staff_member_id, v_org) then
    raise exception 'staff member not assignable' using errcode = 'P0002';
  end if;

  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' then
    raise exception 'blocks must be an array' using errcode = '22023';
  end if;

  v_abwesend := coalesce(p_unavailable, false);

  if v_abwesend and jsonb_array_length(p_blocks) > 0 then
    raise exception 'an unavailable day cannot have blocks' using errcode = '22023';
  end if;

  select coalesce(
           jsonb_agg(
             jsonb_build_array(a.kind, a.starts_at::text, a.ends_at::text)
             order by a.kind, a.starts_at nulls first
           ),
           '[]'::jsonb
         ),
         coalesce(array_agg(a.id order by a.kind, a.starts_at nulls first), '{}'::uuid[])
    into v_alt, v_alt_ids
  from public.staff_working_hour_exceptions a
  where a.staff_member_id = p_staff_member_id
    and a.organization_id = v_org
    and a.on_date = p_date;

  if v_abwesend then
    v_neu := jsonb_build_array(jsonb_build_array('unavailable', null, null));
  else
    begin
      select coalesce(
               jsonb_agg(jsonb_build_array('block', w.von::text, w.bis::text) order by w.von),
               '[]'::jsonb
             )
        into v_neu
      from (
        select (b ->> 'von')::time as von, (b ->> 'bis')::time as bis
        from jsonb_array_elements(p_blocks) as b
      ) w;
    exception
      when invalid_datetime_format or datetime_field_overflow
           or invalid_text_representation then
        raise exception 'working hour block is invalid' using errcode = '22023';
    end;
  end if;

  if v_alt = v_neu then
    return jsonb_array_length(v_alt);
  end if;

  delete from public.staff_working_hour_exceptions
   where staff_member_id = p_staff_member_id
     and organization_id = v_org
     and on_date = p_date;

  if v_abwesend then
    with eingefuegt as (
      insert into public.staff_working_hour_exceptions (
        organization_id, staff_member_id, on_date, kind, created_by
      )
      values (v_org, p_staff_member_id, p_date, 'unavailable', v_actor)
      returning id
    )
    select coalesce(array_agg(id), '{}'::uuid[]) into v_neu_ids from eingefuegt;
  else
    begin
      with eingefuegt as (
        insert into public.staff_working_hour_exceptions (
          organization_id, staff_member_id, on_date, kind, starts_at, ends_at, created_by
        )
        select v_org, p_staff_member_id, p_date, 'block',
               (b ->> 'von')::time, (b ->> 'bis')::time, v_actor
        from jsonb_array_elements(p_blocks) as b
        returning id
      )
      select coalesce(array_agg(id), '{}'::uuid[]) into v_neu_ids from eingefuegt;
    exception
      when exclusion_violation then
        raise exception 'working hours overlap' using errcode = '23P01';
      when check_violation or not_null_violation
           or invalid_datetime_format or datetime_field_overflow then
        raise exception 'working hour block is invalid' using errcode = '22023';
    end;
  end if;

  v_aktion := app.working_hour_action(
    jsonb_array_length(v_alt), jsonb_array_length(v_neu)
  );

  -- Art der organisatorischen Aktion, nicht ihre Uhrzeiten.
  v_art := case
             when v_aktion = 'removed' then null
             when v_abwesend then 'unavailable'
             else 'block'
           end;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'staff_working_hour_exception.' || v_aktion,
    'staff_working_hour_exception', p_staff_member_id, 'success',
    jsonb_strip_nulls(
      jsonb_build_object(
        'surface', 'web',
        'staff_member_id', p_staff_member_id,
        -- Art der Abweichung, kein Datum (ADR-010, ANN-004).
        'kind', v_art,
        'record_ids', to_jsonb(case when v_aktion = 'removed' then v_alt_ids else v_neu_ids end)
      )
    )
  );

  return jsonb_array_length(v_neu);
end;
$$;

comment on function public.set_staff_working_hour_exception(uuid, date, boolean, jsonb) is
  'Ersetzt die datumsbezogene Abweichung einer Person fuer einen Kalendertag vollstaendig und protokolliert staff_working_hour_exception.created/.updated/.removed (CAL-005, ADR-010). Ohne Abwesenheit und ohne Bloecke gilt wieder der Wochenplan.';

revoke all on function public.set_staff_working_hour_exception(uuid, date, boolean, jsonb)
  from public, anon;
grant execute on function public.set_staff_working_hour_exception(uuid, date, boolean, jsonb)
  to authenticated;
