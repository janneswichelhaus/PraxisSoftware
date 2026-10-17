-- =============================================================================
-- ORG-008: Ladestrom über die geplanten Arbeitsstunden, Werte als
-- Einstellung der Praxis
--
-- Bis hier: Arbeitstage (von der Person bestätigt) × 0,5 kWh × 37 ct, beide
-- Werte fest im Code (ANN-599). Jetzt rechnet der Server alles selbst:
--
--   Energie = geplante Arbeitsstunden des Monats × Strecke je Arbeitsstunde
--             (km) × Verbrauch bei höchster Unterstützungsstufe (Wh/km)
--   Betrag  = kWh × Strompreis (ct/kWh), kaufmännisch auf ganze Cent
--
-- Die Arbeitsstunden kommen aus dem Wochenplan in Fassungen mit den
-- datumsbezogenen Abweichungen (app.working_ranges), ohne gesetzliche
-- Feiertage und ohne ganztägige Abwesenheit - wie bisher die Arbeitstage,
-- nur in Minuten. Kein Bezug auf Touren, Termine, Fahrzeiten oder Kilometer
-- aus der Planung (PROJECT_PRINCIPLES.md 20, ADR-019 Punkt 17): Die Strecke
-- je Stunde ist ein Pauschalwert der Praxis, kein Messwert einer Person.
--
-- Die drei Werte stehen an der Organisation, gesetzt nur von owner
-- (public.set_electricity_settings), gelesen wie der Fahrzeitfaktor über die
-- Zeile der eigenen Praxis (organizations_select_own). Ein Antrag hält alle
-- Werte fest; eine Änderung gilt für neue Anträge. Bestehende Anträge
-- behalten Arbeitstage, Ladung und Satz - die Bedingung an der Tabelle
-- kennt beide Formen.
--
-- Für den Eingang: public.electricity_suggestions liefert die
-- abgeschlossenen Monate, für die die Person noch keinen Ladestrom beantragt
-- hat, mit fertig gerechnetem Betrag - nur für sich, keine Summe über alle.
--
-- KEINE NEUE AUDITAKTION (ADR-010 Fassung 3): Die Einstellung ist ein
-- Praxiswert wie der Fahrzeitfaktor; der Antrag weist sich selbst nach.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die Einstellung der Praxis
-- -----------------------------------------------------------------------------
-- Vorbelegung synthetisch und plausibel: 37 ct/kWh liegt beim
-- Haushaltsstrom 2025/26; ein Lastenrad mit 500 bis 750 Wh Akku kommt bei
-- höchster Stufe 30 bis 40 km weit (rund 18 Wh/km); im Hausbesuch fährt man
-- je Arbeitsstunde rund 6 km (eine Behandlung, dazwischen ein Weg).
alter table public.organizations
  add column electricity_cents_per_kwh smallint not null default 37
    check (electricity_cents_per_kwh between 1 and 200),
  add column electricity_wh_per_km smallint not null default 18
    check (electricity_wh_per_km between 1 and 100),
  add column electricity_km_per_hour smallint not null default 6
    check (electricity_km_per_hour between 1 and 30);

comment on column public.organizations.electricity_cents_per_kwh is
  'ORG-008: Strompreis für den Ladestrom in Cent je kWh (1 bis 200; Vorbelegung 37). Gesetzt nur von owner; der Antrag hält ihn fest.';
comment on column public.organizations.electricity_wh_per_km is
  'ORG-008: Verbrauch des Lastenrads bei höchster Unterstützungsstufe in Wh je km (1 bis 100; Vorbelegung 18). Gesetzt nur von owner; der Antrag hält ihn fest.';
comment on column public.organizations.electricity_km_per_hour is
  'ORG-008: Strecke je Arbeitsstunde in km, ein Pauschalwert der Praxis - kein Messwert einer Person, kein Bezug auf Touren (1 bis 30; Vorbelegung 6). Gesetzt nur von owner; der Antrag hält ihn fest.';

create function public.set_electricity_settings(
  p_cents_per_kwh integer,
  p_wh_per_km     integer,
  p_km_per_hour   integer
)
returns jsonb
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
  if not app.has_any_role('owner') then
    raise exception 'not allowed to change electricity settings' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to change electricity settings' using errcode = '42501';
  end if;
  -- Abgewiesen statt begrenzt: gespeichert wird, was eingegeben wurde.
  if p_cents_per_kwh is null or p_cents_per_kwh not between 1 and 200
     or p_wh_per_km is null or p_wh_per_km not between 1 and 100
     or p_km_per_hour is null or p_km_per_hour not between 1 and 30 then
    raise exception 'electricity settings out of range' using errcode = '22023';
  end if;

  update public.organizations o
     set electricity_cents_per_kwh = p_cents_per_kwh,
         electricity_wh_per_km = p_wh_per_km,
         electricity_km_per_hour = p_km_per_hour
   where o.id = v_org;

  return jsonb_build_object(
    'cents_per_kwh', p_cents_per_kwh, 'wh_per_km', p_wh_per_km, 'km_per_hour', p_km_per_hour
  );
end;
$$;

revoke all on function public.set_electricity_settings(integer, integer, integer) from public, anon;
grant execute on function public.set_electricity_settings(integer, integer, integer) to authenticated;

comment on function public.set_electricity_settings(integer, integer, integer) is
  'ORG-008: setzt Strompreis (ct/kWh, 1-200), Verbrauch bei höchster Stufe (Wh/km, 1-100) und Strecke je Arbeitsstunde (km, 1-30) der eigenen Praxis. Nur owner. Ohne Auditeintrag (ADR-010 Fassung 3).';

-- -----------------------------------------------------------------------------
-- 2. Die Rechnung - eine Stelle
-- -----------------------------------------------------------------------------
-- ANN-605: Minuten × km/h × Wh/km × ct/kWh, in Cent kaufmännisch gerundet:
-- (Minuten/60 · km · Wh / 1000) kWh · ct = Minuten · km · Wh · ct / 60 000.
-- Dieselbe Rechnung wie electricityCentsFromMinutes in
-- src/features/reimbursements/rules.ts und die Bedingung an der Tabelle.
create function app.electricity_amount_cents(
  p_minutes       integer,
  p_km_per_hour   integer,
  p_wh_per_km     integer,
  p_cents_per_kwh integer
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select ((p_minutes::bigint * p_km_per_hour * p_wh_per_km * p_cents_per_kwh + 30000) / 60000)::integer
$$;

revoke all on function app.electricity_amount_cents(integer, integer, integer, integer)
  from public, anon, authenticated;

comment on function app.electricity_amount_cents(integer, integer, integer, integer) is
  'ORG-008 (ANN-605): Betrag des Ladestroms in Cent aus geplanten Minuten, Strecke je Stunde, Verbrauch und Strompreis, kaufmännisch gerundet. Die einzige Stelle am Server.';

-- Die geplanten Arbeitsminuten eines Monats: je Tag die Arbeitszeit nach der
-- an ihm geltenden Fassung des Wochenplans oder seiner Abweichung
-- (app.working_ranges, null bei ganztägiger Abwesenheit - Urlaub,
-- Freizeitausgleich, eingetragene Abwesenheit), ohne gesetzliche Feiertage
-- des Bundeslands. Ohne Wochenplan keine Minuten. Kein Bezug auf Touren oder
-- Termine (PROJECT_PRINCIPLES.md 20).
create function app.reimbursement_working_minutes(p_org uuid, p_staff_member_id uuid, p_month date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(extract(epoch from (upper(r) - lower(r))) / 60), 0)::integer
  from generate_series(p_month, (p_month + interval '1 month' - interval '1 day')::date,
                       interval '1 day') as d
  cross join (select o.federal_state from public.organizations o where o.id = p_org) as o
  cross join lateral unnest(app.working_ranges(p_staff_member_id, p_org, d::date)) as r
  where not app.is_public_holiday(d::date, o.federal_state)
$$;

revoke all on function app.reimbursement_working_minutes(uuid, uuid, date) from public, anon, authenticated;

comment on function app.reimbursement_working_minutes(uuid, uuid, date) is
  'ORG-008: geplante Arbeitsminuten einer Person in einem Monat - Wochenplan in Fassungen mit Abweichungen, ohne Feiertage und ganztägige Abwesenheit. Kein Bezug auf Touren oder Termine.';

-- Der Vorschlag eines Monats für die eigene Person: Minuten, die Werte der
-- Praxis, der Betrag und ob er schon beantragt ist.
create function app.electricity_offer(p_org uuid, p_staff_member_id uuid, p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_minuten integer := app.reimbursement_working_minutes(p_org, p_staff_member_id, p_month);
  v_o       record;
begin
  select o.electricity_km_per_hour as kmh, o.electricity_wh_per_km as whkm,
         o.electricity_cents_per_kwh as ct
    into v_o
  from public.organizations o where o.id = p_org;
  return jsonb_build_object(
    'month', p_month,
    'working_minutes', v_minuten,
    'km_per_hour', v_o.kmh,
    'wh_per_km', v_o.whkm,
    'cents_per_kwh', v_o.ct,
    'amount_cents', app.electricity_amount_cents(v_minuten, v_o.kmh, v_o.whkm, v_o.ct),
    'already_requested', exists (
      select 1 from public.staff_reimbursements r
      where r.staff_member_id = p_staff_member_id and r.kind = 'electricity'
        and r.period_month = p_month and r.status in ('requested', 'approved', 'paid')
    )
  );
end;
$$;

revoke all on function app.electricity_offer(uuid, uuid, date) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Der Antrag hält Minuten, Strecke und Verbrauch fest
-- -----------------------------------------------------------------------------
alter table public.staff_reimbursements
  add column working_minutes integer,
  add column km_per_hour     smallint,
  add column wh_per_km       smallint;

comment on column public.staff_reimbursements.working_minutes is
  'ORG-008: geplante Arbeitsminuten des Monats beim Beantragen (Wochenplan ohne Feiertage und ganztägige Abwesenheit). Anträge vor ORG-008 tragen stattdessen working_days und energy_wh_per_day.';

-- Zwei Formen des Ladestroms: vor ORG-008 Tage × Ladung × Satz, seitdem
-- Minuten × Strecke × Verbrauch × Satz. Ein Einkauf trägt keine davon.
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
          and amount_cents = (working_days * energy_wh_per_day * rate_cents_per_kwh + 500) / 1000)
       or (working_days is null and energy_wh_per_day is null
          and working_minutes >= 1
          and working_minutes <= 1440 * extract(day from (period_month + interval '1 month' - interval '1 day'))
          and km_per_hour between 1 and 30
          and wh_per_km between 1 and 100
          and amount_cents = (working_minutes::bigint * km_per_hour * wh_per_km * rate_cents_per_kwh + 30000) / 60000)
     ))
  or (kind = 'purchase'
     and period_month is null and working_days is null and energy_wh_per_day is null
     and working_minutes is null and km_per_hour is null and wh_per_km is null
     and rate_cents_per_kwh is null and declared_at is null)
);

-- Die Ansicht eines Antrags trägt die neuen Werte mit.
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

-- -----------------------------------------------------------------------------
-- 4. Vorschlag, Vorschläge für den Eingang, Beantragen
-- -----------------------------------------------------------------------------
create or replace function public.preview_electricity_reimbursement(p_month date)
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
  return app.electricity_offer(v_org, v_staff, p_month);
end;
$$;

comment on function public.preview_electricity_reimbursement(date) is
  'ORG-008: Ladestrom eines Monats für sich - geplante Arbeitsminuten (Wochenplan ohne Feiertage und ganztägige Abwesenheit), Strecke, Verbrauch und Satz der Praxis, der Betrag und ob der Monat schon beantragt ist. Nur die zwölf abgeschlossenen Monate vor dem laufenden.';

create function public.electricity_suggestions()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_staff   uuid;
  v_laufend date;
begin
  v_org := app.staff_request_org(app.can_request_reimbursements(), 'not allowed to request reimbursements');
  v_staff := app.own_staff_member(v_org);
  -- Ohne Mitarbeiterdatensatz gibt es nichts vorzuschlagen.
  if v_staff is null then
    return '[]'::jsonb;
  end if;
  select date_trunc('month', now() at time zone o.time_zone)::date into v_laufend
  from public.organizations o where o.id = v_org;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'month', v.angebot ->> 'month',
             'working_minutes', (v.angebot ->> 'working_minutes')::integer,
             'amount_cents', (v.angebot ->> 'amount_cents')::integer
           ) order by v.monat desc)
    from (
      select m.monat, app.electricity_offer(v_org, v_staff, m.monat) as angebot
      from (
        select (v_laufend - make_interval(months => n))::date as monat
        from generate_series(1, 12) as n
      ) m
      where not exists (
        select 1 from public.staff_reimbursements r
        where r.staff_member_id = v_staff and r.kind = 'electricity'
          and r.period_month = m.monat and r.status in ('requested', 'approved', 'paid')
      )
    ) v
    where (v.angebot ->> 'amount_cents')::integer >= 1
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.electricity_suggestions() from public, anon;
grant execute on function public.electricity_suggestions() to authenticated;

comment on function public.electricity_suggestions() is
  'ORG-008: für den Eingang die abgeschlossenen Monate (höchstens zwölf), für die die angemeldete Person noch keinen Ladestrom beantragt hat und geplante Arbeitsstunden hatte - mit fertig gerechnetem Betrag. Nur für sich, keine Summe über alle (PROJECT_PRINCIPLES.md 20).';

drop function public.submit_electricity_reimbursement(date, integer, boolean, text);

create function public.submit_electricity_reimbursement(
  p_month    date,
  p_declared boolean,
  p_iban     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start  record;
  v_o      record;
  v_minuten integer;
  v_betrag integer;
  v_id     uuid;
  v_status text;
begin
  select * into v_start from app.reimbursement_start(p_iban);
  perform app.assert_electricity_month(v_start.organization_id, p_month);
  -- Die Erklärung: zu Hause geladen. Im Depot lädt die Praxis selbst - dann
  -- gibt es nichts zu erstatten.
  if p_declared is distinct from true then
    raise exception 'declaration missing' using errcode = '22023';
  end if;

  select o.electricity_km_per_hour as kmh, o.electricity_wh_per_km as whkm,
         o.electricity_cents_per_kwh as ct
    into v_o
  from public.organizations o where o.id = v_start.organization_id;
  v_minuten := app.reimbursement_working_minutes(v_start.organization_id, v_start.staff_member_id, p_month);
  v_betrag := app.electricity_amount_cents(v_minuten, v_o.kmh, v_o.whkm, v_o.ct);
  if v_minuten < 1 or v_betrag < 1 then
    raise exception 'no planned working hours' using errcode = '22023';
  end if;

  v_status := case when v_start.self_entered then 'approved' else 'requested' end;
  begin
    insert into public.staff_reimbursements (
      organization_id, staff_member_id, kind, period_month, working_minutes, km_per_hour,
      wh_per_km, rate_cents_per_kwh, declared_at, amount_cents, status, requested_by,
      self_entered, decided_by, decided_at
    )
    values (
      v_start.organization_id, v_start.staff_member_id, 'electricity', p_month, v_minuten,
      v_o.kmh, v_o.whkm, v_o.ct, now(), v_betrag, v_status, auth.uid(),
      v_start.self_entered,
      case when v_start.self_entered then auth.uid() end,
      case when v_start.self_entered then now() end
    )
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'month already requested' using errcode = '23505';
  end;

  return jsonb_build_object('id', v_id, 'status', v_status, 'amount_cents', v_betrag);
end;
$$;

revoke all on function public.submit_electricity_reimbursement(date, boolean, text) from public, anon;
grant execute on function public.submit_electricity_reimbursement(date, boolean, text) to authenticated;

comment on function public.submit_electricity_reimbursement(date, boolean, text) is
  'ORG-008 (ANN-598): Ladestrom eines abgeschlossenen Monats beantragen - der Server rechnet geplante Arbeitsminuten × Strecke × Verbrauch × Satz der Praxis und hält alle Werte fest; die Erklärung (zu Hause geladen) als Haken; je Person und Monat einmal. Optional die IBAN dazu. owner trägt ein (gilt als genehmigt).';

-- -----------------------------------------------------------------------------
-- 5. Lesen: die festen Werte der Liste entfallen
-- -----------------------------------------------------------------------------
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
        select jsonb_agg(app.reimbursement_view(r) order by r.requested_at desc, r.id)
        from public.staff_reimbursements r
        where r.organization_id = v_org and r.staff_member_id = v_person
      ), '[]'::jsonb)
    ) end,
    -- owner: was zu entscheiden und was auszuzahlen ist, je Antrag mit Namen.
    'to_decide', case when not v_entsch then '[]'::jsonb else coalesce((
      select jsonb_agg(app.reimbursement_view(r) order by r.requested_at, r.id)
      from public.staff_reimbursements r
      where r.organization_id = v_org and r.status = 'requested'
        and r.staff_member_id is distinct from v_eigene
    ), '[]'::jsonb) end,
    'to_pay', case when not v_entsch then '[]'::jsonb else coalesce((
      select jsonb_agg(app.reimbursement_view(r)
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

-- Die feste Regel ist abgelöst; ihre Werte stehen an den alten Anträgen.
drop function app.reimbursement_working_days(uuid, uuid, date);
drop function app.electricity_wh_per_day();
drop function app.electricity_cents_per_kwh();
