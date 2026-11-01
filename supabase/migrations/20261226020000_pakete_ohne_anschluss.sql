-- Trainingspakete ohne Anschluss als Liste fuer Offene Punkte (ANN-834). Die Regel steht an einer
-- Stelle: Liste und Kennzahl der Statistik lesen beide daraus und laufen nicht auseinander.

create function app.ending_training_packages_until(p_organization_id uuid)
  returns date
  language sql stable security definer
  set search_path = ''
as $$
  -- ANN-831: vier Wochen einschliesslich heute, genug Vorlauf fuer ein Gespraech am Termin.
  select app.training_today(p_organization_id) + 27
$$;

comment on function app.ending_training_packages_until(p_organization_id uuid) is
  'Letzter Tag des Fensters fuer Trainingspakete ohne Anschluss: heute in der Zeitzone der Praxis plus 27 Tage, vier Wochen einschliesslich heute (ANN-831). Ohne Rollenpruefung: nur aus Funktionen mit eigener Pruefung aufrufen.';

revoke all on function app.ending_training_packages_until(uuid) from public, anon, authenticated;

create function app.ending_training_packages(p_organization_id uuid)
  returns table (
    training_package_id      uuid,
    training_relationship_id uuid,
    catalog_item_id          uuid,
    ends_on                  date
  )
  language sql stable security definer
  set search_path = ''
as $$
  with fenster as (
    select app.training_today(p_organization_id) as von,
           app.ending_training_packages_until(p_organization_id) as bis
  )
  select p.id, p.training_relationship_id, p.catalog_item_id, p.ends_on
  from public.training_packages p
  join public.training_relationships r on r.id = p.training_relationship_id
  cross join fenster f
  where p.organization_id = p_organization_id
    and p.ends_on between f.von and f.bis
    -- Ein beendetes Verhaeltnis hat niemanden mehr, dem ein Folgepaket anzubieten waere.
    and r.status = 'active'
    and not exists (
      select 1 from public.training_packages q
      where q.organization_id = p.organization_id
        and q.training_relationship_id = p.training_relationship_id
        and q.starts_on > p.starts_on)
$$;

comment on function app.ending_training_packages(p_organization_id uuid) is
  'Trainingspakete ohne Anschluss: enden zwischen heute und app.ending_training_packages_until, ohne spaeter beginnendes Paket im selben Verhaeltnis, Verhaeltnis aktiv (ANN-831). Einzige Stelle der Regel; get_offer_statistics und list_ending_training_packages lesen daraus. Ohne Rollenpruefung: nur aus Funktionen mit eigener Pruefung aufrufen.';

revoke all on function app.ending_training_packages(uuid) from public, anon, authenticated;

-- Die Zahl ohne Anschluss kommt aus app.ending_training_packages, wie die Liste in Offene Punkte.
create or replace function public.get_offer_statistics(p_month date default null)
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
  v_bis := app.ending_training_packages_until(v_org);

  return query
  with
  paketzahlen as (
    select
      count(*) filter (where p.starts_on <= v_heute and p.ends_on >= v_heute)::integer as laufend,
      count(*) filter (where p.starts_on >= v_monat
                         and p.starts_on < (v_monat + interval '1 month')::date)::integer as neu
    from public.training_packages p
    where p.organization_id = v_org
  ),
  ohne_anschluss as (
    select count(*)::integer as anzahl
    from app.ending_training_packages(v_org)
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
         pz.laufend, pz.neu, oa.anzahl, v_bis,
         ab.laufend, ab.neu, ab.gekuendigt,
         e.anzahl
  from paketzahlen pz, ohne_anschluss oa, abos ab, kundschaft k, einheiten e;
end;
$$;

comment on function public.get_offer_statistics(p_month date) is
  'PRX-041: Kennzahlen fuer Training, Nachsorge-Abo und Trainingspakete in einer Zeile - aktive Trainingskund:innen, laufende Pakete und Abos zum Stand heute, Pakete ohne Anschluss (app.ending_training_packages), neue Pakete und Abos, eingegangene Kuendigungen und stattgefundene Trainingstermine des Monats. Nur Summen, keine Person. Allein owner; ein abgewiesener Aufruf liefert keine Zeile und wird als statistics.read protokolliert.';

create function public.list_ending_training_packages()
  returns table (
    training_relationship_id uuid,
    given_name               text,
    family_name              text,
    package_months           smallint,
    ends_on                  date
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
  if not app.can_manage_training_packages() then
    perform app.record_denied_read(auth.uid(), 'training_packages.read', 'not allowed to read ending training packages');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read ending training packages' using errcode = '42501';
  end if;

  return query
  select e.training_relationship_id, pe.given_name, pe.family_name, c.package_months, e.ends_on
  from app.ending_training_packages(v_org) e
  join public.training_relationships t on t.id = e.training_relationship_id
  join public.persons pe on pe.id = t.person_id
  join public.service_catalog_items c on c.id = e.catalog_item_id
  order by e.ends_on, pe.family_name, pe.given_name, e.training_relationship_id;
end;
$$;

comment on function public.list_ending_training_packages() is
  'PRX-043 (ANN-834): Trainingspakete ohne Anschluss fuer Offene Punkte - Name, Laufzeit und letzter Tag, nach dem Ende sortiert; dieselbe Regel wie die Kennzahl der Statistik (app.ending_training_packages). Kein Kontakt, keine Kennung des Pakets. owner und office (app.can_manage_training_packages); ein abgewiesener Aufruf liefert keine Zeile und wird als training_packages.read protokolliert.';

revoke all on function public.list_ending_training_packages() from public, anon;
grant execute on function public.list_ending_training_packages() to authenticated;
