-- Kennzahlen für Training, Nachsorge-Abo und Trainingspakete (ANN-831, ANN-832): laufende Pakete
-- und Abos, Pakete ohne Anschluss, Zu- und Abgänge des Monats. Nur Summen, allein owner, wie die
-- fünf Kennzahlen der Statistik; drei Zielwerte kommen zu den bestehenden hinzu.

alter table public.practice_targets
  add column training_packages integer
    constraint practice_targets_training_packages_check
      check (training_packages is null or training_packages between 0 and 10000),
  add column aftercare_subscriptions integer
    constraint practice_targets_aftercare_subscriptions_check
      check (aftercare_subscriptions is null or aftercare_subscriptions between 0 and 10000),
  add column packages_ending integer
    constraint practice_targets_packages_ending_check
      check (packages_ending is null or packages_ending between 0 and 10000);

comment on table public.practice_targets is
  'Zielwerte zu den Kennzahlen der Praxisfuehrung (STA-002, PRX-041): Umsatz, offene Posten, Auslastung, Verordnungen ohne Anschluss, Ausfaelle, laufende Trainingspakete, laufende Nachsorge-Abos, Pakete ohne Anschluss. Keine Patientendaten; updated_by nennt das Konto der letzten Aenderung. Kein direkter Zugriff; lesen und schreiben allein owner ueber get_practice_targets und set_practice_target. Datenklasse: Stammdaten der Praxis, faellt mit der Organisation.';

-- Die Rueckgabe waechst um drei Spalten; eine Tabellenfunktion laesst sich dafuer nur neu anlegen.
-- Neu ohne STABLE: Die Abweisung schreibt ihren Eintrag, das geht nur ausserhalb einer lesenden
-- Transaktion.
drop function public.get_practice_targets();

create function public.get_practice_targets()
  returns table (
    revenue_cents           integer,
    open_items_cents        integer,
    utilization_percent     smallint,
    ending_bases            integer,
    absences                integer,
    training_packages       integer,
    aftercare_subscriptions integer,
    packages_ending         integer,
    updated_at              timestamptz
  )
  language plpgsql volatile security definer
  set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_read_practice_statistics() then
    perform app.record_denied_read(auth.uid(), 'statistics.read', 'not allowed to read practice targets');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read practice targets' using errcode = '42501';
  end if;

  -- Immer genau eine Zeile: ohne gespeicherte Ziele eine leere.
  return query
  select t.revenue_cents, t.open_items_cents, t.utilization_percent,
         t.ending_bases, t.absences, t.training_packages,
         t.aftercare_subscriptions, t.packages_ending, t.updated_at
  from (select 1) eins
  left join public.practice_targets t on t.organization_id = v_org;
end;
$$;

comment on function public.get_practice_targets() is
  'STA-002, PRX-041: die Zielwerte der Praxis in einer Zeile, leer ohne gespeicherte Ziele. Allein owner; ein abgewiesener Aufruf liefert keine Zeile und wird als statistics.read protokolliert.';

revoke all on function public.get_practice_targets() from public, anon;
grant execute on function public.get_practice_targets() to authenticated;

create or replace function public.set_practice_target(p_kpi text, p_value integer)
  returns integer
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_alt   integer;
  v_max   integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_read_practice_statistics() then
    raise exception 'not allowed to change practice targets' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to change practice targets' using errcode = '42501';
  end if;

  v_max := case p_kpi
    when 'revenue_cents'           then 100000000
    when 'open_items_cents'        then 100000000
    when 'utilization_percent'     then 100
    when 'ending_bases'            then 10000
    when 'absences'                then 10000
    when 'training_packages'       then 10000
    when 'aftercare_subscriptions' then 10000
    when 'packages_ending'         then 10000
  end;
  if v_max is null then
    raise exception 'unknown practice target' using errcode = '22023';
  end if;
  if p_value is not null and (p_value < 0 or p_value > v_max) then
    raise exception 'practice target out of range' using errcode = '22023';
  end if;

  -- Die Zeile sperren, falls es sie gibt; ohne Zeile ist jeder Zielwert leer.
  select case p_kpi
           when 'revenue_cents'           then t.revenue_cents
           when 'open_items_cents'        then t.open_items_cents
           when 'utilization_percent'     then t.utilization_percent::integer
           when 'ending_bases'            then t.ending_bases
           when 'absences'                then t.absences
           when 'training_packages'       then t.training_packages
           when 'aftercare_subscriptions' then t.aftercare_subscriptions
           when 'packages_ending'         then t.packages_ending
         end
    into v_alt
  from public.practice_targets t
  where t.organization_id = v_org
  for update;

  -- Speichern ohne tatsaechliche Aenderung ist kein Vorgang - und schreibt
  -- auch keine Zeile.
  if v_alt is not distinct from p_value then
    return p_value;
  end if;

  insert into public.practice_targets as t (
    organization_id, revenue_cents, open_items_cents, utilization_percent,
    ending_bases, absences, training_packages, aftercare_subscriptions,
    packages_ending, updated_at, updated_by
  )
  values (
    v_org,
    case when p_kpi = 'revenue_cents'           then p_value end,
    case when p_kpi = 'open_items_cents'        then p_value end,
    case when p_kpi = 'utilization_percent'     then p_value::smallint end,
    case when p_kpi = 'ending_bases'            then p_value end,
    case when p_kpi = 'absences'                then p_value end,
    case when p_kpi = 'training_packages'       then p_value end,
    case when p_kpi = 'aftercare_subscriptions' then p_value end,
    case when p_kpi = 'packages_ending'         then p_value end,
    now(),
    v_actor
  )
  on conflict (organization_id) do update
     set revenue_cents           = case when p_kpi = 'revenue_cents'           then p_value else t.revenue_cents end,
         open_items_cents        = case when p_kpi = 'open_items_cents'        then p_value else t.open_items_cents end,
         utilization_percent     = case when p_kpi = 'utilization_percent'     then p_value::smallint else t.utilization_percent end,
         ending_bases            = case when p_kpi = 'ending_bases'            then p_value else t.ending_bases end,
         absences                = case when p_kpi = 'absences'                then p_value else t.absences end,
         training_packages       = case when p_kpi = 'training_packages'       then p_value else t.training_packages end,
         aftercare_subscriptions = case when p_kpi = 'aftercare_subscriptions' then p_value else t.aftercare_subscriptions end,
         packages_ending         = case when p_kpi = 'packages_ending'         then p_value else t.packages_ending end,
         updated_at              = now(),
         updated_by              = v_actor;

  return p_value;
end;
$$;

comment on function public.set_practice_target(p_kpi text, p_value integer) is
  'STA-002, PRX-041: setzt oder leert (null) einen Zielwert der Praxisfuehrung; wer und wann steht am Datensatz (updated_by, updated_at). Allein owner.';

create function public.get_offer_statistics(p_month date default null)
  returns table (
    time_zone             text,
    today                 date,
    month                 date,
    training_clients      integer,
    packages_running      integer,
    packages_started      integer,
    packages_ending       integer,
    packages_ending_until date,
    aftercare_running     integer,
    aftercare_started     integer,
    aftercare_cancelled   integer,
    training_sessions     integer
  )
  language plpgsql volatile security definer
  set search_path = ''
as $$
declare
  v_org   uuid;
  v_tz    text;
  v_heute date;
  v_monat date;
  v_bis   date;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_read_practice_statistics() then
    perform app.record_denied_read(auth.uid(), 'statistics.read', 'not allowed to read offer statistics');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read offer statistics' using errcode = '42501';
  end if;

  select o.time_zone into v_tz from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_tz)::date;
  v_monat := date_trunc('month', coalesce(p_month, v_heute))::date;
  if v_monat < date '2020-01-01' or v_monat > date '2200-01-01' then
    raise exception 'month out of range' using errcode = '22023';
  end if;
  -- ANN-831: vier Wochen einschliesslich heute, genug Vorlauf fuer ein Gespraech am Termin.
  v_bis := v_heute + 27;

  return query
  with
  pakete as (
    select p.id, p.training_relationship_id, p.starts_on, p.ends_on, r.status
    from public.training_packages p
    join public.training_relationships r on r.id = p.training_relationship_id
    where p.organization_id = v_org
  ),
  paketzahlen as (
    select
      count(*) filter (where p.starts_on <= v_heute and p.ends_on >= v_heute)::integer as laufend,
      count(*) filter (where p.starts_on >= v_monat
                         and p.starts_on < (v_monat + interval '1 month')::date)::integer as neu,
      -- Ohne Anschluss: kein spaeter beginnendes Paket im selben Verhaeltnis,
      -- und das Verhaeltnis laeuft noch - sonst ist niemand anzusprechen.
      count(*) filter (where p.ends_on between v_heute and v_bis
                         and p.status = 'active'
                         and not exists (
                           select 1 from pakete q
                           where q.training_relationship_id = p.training_relationship_id
                             and q.starts_on > p.starts_on))::integer as endend
    from pakete p
  ),
  abos as (
    select
      -- Ein vor dem Beginn gekuendigtes Abo (Ende am Vortag) lief nie.
      count(*) filter (where a.starts_on <= v_heute
                         and (a.ends_on is null or a.ends_on >= v_heute))::integer as laufend,
      count(*) filter (where a.starts_on >= v_monat
                         and a.starts_on < (v_monat + interval '1 month')::date
                         and (a.ends_on is null or a.ends_on >= a.starts_on))::integer as neu,
      count(*) filter (where a.cancelled_on >= v_monat
                         and a.cancelled_on < (v_monat + interval '1 month')::date)::integer as gekuendigt
    from public.aftercare_subscriptions a
    where a.organization_id = v_org
  ),
  kundschaft as (
    select count(*)::integer as aktiv
    from public.training_relationships r
    where r.organization_id = v_org and r.status = 'active'
  ),
  -- Stattgefundene Trainingstermine; die Ernaehrungsberatung ist kein Training (ADR-027).
  einheiten as (
    select count(*)::integer as anzahl
    from public.appointments a
    where a.organization_id = v_org
      and a.kind = 'training'
      and a.occasion is distinct from 'nutrition_counselling'
      and a.status in ('completed', 'documented', 'invoiced')
      and a.starts_at >= (v_monat::timestamp at time zone v_tz)
      and a.starts_at < (((v_monat + interval '1 month')::date)::timestamp at time zone v_tz)
  )
  select v_tz, v_heute, v_monat,
         k.aktiv,
         pz.laufend, pz.neu, pz.endend, v_bis,
         ab.laufend, ab.neu, ab.gekuendigt,
         e.anzahl
  from paketzahlen pz, abos ab, kundschaft k, einheiten e;
end;
$$;

comment on function public.get_offer_statistics(p_month date) is
  'PRX-041: Kennzahlen fuer Training, Nachsorge-Abo und Trainingspakete in einer Zeile - aktive Trainingskund:innen, laufende Pakete und Abos zum Stand heute, Pakete, die in vier Wochen ohne Anschluss enden, neue Pakete und Abos, eingegangene Kuendigungen und stattgefundene Trainingstermine des Monats. Nur Summen, keine Person. Allein owner; ein abgewiesener Aufruf liefert keine Zeile und wird als statistics.read protokolliert.';

revoke all on function public.get_offer_statistics(date) from public, anon;
grant execute on function public.get_offer_statistics(date) to authenticated;
