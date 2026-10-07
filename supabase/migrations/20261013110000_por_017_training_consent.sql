-- =============================================================================
-- POR-017: Einwilligung im Training (ADR-021 Punkte 4, 5, Folgefrage
-- "Einwilligung technisch erfassen"; ADR-023 Punkte 13, 19, 23; Roadmap
-- Block 7: "als Funktion aus POR-EPIC-003")
--
-- Im Training traegt die Heilbehandlungs-Ausnahme (Art. 9 Abs. 2 lit. h)
-- nicht: Angaben zur Gesundheit stuetzen sich auf die ausdrueckliche
-- Einwilligung (Art. 9 Abs. 2 lit. a). Bisher gab es dafuer keinen Ort.
--
-- training_consent_records ist das Gegenstueck zu patient_privacy_records -
-- eine EIGENE Tabelle, weil Fachdaten am Verhaeltnis haengen und es zwischen
-- den Verhaeltnissen keinen Fremdschluessel gibt (ADR-021 Punkte 3, 5). Nur
-- anhaengen, nie aendern; der Stand ist die juengste Zeile. Ein Zweck:
-- training_health_data. Die Praxis vermerkt eine Einwilligung vom Papier
-- (owner, Trainingsbetreuung, Buero - wer das Verhaeltnis schreibt, ANN-172),
-- die Kundin erteilt und widerruft auf der Plattform.
--
-- Was ein Widerruf mit schon erhobenen Angaben macht, entscheidet die
-- Praxis mit der Person (ADR-021 Folgefrage, B2); die Anwendung loescht
-- nichts selbst (ANN-264). Ob ohne Einwilligung kein Trainingsprotokoll
-- entstehen darf, ist ein eigener Loop.
--
-- Datenklasse: Trainingsverhaeltnis, faellt mit ihm (FK on delete cascade).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die Tabelle
-- -----------------------------------------------------------------------------
create table public.training_consent_records (
  id                       uuid primary key default extensions.gen_random_uuid(),
  organization_id          uuid not null references public.organizations (id) on delete restrict,
  training_relationship_id uuid not null
                             references public.training_relationships (id) on delete cascade,
  record_kind              text not null check (record_kind in ('consent_granted', 'consent_withdrawn')),
  -- Muss deckungsgleich mit PLATTFORM_ZWECKE.training in
  -- src/features/platform/einwilligungen.ts bleiben.
  purpose                  text not null check (purpose in ('training_health_data')),
  -- Der Tag auf dem Papier bzw. der Tag auf der Plattform.
  occurred_on              date not null,
  recorded_at              timestamptz not null default now(),
  recorded_by              uuid,
  -- Herkunft wie an patient_privacy_records (POR-016).
  source                   text not null default 'practice' check (source in ('practice', 'platform')),
  platform_access_id       uuid,
  platform_access_kind     text check (platform_access_kind in ('self', 'legal_representative')),
  representative_name      text check (representative_name is null
                                       or length(btrim(representative_name)) between 1 and 200),
  wording_version          text check (wording_version ~ '^[0-9]{4}-[0-9]{2}$'),

  constraint training_consent_records_source_shape check (
    (source = 'platform'
       and platform_access_id is not null
       and platform_access_kind is not null
       and wording_version is not null)
    or (source = 'practice'
       and platform_access_id is null
       and platform_access_kind is null
       and wording_version is null)
  ),
  constraint training_consent_records_representative_shape check (
    (platform_access_kind is not distinct from 'legal_representative') = (representative_name is not null)
  )
);

comment on table public.training_consent_records is
  'POR-017: Einwilligung zu Angaben zur Gesundheit im Training (Art. 9 Abs. 2 lit. a, ADR-021 Punkt 4). Nur anhaengen, nie aendern: der Stand ist die juengste Zeile. Datenklasse: Trainingsverhaeltnis, faellt mit ihm.';

create index training_consent_records_relationship_idx
  on public.training_consent_records (training_relationship_id, recorded_at desc);
create index training_consent_records_organization_idx
  on public.training_consent_records (organization_id);

-- Lesen: wer das Trainingsverhaeltnis liest (owner, Trainingsbetreuung,
-- Buero). Schreiben nur ueber die Funktionen unten.
alter table public.training_consent_records enable row level security;
revoke all on public.training_consent_records from anon, authenticated;
grant select on public.training_consent_records to authenticated;

create policy training_consent_records_select_scoped
  on public.training_consent_records for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and app.can_read_training_relationships()
  );

insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values
  ('training_consent_records', 'trainingsverhaeltnis', 'ueber_elterndatensatz',
   'Einwilligung zu Gesundheitsangaben im Training (POR-017). Faellt mit dem Verhaeltnis (FK on delete cascade); der Nachweis wird so lange gebraucht wie die Angaben, die auf ihr beruhen.', 57);

-- -----------------------------------------------------------------------------
-- 2. Praxis: eine Einwilligung vom Papier vermerken
-- -----------------------------------------------------------------------------
create function public.record_training_consent_entry(
  p_training_relationship_id uuid,
  p_record_kind              text,
  p_occurred_on              date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_zone   text;
  v_letzte record;
  v_id     uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_training_relationships() then
    raise exception 'not allowed to record training consents' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();

  perform 1 from public.training_relationships t
  where t.id = p_training_relationship_id and t.organization_id = v_org
  for update;
  if not found then
    raise exception 'training relationship not found' using errcode = 'P0002';
  end if;

  if p_record_kind is null or p_record_kind not in ('consent_granted', 'consent_withdrawn') then
    raise exception 'unknown record kind' using errcode = '22023';
  end if;
  if p_occurred_on is null then
    raise exception 'date is required' using errcode = '22023';
  end if;
  select o.time_zone into v_zone from public.organizations o where o.id = v_org;
  if p_occurred_on > (now() at time zone coalesce(v_zone, 'Europe/Berlin'))::date then
    raise exception 'date lies in the future' using errcode = '22023';
  end if;

  select r.record_kind, r.occurred_on into v_letzte
  from public.training_consent_records r
  where r.training_relationship_id = p_training_relationship_id
    and r.purpose = 'training_health_data'
  order by r.recorded_at desc, r.id desc
  limit 1;

  if p_record_kind = 'consent_granted'
     and v_letzte.record_kind is not distinct from 'consent_granted' then
    raise exception 'consent already granted' using errcode = '23514';
  end if;
  if p_record_kind = 'consent_withdrawn' then
    if v_letzte.record_kind is distinct from 'consent_granted' then
      raise exception 'no consent to withdraw' using errcode = '23514';
    end if;
    if p_occurred_on < v_letzte.occurred_on then
      raise exception 'withdrawal before consent' using errcode = '22023';
    end if;
  end if;

  insert into public.training_consent_records (
    organization_id, training_relationship_id, record_kind, purpose, occurred_on, recorded_by
  )
  values (
    v_org, p_training_relationship_id, p_record_kind, 'training_health_data', p_occurred_on, v_actor
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.record_training_consent_entry(uuid, text, date) from public, anon;
grant execute on function public.record_training_consent_entry(uuid, text, date) to authenticated;

comment on function public.record_training_consent_entry(uuid, text, date) is
  'POR-017: Einwilligung zu Gesundheitsangaben im Training vom Papier vermerken oder ihren Widerruf. owner, Trainingsbetreuung, Buero (wer das Verhaeltnis schreibt). Nachweis am Datensatz, kein Auditeintrag (ADR-010 Fassung 3).';

-- -----------------------------------------------------------------------------
-- 3. Die Zwecke je Verhaeltnis, jetzt mit Training
-- -----------------------------------------------------------------------------
create or replace function app.platform_consent_purposes(p_relationship_kind text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_relationship_kind
    when 'treatment' then array['email_contact', 'prescriber_report', 'patient_photos']
    when 'training' then array['training_health_data']
    else '{}'::text[]
  end
$$;

-- -----------------------------------------------------------------------------
-- 4. Plattform: lesen, jetzt mit Training. Rumpf sonst unveraendert aus
--    20261013100000_por_016_platform_consents.sql.
-- -----------------------------------------------------------------------------
create or replace function public.platform_consents(p_access_id uuid)
returns table (
  purpose        text,
  state          text,
  occurred_on    date,
  source         text,
  can_grant      boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang   public.platform_accesses%rowtype;
  v_erteilen boolean;
begin
  v_erteilen := app.platform_access_allows(p_access_id, 'consent');
  if not (v_erteilen or app.platform_own_access_after_reading(p_access_id)) then
    return;
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'consents')
  );

  if v_zugang.relationship_kind = 'treatment' then
    return query
    select z.zweck,
           case
             when j.record_kind is null then 'open'
             when j.record_kind = 'consent_granted' then 'granted'
             when j.record_kind = 'consent_withdrawn' then 'withdrawn'
             else 'refused'
           end,
           j.occurred_on,
           j.source,
           v_erteilen
    from unnest(app.platform_consent_purposes('treatment')) with ordinality as z(zweck, nr)
    left join lateral (
      select r.record_kind, r.occurred_on, r.source
      from public.patient_privacy_records r
      where r.patient_id = v_zugang.relationship_id
        and r.organization_id = v_zugang.organization_id
        and r.purpose = z.zweck
      order by r.recorded_at desc, r.id desc
      limit 1
    ) j on true
    order by z.nr;
  else
    return query
    select z.zweck,
           case
             when j.record_kind is null then 'open'
             when j.record_kind = 'consent_granted' then 'granted'
             else 'withdrawn'
           end,
           j.occurred_on,
           j.source,
           v_erteilen
    from unnest(app.platform_consent_purposes('training')) with ordinality as z(zweck, nr)
    left join lateral (
      select r.record_kind, r.occurred_on, r.source
      from public.training_consent_records r
      where r.training_relationship_id = v_zugang.relationship_id
        and r.organization_id = v_zugang.organization_id
        and r.purpose = z.zweck
      order by r.recorded_at desc, r.id desc
      limit 1
    ) j on true
    order by z.nr;
  end if;
end;
$$;

comment on function public.platform_consents(uuid) is
  'POR-016/017: Plattformprojektion der eigenen Einwilligungen je Zweck (Stand aus der juengsten Zeile, Datum, Herkunft), Behandlung und Training. Recht consent (Person, rechtliche Vertretung), die Person auch nach der Lesefrist (ANN-261); nie die Begleitung.';

-- -----------------------------------------------------------------------------
-- 5. Plattform: erteilen und widerrufen, jetzt mit Training
-- -----------------------------------------------------------------------------
create or replace function public.record_platform_consent(
  p_access_id       uuid,
  p_purpose         text,
  p_grant           boolean,
  p_wording_version text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang  public.platform_accesses%rowtype;
  v_zone    text;
  v_heute   date;
  v_letzte  text;
  v_art     text;
  v_name    text;
  v_id      uuid;
begin
  if p_grant is null then
    raise exception 'grant or withdraw' using errcode = '22023';
  end if;
  -- Erteilen nur mit dem Recht consent (Person, rechtliche Vertretung, in der
  -- Lesezeit); widerrufen zusaetzlich die Person selbst nach der Lesefrist.
  if not (app.platform_access_allows(p_access_id, 'consent')
          or (not p_grant and app.platform_own_access_after_reading(p_access_id))) then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;

  if p_purpose is null
     or not (p_purpose = any (app.platform_consent_purposes(v_zugang.relationship_kind))) then
    raise exception 'unknown purpose' using errcode = '22023';
  end if;
  if p_wording_version is distinct from app.platform_consent_wording_version() then
    raise exception 'wording outdated' using errcode = '22023';
  end if;

  -- Gleichzeitige Aufrufe desselben Verhaeltnisses nacheinander: Der Stand,
  -- gegen den geprueft wird, ist der, auf den geschrieben wird.
  if v_zugang.relationship_kind = 'treatment' then
    perform 1 from public.patients p
    where p.id = v_zugang.relationship_id and p.organization_id = v_zugang.organization_id
    for update;
  else
    perform 1 from public.training_relationships t
    where t.id = v_zugang.relationship_id and t.organization_id = v_zugang.organization_id
    for update;
  end if;
  if not found then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;

  if v_zugang.relationship_kind = 'treatment' then
    select r.record_kind into v_letzte
    from public.patient_privacy_records r
    where r.patient_id = v_zugang.relationship_id and r.purpose = p_purpose
    order by r.recorded_at desc, r.id desc
    limit 1;
  else
    select r.record_kind into v_letzte
    from public.training_consent_records r
    where r.training_relationship_id = v_zugang.relationship_id and r.purpose = p_purpose
    order by r.recorded_at desc, r.id desc
    limit 1;
  end if;

  if p_grant then
    if v_letzte is not distinct from 'consent_granted' then
      raise exception 'consent already granted' using errcode = '23514';
    end if;
    v_art := 'consent_granted';
  else
    if v_letzte is distinct from 'consent_granted' then
      raise exception 'no consent to withdraw' using errcode = '23514';
    end if;
    v_art := 'consent_withdrawn';
  end if;

  select o.time_zone into v_zone from public.organizations o where o.id = v_zugang.organization_id;
  v_heute := (now() at time zone coalesce(v_zone, 'Europe/Berlin'))::date;
  v_name := case when v_zugang.access_kind = 'legal_representative'
                 then v_zugang.representative_name end;

  if v_zugang.relationship_kind = 'treatment' then
    insert into public.patient_privacy_records (
      organization_id, patient_id, record_kind, purpose, occurred_on, recorded_by,
      source, platform_access_id, platform_access_kind, representative_name, wording_version
    )
    values (
      v_zugang.organization_id, v_zugang.relationship_id, v_art, p_purpose, v_heute, auth.uid(),
      'platform', v_zugang.id, v_zugang.access_kind, v_name, p_wording_version
    )
    returning id into v_id;

    -- ADR-017 Punkt 36: Der Widerruf der Fotoeinwilligung loescht sofort.
    if v_art = 'consent_withdrawn' and p_purpose = 'patient_photos' then
      perform app.delete_due_patient_photos(
        v_zugang.organization_id, v_zugang.relationship_id, extensions.gen_random_uuid(),
        auth.uid(), 'consent_withdrawn'
      );
    end if;
  else
    insert into public.training_consent_records (
      organization_id, training_relationship_id, record_kind, purpose, occurred_on, recorded_by,
      source, platform_access_id, platform_access_kind, representative_name, wording_version
    )
    values (
      v_zugang.organization_id, v_zugang.relationship_id, v_art, p_purpose, v_heute, auth.uid(),
      'platform', v_zugang.id, v_zugang.access_kind, v_name, p_wording_version
    )
    returning id into v_id;
  end if;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read',
    jsonb_build_object('view', case when p_grant then 'consent_granted' else 'consent_withdrawn' end)
  );
  return v_id;
end;
$$;

comment on function public.record_platform_consent(uuid, text, boolean, text) is
  'POR-016/017: Einwilligung erteilen oder widerrufen ueber die Plattform (ADR-023 Punkt 13), Behandlung und Training. Recht consent; widerrufen auch die Person selbst nach der Lesefrist (ANN-261). Zeile mit Herkunft und Textfassung (ANN-262); Widerruf der Fotos loescht sofort (ADR-017 Punkt 36).';

-- -----------------------------------------------------------------------------
-- 6. Offene Punkte: Widerrufe, jetzt mit Training (ANN-263)
-- -----------------------------------------------------------------------------
create or replace function public.list_platform_consent_withdrawals()
returns table (
  id                       uuid,
  relationship_kind        text,
  patient_id               uuid,
  training_relationship_id uuid,
  given_name               text,
  family_name              text,
  purpose                  text,
  occurred_on              date,
  recorded_at              timestamptz,
  platform_access_kind     text,
  representative_name      text
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
  if v_org is null then
    return;
  end if;

  return query
  select x.id, x.relationship_kind, x.patient_id, x.training_relationship_id, x.given_name,
         x.family_name, x.purpose, x.occurred_on, x.recorded_at, x.platform_access_kind,
         x.representative_name
  from (
    select r.id, 'treatment'::text as relationship_kind, r.patient_id,
           null::uuid as training_relationship_id, pe.given_name, pe.family_name,
           r.purpose, r.occurred_on, r.recorded_at, r.platform_access_kind, r.representative_name
    from public.patient_privacy_records r
    join public.patients p on p.id = r.patient_id
    join public.persons pe on pe.id = p.person_id
    where app.can_read_patient_directory()
      and r.organization_id = v_org
      and r.source = 'platform'
      and r.record_kind = 'consent_withdrawn'
      and r.recorded_at > now() - make_interval(days => app.platform_withdrawal_notice_days())
    union all
    select r.id, 'training'::text, null::uuid, r.training_relationship_id, pe.given_name,
           pe.family_name, r.purpose, r.occurred_on, r.recorded_at, r.platform_access_kind,
           r.representative_name
    from public.training_consent_records r
    join public.training_relationships t on t.id = r.training_relationship_id
    join public.persons pe on pe.id = t.person_id
    where app.can_read_training_relationships()
      and r.organization_id = v_org
      and r.source = 'platform'
      and r.record_kind = 'consent_withdrawn'
      and r.recorded_at > now() - make_interval(days => app.platform_withdrawal_notice_days())
  ) x
  order by x.recorded_at desc, x.id;
end;
$$;

comment on function public.list_platform_consent_withdrawals() is
  'POR-016/017 (ANN-263): Widerrufe ueber die Plattform der letzten 14 Tage fuer Offene Punkte - Behandlung fuer die Rollen der Kartei, Training fuer die Rollen, die das Trainingsverhaeltnis lesen. Ohne Recht keine Zeile.';
