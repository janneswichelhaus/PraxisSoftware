-- =============================================================================
-- BEF-181: Ladestrom aus den Kilometern der geplanten Touren (ADR-019
-- Fassung 6, Variante A)
--
-- Bis hier rechnet der Ladestrom mit einem Pauschalwert „km je
-- Arbeitsstunde“ (ORG-008, ANN-605). Jetzt rechnet der Server beim Beantragen
-- eines abgeschlossenen Monats die geplanten Touren der antragstellenden
-- Person neu und hält am Antrag allein die Monatssumme in Kilometern fest:
--
--   Betrag = km der geplanten Touren × Verbrauch (Wh/km) × Strompreis (ct/kWh)
--            / 1000, kaufmännisch auf ganze Cent
--
-- Wer rechnet: die Edge Function `electricity-distance` (ANN-615). Sie holt
-- mit der Sitzung der Person die Wegpunkte ihrer Touren
-- (public.electricity_tour_points), fragt je Tag eine Route beim
-- Kartendienst ab, summiert die Strecke und trägt die Summe mit ihrem
-- eigenen Dienstschlüssel ein (public.record_electricity_tour_distance, nur
-- service_role). Die Person kann die Summe damit nicht selbst setzen.
--
-- Was bleibt (ADR-019 Fassung 6, Punkte 16 und 17):
--   * Gespeichert wird nur die Monatssumme am Antrag (tour_km) - keine
--     Tageswerte, keine Route, keine Fahrzeit, kein Wegpunkt.
--   * Sehen dürfen sie die Person selbst und wer entscheidet (owner). Das Büro
--     sieht Anträge anderer weiter, bei einem Antrag aus Touren aber weder
--     Kilometer noch Betrag - der Betrag ergäbe mit den Werten der Praxis die
--     Kilometer (ANN-616).
--   * Keine Auswertung über Personen, Monate oder Touren.
--   * Echte Adressen erreichen den Kartendienst erst nach dem Gate aus
--     ADR-019 Punkt 9; bis dahin antwortet die Function in der Produktion
--     `not_configured`, und der Antrag behält den Wert je Stunde.
--
-- Ohne Ergebnis (kein Anbieter, eine Route scheitert, keine Tour im Monat)
-- bleibt der Antrag, wie ORG-008 ihn rechnet. Eingetragen wird höchstens
-- einmal, nur in den zehn Minuten nach dem Beantragen und nur, solange noch
-- niemand anderes über den Antrag entschieden hat.
--
-- KEINE NEUE AUDITAKTION (ADR-010 Fassung 3): Der Antrag weist sich selbst
-- nach.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die Monatssumme am Antrag
-- -----------------------------------------------------------------------------
alter table public.staff_reimbursements
  add column tour_km integer;

comment on column public.staff_reimbursements.tour_km is
  'BEF-181 (ADR-019 Fassung 6): Monatssumme der geplanten Tourstrecke in ganzen km, berechnet beim Beantragen. Keine Tageswerte, keine Routen. Sehen nur die Person und owner (ANN-616). Null: Antrag nach km je Stunde (ORG-008) oder älter.';

-- Drei Formen des Ladestroms: vor ORG-008 Tage × Ladung × Satz; nach ORG-008
-- Minuten × km je Stunde × Verbrauch × Satz; seit BEF-181 km der Touren ×
-- Verbrauch × Satz (die Minuten bleiben stehen, km je Stunde fällt weg).
alter table public.staff_reimbursements drop constraint staff_reimbursements_kind_fields;
alter table public.staff_reimbursements add constraint staff_reimbursements_kind_fields check (
  (kind = 'electricity'
     and period_month is not null and extract(day from period_month) = 1
     and rate_cents_per_kwh between 1 and 1000
     and declared_at is not null
     and (
       (working_days between 1 and 31
          and working_days <= extract(day from (period_month + interval '1 month' - interval '1 day'))
          and energy_wh_per_day between 1 and 10000
          and working_minutes is null and km_per_hour is null and wh_per_km is null
          and tour_km is null
          and amount_cents = (working_days * energy_wh_per_day * rate_cents_per_kwh + 500) / 1000)
       or (working_days is null and energy_wh_per_day is null
          and working_minutes >= 1
          and working_minutes <= 1440 * extract(day from (period_month + interval '1 month' - interval '1 day'))
          and km_per_hour between 1 and 30
          and wh_per_km between 1 and 100
          and tour_km is null
          and amount_cents = (working_minutes::bigint * km_per_hour * wh_per_km * rate_cents_per_kwh + 30000) / 60000)
       or (working_days is null and energy_wh_per_day is null
          and working_minutes >= 1
          and working_minutes <= 1440 * extract(day from (period_month + interval '1 month' - interval '1 day'))
          and km_per_hour is null
          and wh_per_km between 1 and 100
          and tour_km between 1 and 10000
          and amount_cents = (tour_km * wh_per_km * rate_cents_per_kwh + 500) / 1000)
     ))
  or (kind = 'purchase'
     and period_month is null and working_days is null and energy_wh_per_day is null
     and working_minutes is null and km_per_hour is null and wh_per_km is null
     and tour_km is null
     and rate_cents_per_kwh is null and declared_at is null)
);

-- -----------------------------------------------------------------------------
-- 2. Die Wegpunkte der Touren eines Monats - eine Stelle
-- -----------------------------------------------------------------------------
-- ANN-617: Je Tag mit Fahrt eine Liste von Koordinaten in Fahrtreihenfolge, wie die
-- Tagesroute sie fährt (MAP-006b, UBK-015, ANN-240): Beginn und Ende an der
-- Garage des Standorts, sonst am Startort; dazwischen die Termine mit Ort
-- (Behandlung und Training, Hausbesuch mit seiner Koordinate, Praxistermin
-- mit der des Standorts), nicht abgesagt, nach Beginn geordnet.
-- Aufeinanderfolgende gleiche Punkte fallen zusammen. Ein Termin ohne
-- Koordinate fehlt, wie auf der Karte.
--
-- Zurück kommen nur Koordinaten - kein Datum, keine Uhrzeit, keine Kennung,
-- kein Name (ADR-019 Punkt 12). Ein Tag mit weniger als zwei Punkten hat
-- keine Strecke und fehlt.
create function app.electricity_tour_days(p_org uuid, p_staff_member_id uuid, p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz     text;
  v_ort    jsonb;
  v_tage   jsonb := '[]'::jsonb;
  v_punkte jsonb := null;
  v_tag    date := null;
  v_punkt  jsonb;
  r        record;
begin
  select o.time_zone into v_tz from public.organizations o where o.id = p_org;
  if v_tz is null then
    return '[]'::jsonb;
  end if;

  -- Wie tagesorte() im Browser: der erste Standort nach Namen, seine Garage,
  -- sonst sein Startort; ohne beides beginnt die Tour am ersten Termin.
  select case
           when l.garage_lat is not null then jsonb_build_object('lat', l.garage_lat, 'lon', l.garage_lon)
           when l.lat is not null then jsonb_build_object('lat', l.lat, 'lon', l.lon)
         end
    into v_ort
  from public.locations l
  where l.organization_id = p_org
  order by l.name, l.id
  limit 1;

  for r in
    select (a.starts_at at time zone v_tz)::date as tag,
           case when a.appointment_type = 'home_visit' then a.visit_lat else l.lat end as lat,
           case when a.appointment_type = 'home_visit' then a.visit_lon else l.lon end as lon
    from public.appointments a
    left join public.locations l on l.id = a.location_id and l.organization_id = p_org
    where a.organization_id = p_org
      and a.staff_member_id = p_staff_member_id
      and a.kind in ('therapy', 'training')
      and a.appointment_type in ('home_visit', 'practice')
      and a.status <> 'cancelled'
      and a.starts_at >= (p_month::timestamp) at time zone v_tz
      and a.starts_at <  ((p_month + interval '1 month')::timestamp) at time zone v_tz
    order by a.starts_at, a.id
  loop
    continue when r.lat is null or r.lon is null;
    v_punkt := jsonb_build_object('lat', r.lat, 'lon', r.lon);
    if v_tag is distinct from r.tag then
      -- Der vorige Tag endet am Ort, an dem er begann.
      if v_punkte is not null then
        if v_ort is not null and v_punkte -> -1 <> v_ort then
          v_punkte := v_punkte || jsonb_build_array(v_ort);
        end if;
        if jsonb_array_length(v_punkte) >= 2 then
          v_tage := v_tage || jsonb_build_array(v_punkte);
        end if;
      end if;
      v_tag := r.tag;
      v_punkte := case when v_ort is null then '[]'::jsonb else jsonb_build_array(v_ort) end;
    end if;
    if jsonb_array_length(v_punkte) = 0 or v_punkte -> -1 <> v_punkt then
      v_punkte := v_punkte || jsonb_build_array(v_punkt);
    end if;
  end loop;

  if v_punkte is not null then
    if v_ort is not null and v_punkte -> -1 <> v_ort then
      v_punkte := v_punkte || jsonb_build_array(v_ort);
    end if;
    if jsonb_array_length(v_punkte) >= 2 then
      v_tage := v_tage || jsonb_build_array(v_punkte);
    end if;
  end if;

  return v_tage;
end;
$$;

revoke all on function app.electricity_tour_days(uuid, uuid, date) from public, anon, authenticated;

comment on function app.electricity_tour_days(uuid, uuid, date) is
  'BEF-181 (ADR-019 Fassung 6): je Tag mit Fahrt die Koordinaten der geplanten Tour einer Person in einem Monat (Garage oder Startort, Termine mit Ort, zurück) - ohne Datum, Zeit, Kennung oder Namen. Die einzige Stelle, die festlegt, was gefahren wird.';

-- -----------------------------------------------------------------------------
-- 3. Für die Function: die eigenen Wegpunkte, mit der Sitzung der Person
-- -----------------------------------------------------------------------------
-- Mit der Sitzung der Person aufgerufen, damit Rolle, Praxis und
-- Sitzungssperre gelten wie beim Beantragen. Nur die eigene Person, nur die
-- zwölf abgeschlossenen Monate. Die Punkte sind die der eigenen Tagesroute,
-- die die Person ohnehin sieht; ohne Datum taugen sie nicht als Verlauf.
create function public.electricity_tour_points(p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
begin
  v_org := app.staff_request_org(app.can_request_reimbursements(), 'not allowed to request reimbursements');
  v_staff := app.own_staff_member(v_org);
  if v_staff is null then
    raise exception 'no staff member for this account' using errcode = 'P0002';
  end if;
  perform app.assert_electricity_month(v_org, p_month);
  return app.electricity_tour_days(v_org, v_staff, p_month);
end;
$$;

revoke all on function public.electricity_tour_points(date) from public, anon;
grant execute on function public.electricity_tour_points(date) to authenticated;

comment on function public.electricity_tour_points(date) is
  'BEF-181 (ADR-019 Fassung 6): für die Edge Function electricity-distance die Wegpunkte der eigenen geplanten Touren eines abgeschlossenen Monats, je Tag eine Liste von Koordinaten ohne Datum. Speichert nichts.';

-- -----------------------------------------------------------------------------
-- 4. Eintragen - nur die Function mit ihrem Dienstschlüssel
-- -----------------------------------------------------------------------------
-- ANN-615: Die Function nennt das Konto, das sie beim Anmeldedienst geprüft hat, und
-- den Antrag, den die Person gerade gestellt hat. Eingetragen wird nur, wenn
-- alles zusammenpasst: Ladestrom nach ORG-008, von diesem Konto für die
-- eigene Person beantragt, noch ohne Kilometer, höchstens zehn Minuten alt,
-- beantragt oder selbst eingetragen und noch nicht ausgezahlt. Sonst bleibt
-- der Antrag, wie er ist.
create function public.record_electricity_tour_distance(
  p_reimbursement_id uuid,
  p_account_id       uuid,
  p_km               integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antrag public.staff_reimbursements;
  v_betrag integer;
begin
  if p_km is null or p_km not between 1 and 10000 then
    raise exception 'distance out of range' using errcode = '22023';
  end if;

  select r.* into v_antrag
  from public.staff_reimbursements r
  where r.id = p_reimbursement_id
  for update;

  if not found
     or v_antrag.kind <> 'electricity'
     or v_antrag.requested_by is distinct from p_account_id
     or v_antrag.working_minutes is null
     or v_antrag.tour_km is not null
     or v_antrag.requested_at < now() - interval '10 minutes'
     or not (v_antrag.status = 'requested'
             or (v_antrag.status = 'approved' and v_antrag.self_entered))
     -- Die eigene Person des Kontos in derselben Praxis, aktiv.
     or not exists (
       select 1
       from public.user_profiles up
       join public.staff_members sm
         on sm.person_id = up.person_id and sm.organization_id = up.organization_id
       where up.id = p_account_id and up.is_active
         and up.organization_id = v_antrag.organization_id
         and sm.id = v_antrag.staff_member_id
     ) then
    raise exception 'reimbursement not eligible' using errcode = 'P0002';
  end if;

  v_betrag := (p_km * v_antrag.wh_per_km * v_antrag.rate_cents_per_kwh + 500) / 1000;
  if v_betrag < 1 then
    raise exception 'distance out of range' using errcode = '22023';
  end if;

  update public.staff_reimbursements r
     set tour_km = p_km,
         km_per_hour = null,
         amount_cents = v_betrag
   where r.id = v_antrag.id;

  return jsonb_build_object('id', v_antrag.id, 'tour_km', p_km, 'amount_cents', v_betrag);
end;
$$;

revoke all on function public.record_electricity_tour_distance(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.record_electricity_tour_distance(uuid, uuid, integer) to service_role;

comment on function public.record_electricity_tour_distance(uuid, uuid, integer) is
  'BEF-181 (ADR-019 Fassung 6): trägt die Monatssumme der geplanten Tourstrecke am eben gestellten eigenen Ladestrom-Antrag ein und rechnet den Betrag neu (km × Wh/km × ct/kWh). Nur service_role (Edge Function electricity-distance); einmal, binnen zehn Minuten, vor einer Entscheidung durch andere. Ohne Auditeintrag (ADR-010 Fassung 3).';

-- -----------------------------------------------------------------------------
-- 5. Wer die Kilometer sieht (ANN-616)
-- -----------------------------------------------------------------------------
-- Die Ansicht eines Antrags trägt die Kilometer mit (für owner überall, wo
-- er sie liest, etwa beim Auszahlen).
create or replace function app.reimbursement_view(p_reimbursement public.staff_reimbursements)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_reimbursement.id,
    'staff_member_id', p_reimbursement.staff_member_id,
    'name', app.staff_display_name(p_reimbursement.staff_member_id),
    'kind', p_reimbursement.kind,
    'period_month', p_reimbursement.period_month,
    'working_days', p_reimbursement.working_days,
    'energy_wh_per_day', p_reimbursement.energy_wh_per_day,
    'working_minutes', p_reimbursement.working_minutes,
    'km_per_hour', p_reimbursement.km_per_hour,
    'wh_per_km', p_reimbursement.wh_per_km,
    'tour_km', p_reimbursement.tour_km,
    'rate_cents_per_kwh', p_reimbursement.rate_cents_per_kwh,
    'amount_cents', p_reimbursement.amount_cents,
    'status', p_reimbursement.status,
    'self_entered', p_reimbursement.self_entered,
    'requested_at', p_reimbursement.requested_at,
    'decided_at', p_reimbursement.decided_at,
    'decided_by_name', app.account_display_name(p_reimbursement.decided_by),
    'decision_note', p_reimbursement.decision_note,
    'withdrawn_at', p_reimbursement.withdrawn_at,
    'paid_at', p_reimbursement.paid_at,
    'paid_by_name', app.account_display_name(p_reimbursement.paid_by),
    'receipts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', b.id, 'amount_cents', b.amount_cents, 'purpose', b.purpose,
               'mime_type', b.mime_type, 'verified', b.verified_at is not null
             ) order by b.attached_at, b.id)
      from public.staff_reimbursement_receipts b
      where b.reimbursement_id = p_reimbursement.id
    ), '[]'::jsonb)
  )
$$;

revoke all on function app.reimbursement_view(public.staff_reimbursements) from public, anon, authenticated;

-- Dieselbe Ansicht in zwei Tiefen: voll für die Person selbst und für owner;
-- beim Büro fehlen bei einem Antrag aus Touren Kilometer, Betrag, Verbrauch
-- und Satz - aus Betrag und Werten ließen sich die Kilometer zurückrechnen.
create function app.reimbursement_view(p_reimbursement public.staff_reimbursements, p_full boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_full or p_reimbursement.tour_km is null then app.reimbursement_view(p_reimbursement)
    else app.reimbursement_view(p_reimbursement) || jsonb_build_object(
      'tour_km', null, 'amount_cents', null, 'wh_per_km', null, 'rate_cents_per_kwh', null
    )
  end
$$;

revoke all on function app.reimbursement_view(public.staff_reimbursements, boolean) from public, anon, authenticated;

comment on function app.reimbursement_view(public.staff_reimbursements, boolean) is
  'BEF-181 (ANN-616): Ansicht eines Antrags; ohne p_full fehlen bei einem Antrag aus Touren tour_km, amount_cents, wh_per_km und rate_cents_per_kwh. Voll nur für die Person selbst und owner (ADR-019 Fassung 6).';

create or replace function public.list_reimbursements(p_staff_member_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_eigene uuid;
  v_person uuid;
  v_alle   boolean;
  v_entsch boolean;
begin
  v_org := app.staff_request_org(app.can_request_reimbursements(), 'not allowed to read reimbursements');
  v_eigene := app.own_staff_member(v_org);
  v_alle := app.can_read_all_reimbursements();
  v_entsch := app.can_decide_staff_requests();
  v_person := coalesce(p_staff_member_id, v_eigene);
  -- Eine fremde Person nur für owner und Büro; sonst sieht sie aus wie
  -- eine, die es nicht gibt.
  if p_staff_member_id is not null and p_staff_member_id is distinct from v_eigene
     and (not v_alle or not exists (
       select 1 from public.staff_members s
       where s.id = p_staff_member_id and s.organization_id = v_org
     )) then
    raise exception 'staff member not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'my_staff_member_id', v_eigene,
    'can_decide', v_entsch,
    'can_read_all', v_alle,
    'person', case when v_person is null then null else jsonb_build_object(
      'staff_member_id', v_person,
      'name', app.staff_display_name(v_person),
      'account', app.payout_account_view(v_person),
      'reimbursements', coalesce((
        -- Voll für die eigene Person und für owner; das Büro sieht bei
        -- Anträgen aus Touren keine Kilometer und keinen Betrag (ANN-616).
        select jsonb_agg(app.reimbursement_view(r, v_person = v_eigene or v_entsch)
                         order by r.requested_at desc, r.id)
        from public.staff_reimbursements r
        where r.organization_id = v_org and r.staff_member_id = v_person
      ), '[]'::jsonb)
    ) end,
    -- owner: was zu entscheiden und was auszuzahlen ist, je Antrag mit Namen.
    'to_decide', case when not v_entsch then '[]'::jsonb else coalesce((
      select jsonb_agg(app.reimbursement_view(r, true) order by r.requested_at, r.id)
      from public.staff_reimbursements r
      where r.organization_id = v_org and r.status = 'requested'
        and r.staff_member_id is distinct from v_eigene
    ), '[]'::jsonb) end,
    'to_pay', case when not v_entsch then '[]'::jsonb else coalesce((
      select jsonb_agg(app.reimbursement_view(r, true)
                       || jsonb_build_object('iban_masked',
                            app.mask_iban((select a.iban from public.staff_payout_accounts a
                                            where a.staff_member_id = r.staff_member_id)))
                       order by r.decided_at, r.id)
      from public.staff_reimbursements r
      where r.organization_id = v_org and app.may_pay_reimbursement(v_org, r)
    ), '[]'::jsonb) end,
    -- owner und Büro: die Personen mit Erstattungen, je Person die offenen -
    -- keine Summe über alle (PROJECT_PRINCIPLES.md 20).
    'people', case when not v_alle then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
               'staff_member_id', x.staff_member_id,
               'name', app.staff_display_name(x.staff_member_id),
               'open', x.offen
             ) order by app.staff_display_name(x.staff_member_id), x.staff_member_id)
      from (
        select r.staff_member_id,
               count(*) filter (where r.status in ('requested', 'approved'))::integer as offen
        from public.staff_reimbursements r
        where r.organization_id = v_org and r.staff_member_id is distinct from v_eigene
        group by r.staff_member_id
      ) x
    ), '[]'::jsonb) end
  );
end;
$$;
