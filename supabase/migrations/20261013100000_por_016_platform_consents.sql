-- =============================================================================
-- POR-016: Einwilligungen in der Behandlung ueber die Plattform (ADR-023
-- Punkte 13, 19, 22, 23, 24; DSN-001 Abschnitt 4.1 "Ich", D2; PAT-006,
-- ANN-093; ADR-017 Punkte 35, 36; ADR-010 Fassung 3)
--
-- Die Person erteilt und widerruft ihre Einwilligungen selbst, unter "Ich".
-- Gespeichert wird in DERSELBEN Tabelle wie die Vermerke der Praxis
-- (patient_privacy_records): Der Stand eines Zwecks ist seine juengste Zeile,
-- gleich wer sie geschrieben hat. So greift der Widerruf der Fotoeinwilligung
-- ohne zweiten Weg (app.delete_due_patient_photos, ADR-017 Punkt 36), und
-- die Akte zeigt einen Stand, nicht zwei.
--
-- Neu an der Zeile ist ihre Herkunft (ADR-010 Fassung 3: das Datenmodell ist
-- der Nachweis, Art. 7 Abs. 1 DSGVO):
--   source                 practice | platform
--   platform_access_id     ueber welchen Zugang - ohne FK, weil der Zugang
--                          nach drei Jahren faellt, der Vermerk mit der Akte
--   platform_access_kind   self | legal_representative
--   representative_name    bei einer Vertretung: wer gehandelt hat, als
--                          Kopie, weil Konto und Zugang frueher fallen
--   wording_version        welche Fassung des Einwilligungstexts die Person
--                          gesehen hat (ANN-262)
--
-- Wer darf: die Person selbst und ihre rechtliche Vertretung, nie die
-- Begleitung (ADR-023 Punkt 13, Recht `consent`). Den WIDERRUF behaelt die
-- Person selbst auch nach der Lesefrist, solange ihr Zugang aktiv ist (D2:
-- "Ich" bleibt, weil Widerruf und Auskunft nicht an einem Abo haengen
-- duerfen; ANN-261).
--
-- Kein neuer Auditeintrag: Schreibvorgaenge weist das Datenmodell nach. Ueber
-- eine Vertretung steht der Aufruf wie jeder Vertretungszugriff im Protokoll
-- (platform_representation.read, ADR-010 Punkt 16).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Herkunft am Vermerk
-- -----------------------------------------------------------------------------
alter table public.patient_privacy_records
  add column source               text not null default 'practice'
                                    check (source in ('practice', 'platform')),
  add column platform_access_id   uuid,
  add column platform_access_kind text
                                    check (platform_access_kind in ('self', 'legal_representative')),
  add column representative_name  text
                                    check (representative_name is null
                                           or length(btrim(representative_name)) between 1 and 200),
  add column wording_version      text
                                    check (wording_version ~ '^[0-9]{4}-[0-9]{2}$');

alter table public.patient_privacy_records
  -- Von der Plattform kommen nur Erteilung und Widerruf, immer mit Zugang,
  -- Art und Textfassung; von der Praxis nichts davon.
  add constraint patient_privacy_records_source_shape check (
    (source = 'platform'
       and record_kind in ('consent_granted', 'consent_withdrawn')
       and platform_access_id is not null
       and platform_access_kind is not null
       and wording_version is not null)
    or (source = 'practice'
       and platform_access_id is null
       and platform_access_kind is null
       and wording_version is null)
  ),
  add constraint patient_privacy_records_representative_shape check (
    (platform_access_kind is not distinct from 'legal_representative') = (representative_name is not null)
  );

comment on column public.patient_privacy_records.source is
  'POR-016: practice = Vermerk der Praxis vom Papier (PAT-006); platform = die Person oder ihre rechtliche Vertretung auf der Plattform.';
comment on column public.patient_privacy_records.platform_access_id is
  'POR-016: der Zugang, ueber den der Vermerk entstand. Ohne FK: der Zugang faellt drei Jahre nach seinem Ende, der Vermerk mit der Akte.';
comment on column public.patient_privacy_records.representative_name is
  'POR-016: bei einer rechtlichen Vertretung ihr Name als Teil des Nachweises (ADR-023 Konsequenzen), weil Konto und Zugang frueher fallen.';
comment on column public.patient_privacy_records.wording_version is
  'POR-016 (ANN-262): die Fassung des Einwilligungstexts, die die Person auf der Plattform gesehen hat (src/features/platform/einwilligungen.ts).';

-- -----------------------------------------------------------------------------
-- 2. Die aktuelle Fassung der Einwilligungstexte (ANN-262)
--
-- Eine Stelle. Der Text selbst steht in src/features/platform/einwilligungen.ts
-- (EINWILLIGUNGSFASSUNG); einwilligungen.test.ts prueft, dass beide gleich
-- sind. Aendert sich ein Text, aendert sich die Fassung, und eine Seite mit
-- altem Text wird abgewiesen, statt eine Einwilligung zu einem Text zu
-- speichern, den es nicht mehr gibt.
-- -----------------------------------------------------------------------------
create function app.platform_consent_wording_version()
returns text
language sql
immutable
set search_path = ''
as $$
  select '2026-10'::text
$$;

revoke all on function app.platform_consent_wording_version() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Der eigene Zugang nach der Lesefrist (D2, ANN-261)
--
-- Wie app.platform_readable_access, aber ohne das Ende: Nur die Person
-- selbst, nur ein aktiver Zugang, solange ihr Verhaeltnis besteht. Eine
-- Vertretung bekommt das nicht - ihr Ende kann auch aus der Volljaehrigkeit
-- oder einer fehlenden Altersangabe kommen (app.platform_access_ended_at),
-- und dann ist sie zu Ende, nicht nur ihre Lesezeit.
-- -----------------------------------------------------------------------------
create function app.platform_own_access_after_reading(p_access_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select true
    from public.platform_accesses a
    where a.id = p_access_id
      and a.account_user_id = auth.uid()
      and a.access_kind = 'self'
      and a.status = 'active'
      and (a.patient_id is not null or a.training_relationship_id is not null)
      and not exists (select 1 from public.user_profiles up where up.id = auth.uid())
      and app.session_open()
  ), false)
$$;

revoke all on function app.platform_own_access_after_reading(uuid) from public, anon, authenticated;

comment on function app.platform_own_access_after_reading(uuid) is
  'POR-016 (D2, ANN-261): ob ein eigener, aktiver Zugang mit lebendem Verhaeltnis vorliegt - auch nach der Lesefrist. Nur fuer den Widerruf (und den Stand, den er braucht), nie fuer Lesen, Erteilen oder Export.';

-- -----------------------------------------------------------------------------
-- 4. Die Zwecke je Verhaeltnis
--
-- Behandlung: die drei Zwecke aus PAT-006 und ADR-017 (ANN-093). Training
-- kommt mit POR-017 hinzu.
-- -----------------------------------------------------------------------------
create function app.platform_consent_purposes(p_relationship_kind text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_relationship_kind
    when 'treatment' then array['email_contact', 'prescriber_report', 'patient_photos']
    else '{}'::text[]
  end
$$;

revoke all on function app.platform_consent_purposes(text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Plattform: die eigenen Einwilligungen lesen
--
-- Je Zweck der Stand aus der juengsten Zeile: granted, withdrawn, refused
-- oder open (noch nie etwas). Dazu das Datum und ob die Plattform oder die
-- Praxis den Stand gesetzt hat - die Person soll sehen, dass ein Papier in
-- der Praxis zaehlt. Keine Namen von Mitarbeitenden (Punkt 22).
--
-- Lesen darf, wer erteilen darf (Recht consent), und die Person selbst nach
-- der Lesefrist, weil sie dann noch widerrufen kann. Eine Begleitung sieht
-- nichts: Sie erteilt nichts, und der Stand geht sie nichts an.
-- -----------------------------------------------------------------------------
create function public.platform_consents(p_access_id uuid)
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
  end if;
end;
$$;

revoke all on function public.platform_consents(uuid) from public, anon;
grant execute on function public.platform_consents(uuid) to authenticated;

comment on function public.platform_consents(uuid) is
  'POR-016: Plattformprojektion der eigenen Einwilligungen je Zweck (Stand aus der juengsten Zeile, Datum, Herkunft). Recht consent (Person, rechtliche Vertretung), die Person auch nach der Lesefrist (ANN-261); nie die Begleitung.';

-- -----------------------------------------------------------------------------
-- 6. Plattform: erteilen und widerrufen
-- -----------------------------------------------------------------------------
create function public.record_platform_consent(
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

  if v_zugang.relationship_kind <> 'treatment' then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;
  if p_purpose is null or not (p_purpose = any (app.platform_consent_purposes('treatment'))) then
    raise exception 'unknown purpose' using errcode = '22023';
  end if;
  if p_wording_version is distinct from app.platform_consent_wording_version() then
    raise exception 'wording outdated' using errcode = '22023';
  end if;

  -- Gleichzeitige Aufrufe derselben Akte nacheinander: Der Stand, gegen den
  -- geprueft wird, ist der, auf den geschrieben wird.
  perform 1 from public.patients p
  where p.id = v_zugang.relationship_id and p.organization_id = v_zugang.organization_id
  for update;
  if not found then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;

  select r.record_kind into v_letzte
  from public.patient_privacy_records r
  where r.patient_id = v_zugang.relationship_id
    and r.purpose = p_purpose
  order by r.recorded_at desc, r.id desc
  limit 1;

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

  insert into public.patient_privacy_records (
    organization_id, patient_id, record_kind, purpose, occurred_on, recorded_by,
    source, platform_access_id, platform_access_kind, representative_name, wording_version
  )
  values (
    v_zugang.organization_id, v_zugang.relationship_id, v_art, p_purpose, v_heute, auth.uid(),
    'platform', v_zugang.id, v_zugang.access_kind,
    case when v_zugang.access_kind = 'legal_representative' then v_zugang.representative_name end,
    p_wording_version
  )
  returning id into v_id;

  -- ADR-017 Punkt 36: Der Widerruf der Fotoeinwilligung loescht sofort, in
  -- derselben Transaktion, auf demselben Weg wie in der Praxis.
  if v_art = 'consent_withdrawn' and p_purpose = 'patient_photos' then
    perform app.delete_due_patient_photos(
      v_zugang.organization_id, v_zugang.relationship_id, extensions.gen_random_uuid(),
      auth.uid(), 'consent_withdrawn'
    );
  end if;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read',
    jsonb_build_object('view', case when p_grant then 'consent_granted' else 'consent_withdrawn' end)
  );
  return v_id;
end;
$$;

revoke all on function public.record_platform_consent(uuid, text, boolean, text) from public, anon;
grant execute on function public.record_platform_consent(uuid, text, boolean, text) to authenticated;

comment on function public.record_platform_consent(uuid, text, boolean, text) is
  'POR-016: Einwilligung erteilen oder widerrufen ueber die Plattform (ADR-023 Punkt 13). Recht consent; widerrufen auch die Person selbst nach der Lesefrist (ANN-261). Zeile in patient_privacy_records mit Herkunft und Textfassung (ANN-262); Widerruf der Fotos loescht sofort (ADR-017 Punkt 36).';

-- -----------------------------------------------------------------------------
-- 7. Praxis: Widerrufe ueber die Plattform in Offene Punkte (DSN-001
--    Abschnitt 6, ANN-263)
--
-- Was die Person selbst widerruft, muss die Praxis erfahren - sonst schickt
-- sie den naechsten Bericht oder die naechste Mail auf einer Grundlage, die es
-- nicht mehr gibt. Kein Zustand "gesehen": 14 Tage stehen die Widerrufe in
-- Offene Punkte, danach in der Akte. Sehen duerfen sie die Rollen, die die
-- Kartei lesen (dieselbe RLS wie die Tabelle). Training kommt mit POR-017.
-- -----------------------------------------------------------------------------
create function app.platform_withdrawal_notice_days()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 14
$$;

revoke all on function app.platform_withdrawal_notice_days() from public, anon, authenticated;

create function public.list_platform_consent_withdrawals()
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

  if app.can_read_patient_directory() then
    return query
    select r.id, 'treatment'::text, r.patient_id, null::uuid, pe.given_name, pe.family_name,
           r.purpose, r.occurred_on, r.recorded_at, r.platform_access_kind, r.representative_name
    from public.patient_privacy_records r
    join public.patients p on p.id = r.patient_id
    join public.persons pe on pe.id = p.person_id
    where r.organization_id = v_org
      and r.source = 'platform'
      and r.record_kind = 'consent_withdrawn'
      and r.recorded_at > now() - make_interval(days => app.platform_withdrawal_notice_days())
    order by r.recorded_at desc, r.id;
  end if;
end;
$$;

revoke all on function public.list_platform_consent_withdrawals() from public, anon;
grant execute on function public.list_platform_consent_withdrawals() to authenticated;

comment on function public.list_platform_consent_withdrawals() is
  'POR-016 (ANN-263): Widerrufe ueber die Plattform der letzten 14 Tage fuer Offene Punkte - Behandlung fuer die Rollen der Kartei. Ohne Recht keine Zeile.';
