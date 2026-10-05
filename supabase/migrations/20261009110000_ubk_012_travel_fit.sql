-- =============================================================================
-- UBK-012: "Passt es?" beim Anlegen und Aendern eines Termins (ANN-238)
--
-- Sobald Person, Zeit und Ort feststehen, sagt das Terminformular, ob An- und
-- Weiterfahrt passen: "passt - X Min. Luft" oder "zu knapp um X Min.,
-- fruehester Beginn ...". Dieselbe Auskunft zeigt die Ziehvorschau im
-- Kalender (UBK-013) und, ohne festen Beginn, der Lueckenfinder (UBK-014).
-- Nur Auskunft, keine Sperre (ANN-097).
--
-- Zwei Funktionen:
--
--   * get_visit_position: die Koordinate der Patientenadresse fuer einen
--     NEUEN Hausbesuch. Die Kartei liefert sie bewusst nicht (ANN-016); die
--     Terminsuche gibt sie mit denselben Rechten heraus (find_free_slots,
--     target_lat). Nur die Koordinate - keine Genauigkeit, kein Name, keine
--     Adresse.
--     Zum Kartendienst geht sie wie jede Koordinate nur ueber die eigene
--     Function (ADR-019 Punkt 12 und 13).
--
--   * check_travel_fit: die Rundungsregel aus §8.1 fuer einen Termin, den es
--     noch nicht gibt. check_travel_buffers prueft Paare BESTEHENDER Termine;
--     ein Formular hat noch keine Kennung. Diese Funktion rechnet deshalb nur:
--     Zeiten und Fahrzeiten herein, fruehester Beginn und Luft hinaus. Sie
--     liest keine Termine, nur Zeitzone und Raster der eigenen Praxis. Die
--     Rundung bleibt damit an EINER Stelle: app.earliest_follow_up_start.
--
-- "Luft" ist Beginn des Folgetermins minus (Ende + Fahrzeit, aufgerundet aufs
-- Raster), in ganzen Minuten; negativ heisst zu knapp (Festlegung Jannes im
-- Zuschnitt von UBK-EPIC-002).
--
-- Datenschutz: Fahrzeiten werden nicht gespeichert und nicht protokolliert
-- (ADR-019 Punkt 16, §20). Abgewiesen wird wie bei check_travel_buffers mit
-- einem denied-Eintrag (G6b).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- get_visit_position - Koordinate der Patientenadresse fuer einen Hausbesuch
-- -----------------------------------------------------------------------------
create function public.get_visit_position(p_patient_id uuid)
returns table (
  lat double precision,
  lon double precision
)
language plpgsql
-- volatile, nicht stable: Die Abweisung schreibt einen denied-Eintrag; hinter
-- PostgREST liefe eine stable-Funktion in einer Nur-Lese-Transaktion (TRN-EPIC-001).
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- Dieselben Rollen wie die Terminanlage und die Terminsuche (PRX-003).
  if not app.can_create_appointment() then
    perform app.record_denied_read(auth.uid(), 'appointments.read', 'not allowed to create appointments');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to create appointments' using errcode = '42501';
  end if;

  if p_patient_id is null or not exists (
    select 1 from public.patients p where p.id = p_patient_id and p.organization_id = v_org
  ) then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  -- Ohne Kontaktzeile oder ohne Verortung: eine Zeile mit null. Das
  -- Formular sagt dann "Adresse nicht verortet" statt einer Zeit.
  return query
    select cd.lat, cd.lon
    from (select 1) eins
    left join public.patient_contact_details cd
      on cd.patient_id = p_patient_id and cd.organization_id = v_org;
end;
$$;

comment on function public.get_visit_position(uuid) is
  'UBK-012, ANN-238: Koordinate der Patientenadresse fuer einen neuen Hausbesuch - ohne Name und Adresse. Rechte wie find_free_slots (can_create_appointment); abgewiesen mit denied-Eintrag (G6b).';

revoke all on function public.get_visit_position(uuid) from public, anon;
grant execute on function public.get_visit_position(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- check_travel_fit - frühester Beginn und Luft für einen geplanten Termin
--
-- p_items: [{index, duration_minutes,
--            starts_at?,                          -- fester Beginn
--            previous_end?, travel_to_seconds?,   -- Anfahrt
--            next_start?,   travel_from_seconds?  -- Weiterfahrt
--          }, ...], hoechstens 50.
--
-- Ohne starts_at gilt der frueheste Beginn nach der Anfahrt (Lueckenfinder);
-- dann sind previous_end und travel_to_seconds Pflicht. Fehlt auf einer Seite
-- die Fahrzeit oder der Nachbar, bleibt diese Seite leer (null) - nie "passt".
-- -----------------------------------------------------------------------------
create function public.check_travel_fit(p_items jsonb)
returns table (
  item_index             integer,
  starts_at              timestamptz,
  arrival_earliest_start timestamptz,
  arrival_slack_minutes  integer,
  next_earliest_start    timestamptz,
  departure_slack_minutes integer
)
language plpgsql
-- volatile, nicht stable: Die Abweisung schreibt einen denied-Eintrag; hinter
-- PostgREST liefe eine stable-Funktion in einer Nur-Lese-Transaktion (TRN-EPIC-001).
volatile
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_tz      text;
  v_grid    integer;
  v_item    jsonb;
  v_index   integer;
  v_dauer   integer;
  v_beginn  timestamptz;
  v_vorher  timestamptz;
  v_hin     integer;
  v_danach  timestamptz;
  v_weiter  integer;
  v_frueh   timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_read_appointments() then
    perform app.record_denied_read(auth.uid(), 'appointments.read', 'not allowed to read appointments');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 50 then
    raise exception 'items must be an array of at most 50 entries' using errcode = '22023';
  end if;

  select o.time_zone, o.appointment_grid_minutes into v_tz, v_grid
  from public.organizations o where o.id = v_org;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    -- Jede Angabe in ihrem Typ, sonst ist der ganze Aufruf ungueltig: Ein
    -- fehlender Wert ergaebe NULL, und NULL loest kein IF aus.
    begin
      if jsonb_typeof(v_item) <> 'object'
         or jsonb_typeof(v_item -> 'index') <> 'number'
         or jsonb_typeof(v_item -> 'duration_minutes') <> 'number' then
        raise exception 'invalid item';
      end if;
      v_index  := (v_item ->> 'index')::integer;
      v_dauer  := (v_item ->> 'duration_minutes')::integer;
      v_beginn := (v_item ->> 'starts_at')::timestamptz;
      v_vorher := (v_item ->> 'previous_end')::timestamptz;
      v_hin    := (v_item ->> 'travel_to_seconds')::integer;
      v_danach := (v_item ->> 'next_start')::timestamptz;
      v_weiter := (v_item ->> 'travel_from_seconds')::integer;
    exception
      when others then
        raise exception 'invalid item' using errcode = '22023';
    end;

    if v_index is null
       or v_dauer is null or v_dauer not between 1 and 600
       or (v_hin is not null and v_hin not between 0 and 86400)
       or (v_weiter is not null and v_weiter not between 0 and 86400) then
      raise exception 'invalid item' using errcode = '22023';
    end if;

    item_index := v_index;
    arrival_earliest_start := null;
    arrival_slack_minutes := null;
    next_earliest_start := null;
    departure_slack_minutes := null;

    -- Anfahrt: vom Ende des Vorgaengers (oder vom Tagesbeginn am Startort).
    if v_vorher is not null and v_hin is not null then
      arrival_earliest_start := app.earliest_follow_up_start(v_vorher, v_hin, v_grid, v_tz);
    end if;

    if v_beginn is null then
      if arrival_earliest_start is null then
        raise exception 'start or arrival is required' using errcode = '22023';
      end if;
      v_beginn := arrival_earliest_start;
    end if;
    starts_at := v_beginn;

    if arrival_earliest_start is not null then
      arrival_slack_minutes :=
        floor(extract(epoch from (v_beginn - arrival_earliest_start)) / 60)::integer;
    end if;

    -- Weiterfahrt: vom eigenen Ende zum Nachfolger (oder zum Tagesende).
    if v_danach is not null and v_weiter is not null then
      next_earliest_start := app.earliest_follow_up_start(
        v_beginn + make_interval(mins => v_dauer), v_weiter, v_grid, v_tz
      );
      departure_slack_minutes :=
        floor(extract(epoch from (v_danach - next_earliest_start)) / 60)::integer;
    end if;

    return next;
  end loop;
end;
$$;

comment on function public.check_travel_fit(jsonb) is
  'UBK-012, ANN-238: fruehester Beginn und Luft (Minuten, negativ = zu knapp) fuer einen geplanten Termin aus hereingereichten Zeiten und Fahrzeiten - mit der Rundungsregel aus §8.1 (app.earliest_follow_up_start). Liest keine Termine, speichert nichts. Warnung, keine Sperre.';

revoke all on function public.check_travel_fit(jsonb) from public, anon;
grant execute on function public.check_travel_fit(jsonb) to authenticated;
