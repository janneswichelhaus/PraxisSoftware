-- =============================================================================
-- ANG-003 (ANG-EPIC-001): Das Nachsorge-Abo kuendigen
--
-- PROJECT_PRINCIPLES.md 4.6, ADR-009 Punkt 21: monatlich kuendbar, mit
-- Kuendigungsknopf (Roadmap). Zwei Wege, ein Ergebnis:
--
--   public.cancel_aftercare_subscription  die Praxis traegt eine Kuendigung
--                                         ein (Telefon, Brief)
--   public.platform_aftercare             was die Person ueber ihr Abo sieht
--   public.cancel_platform_aftercare      der Kuendigungsknopf der Plattform
--   public.list_platform_aftercare_cancellations
--                                         Kuendigungen ueber die Plattform in
--                                         Offene Punkte (14 Tage)
--
-- Die Kuendigung wirkt zum Ende des laufenden Abo-Monats (ANN-270). Den Knopf
-- baut die Plattform nach dem Muster des Paragrafen 312k BGB: Knopf, Seite
-- zur Bestaetigung, "Jetzt kuendigen", sofortige Bestaetigung mit Zeitpunkt
-- (ANN-272). Kuendigen duerfen die Person selbst und ihre rechtliche
-- Vertretung mit nachgewiesener Vermoegenssorge, nie die Begleitung
-- (ANN-273).
--
-- KEINE NEUE AUDITAKTION (ADR-010 Punkt 15): Herkunft, Zugang, Art und Name
-- der Vertretung stehen an der Kuendigung. Was eine Vertretung liest oder
-- tut, laeuft ueber platform_representation.read wie bei der Einwilligung.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Das Ende nach einer Kuendigung (ANN-270)
-- -----------------------------------------------------------------------------
create function app.aftercare_cancellation_end(p_starts_on date, p_day date)
returns date
language sql
immutable
set search_path = ''
as $$
  -- ANN-270: zum Ende des laufenden Abo-Monats; vor dem Beginn endet das Abo,
  -- bevor ein Monat entsteht.
  select case
    when p_day < p_starts_on then p_starts_on - 1
    else app.aftercare_month_end(p_starts_on, app.aftercare_month_index(p_starts_on, p_day))
  end
$$;

revoke all on function app.aftercare_cancellation_end(date, date) from public, anon, authenticated;

comment on function app.aftercare_cancellation_end(date, date) is
  'ANG-003 (ANN-270): letzter Tag des Abos nach einer Kuendigung an diesem Tag - das Ende des laufenden Abo-Monats, vor dem Beginn der Vortag des Beginns.';

-- -----------------------------------------------------------------------------
-- 2. Die eine Stelle, die kuendigt
--
-- Unter Sperre der Akte; ein schon gekuendigtes Abo wird nicht ein zweites
-- Mal gekuendigt. Liefert das Ende.
-- -----------------------------------------------------------------------------
create function app.cancel_aftercare(
  p_subscription_id uuid,
  p_via             text,
  p_access_id       uuid,
  p_access_kind     text,
  p_representative  text
)
returns table (ends_on date, cancelled_at timestamptz, cancelled_on date)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_abo   public.aftercare_subscriptions%rowtype;
  v_heute date;
  v_ende  date;
begin
  perform 1 from public.patients p
  join public.aftercare_subscriptions s on s.patient_id = p.id
  where s.id = p_subscription_id
  for update of p;

  select * into v_abo from public.aftercare_subscriptions s where s.id = p_subscription_id
  for update;
  if not found then
    raise exception 'aftercare subscription not found' using errcode = '42501';
  end if;
  if v_abo.ends_on is not null then
    raise exception 'aftercare subscription already cancelled' using errcode = '23514';
  end if;

  v_heute := app.training_today(v_abo.organization_id);
  v_ende := app.aftercare_cancellation_end(v_abo.starts_on, v_heute);

  update public.aftercare_subscriptions s
     set ends_on = v_ende,
         cancelled_at = now(),
         cancelled_by = auth.uid(),
         cancelled_on = v_heute,
         cancelled_via = p_via,
         cancelled_platform_access_id = p_access_id,
         cancelled_access_kind = p_access_kind,
         cancelled_representative_name = p_representative
   where s.id = p_subscription_id;

  return query select v_ende, now(), v_heute;
end;
$$;

revoke all on function app.cancel_aftercare(uuid, text, uuid, text, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Die Praxis traegt eine Kuendigung ein
-- -----------------------------------------------------------------------------
create function public.cancel_aftercare_subscription(p_subscription_id uuid)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ende date;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_manage_aftercare() then
    raise exception 'not allowed to manage aftercare subscriptions' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.aftercare_subscriptions s
    where s.id = p_subscription_id and s.organization_id = app.current_organization_id()
  ) then
    raise exception 'aftercare subscription not found' using errcode = '42501';
  end if;

  select c.ends_on into v_ende
  from app.cancel_aftercare(p_subscription_id, 'practice', null, null, null) c;
  return v_ende;
end;
$$;

revoke all on function public.cancel_aftercare_subscription(uuid) from public, anon;
grant execute on function public.cancel_aftercare_subscription(uuid) to authenticated;

comment on function public.cancel_aftercare_subscription(uuid) is
  'ANG-003: eine Kuendigung des Nachsorge-Abos eintragen, die bei der Praxis einging (owner, office). Wirkt zum Ende des laufenden Abo-Monats (ANN-270); liefert das Ende.';

-- -----------------------------------------------------------------------------
-- 4. Wer ueber die Plattform kuendigen darf (ANN-273)
--
-- Aus 20261010140000_por_012_platform_questionnaire.sql (juengste Fassung)
-- um das Recht `contract` ergaenzt: die Person selbst und eine rechtliche
-- Vertretung mit nachgewiesener Vermoegenssorge. Eine Begleitung nie - auch
-- nicht, wenn sie Rechnungen sehen darf.
-- -----------------------------------------------------------------------------
create or replace function app.platform_access_allows(p_access_id uuid, p_capability text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      -- Gesundheit: Lesen, Wuensche, Nachrichten. Jede Vertretung traegt
      -- diesen Bereich nachgewiesen (Constraint platform_accesses_kind_fields).
      when p_capability in ('read', 'request', 'message') then true
      -- Rechnungen und Zahlungen: der eigene Zugang, sonst nur mit
      -- nachgewiesener Vermoegenssorge bzw. Einwilligung (ABN-010).
      when p_capability = 'billing'
        then a.access_kind = 'self' or coalesce(a.finance_scope, false)
      -- ANG-003 (ANN-273): einen Vertrag kuendigen die Person selbst und eine
      -- rechtliche Vertretung mit Vermoegenssorge, nie eine Begleitung.
      when p_capability = 'contract'
        then a.access_kind = 'self'
             or (a.access_kind = 'legal_representative' and coalesce(a.finance_scope, false))
      -- POR-012 (ANN-248): den Befundbogen fuellt die Person selbst oder ihre
      -- rechtliche Vertretung aus - eine Angabe zur Gesundheit, die eine
      -- Begleitung nicht fuer sie macht.
      when p_capability in ('consent', 'export', 'manage_companions', 'questionnaire')
        then a.access_kind in ('self', 'legal_representative')
      else false
    end
    from public.platform_accesses a
    where a.id = p_access_id
      and exists (select 1 from app.platform_readable_access(a.id))
  ), false)
$$;

-- -----------------------------------------------------------------------------
-- 5. Was die Person ueber ihr Abo sieht
--
-- Das juengste Abo der Akte hinter dem Zugang: seit wann, bis wann, der
-- naechste Abo-Monat mit Preis und - solange es laeuft - das Ende, auf das
-- eine Kuendigung heute fiele. Recht `billing`; ob der Knopf da ist, sagt
-- `can_cancel` (Recht `contract`). Kein Abo: null.
-- -----------------------------------------------------------------------------
create function public.platform_aftercare(p_access_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
  v_abo    public.aftercare_subscriptions%rowtype;
  v_heute  date;
  v_naechster date;
begin
  if not app.platform_access_allows(p_access_id, 'billing') then
    return null;
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  if v_zugang.relationship_kind <> 'treatment' then
    return null;
  end if;

  select * into v_abo
  from public.aftercare_subscriptions s
  where s.patient_id = v_zugang.relationship_id
    and s.organization_id = v_zugang.organization_id
  order by s.starts_on desc
  limit 1;
  if not found then
    return null;
  end if;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'aftercare')
  );

  v_heute := app.training_today(v_abo.organization_id);
  if v_abo.ends_on is null then
    v_naechster := case
      when v_heute < v_abo.starts_on then v_abo.starts_on
      else app.aftercare_month_start(v_abo.starts_on, app.aftercare_month_index(v_abo.starts_on, v_heute) + 1)
    end;
  end if;

  return jsonb_build_object(
    'id', v_abo.id,
    'starts_on', v_abo.starts_on,
    'ends_on', v_abo.ends_on,
    'state', case
      when v_abo.ends_on is null then 'running'
      when v_abo.ends_on >= v_heute then 'ending'
      else 'ended'
    end,
    'next_month_start', v_naechster,
    'next_month_price_cents', (
      select pr.unit_price_cents from app.aftercare_month_price(v_abo.organization_id, v_naechster) pr
    ),
    'cancel_effective_on', case when v_abo.ends_on is null
      then app.aftercare_cancellation_end(v_abo.starts_on, v_heute) end,
    'cancelled_at', v_abo.cancelled_at,
    'cancelled_via', v_abo.cancelled_via,
    'can_cancel', v_abo.ends_on is null and app.platform_access_allows(p_access_id, 'contract')
  );
end;
$$;

revoke all on function public.platform_aftercare(uuid) from public, anon;
grant execute on function public.platform_aftercare(uuid) to authenticated;

comment on function public.platform_aftercare(uuid) is
  'ANG-003: Plattformprojektion "Nachsorge-Abo" - das juengste Abo der Akte hinter dem Zugang mit Stand, naechstem Monat und Preis. Recht billing; den Kuendigungsknopf traegt can_cancel (Recht contract, ANN-273). Vertretung protokolliert.';

-- -----------------------------------------------------------------------------
-- 6. Der Kuendigungsknopf (ANN-272)
-- -----------------------------------------------------------------------------
create function public.cancel_platform_aftercare(p_access_id uuid, p_subscription_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
  v_ende   record;
begin
  if not app.platform_access_allows(p_access_id, 'contract') then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;

  if v_zugang.relationship_kind <> 'treatment' or not exists (
    select 1 from public.aftercare_subscriptions s
    where s.id = p_subscription_id
      and s.patient_id = v_zugang.relationship_id
      and s.organization_id = v_zugang.organization_id
  ) then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;

  select c.* into v_ende
  from app.cancel_aftercare(
    p_subscription_id, 'platform', v_zugang.id, v_zugang.access_kind,
    case when v_zugang.access_kind = 'legal_representative' then v_zugang.representative_name end
  ) c;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'aftercare_cancelled')
  );

  return jsonb_build_object(
    'ends_on', v_ende.ends_on,
    'cancelled_at', v_ende.cancelled_at,
    'cancelled_on', v_ende.cancelled_on
  );
end;
$$;

revoke all on function public.cancel_platform_aftercare(uuid, uuid) from public, anon;
grant execute on function public.cancel_platform_aftercare(uuid, uuid) to authenticated;

comment on function public.cancel_platform_aftercare(uuid, uuid) is
  'ANG-003 (ANN-272, ANN-273): der Kuendigungsknopf der Plattform. Recht contract (Person, rechtliche Vertretung mit Vermoegenssorge). Wirkt zum Ende des laufenden Abo-Monats und liefert die Bestaetigung mit Zeitpunkt.';

-- -----------------------------------------------------------------------------
-- 7. Praxis: Kuendigungen ueber die Plattform in Offene Punkte
--
-- Wie die Widerrufe (ANN-263): 14 Tage, kein Zustand "gesehen". Sehen
-- duerfen sie die Rollen, die das Abo fuehren.
-- -----------------------------------------------------------------------------
create function public.list_platform_aftercare_cancellations()
returns table (
  subscription_id        uuid,
  patient_id             uuid,
  given_name             text,
  family_name            text,
  cancelled_on           date,
  ends_on                date,
  cancelled_access_kind  text,
  cancelled_representative_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null or not app.can_manage_aftercare() then
    return;
  end if;

  return query
  select s.id, s.patient_id, pe.given_name, pe.family_name, s.cancelled_on, s.ends_on,
         s.cancelled_access_kind, s.cancelled_representative_name
  from public.aftercare_subscriptions s
  join public.patients p on p.id = s.patient_id
  join public.persons pe on pe.id = p.person_id
  where s.organization_id = v_org
    and s.cancelled_via = 'platform'
    and s.cancelled_at > now() - make_interval(days => app.platform_withdrawal_notice_days())
  order by s.cancelled_at desc, s.id;
end;
$$;

revoke all on function public.list_platform_aftercare_cancellations() from public, anon;
grant execute on function public.list_platform_aftercare_cancellations() to authenticated;

comment on function public.list_platform_aftercare_cancellations() is
  'ANG-003: Kuendigungen des Nachsorge-Abos ueber die Plattform der letzten 14 Tage fuer Offene Punkte (owner, office; wie ANN-263). Ohne Recht keine Zeile.';
