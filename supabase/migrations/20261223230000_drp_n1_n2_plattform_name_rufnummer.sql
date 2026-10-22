-- =============================================================================
-- DRP-N1, DRP-N2: eigener Name und Rufnummer der Praxis in der
-- Plattformprojektion (Handoff 2026-10-22 "Plattform - Erster Eindruck",
-- Abschnitt 9 "Daten", Entscheidung 3 von Jannes; ADR-023 Punkte 19, 21, 22)
--
--   app.platform_own_name        der eigene Name des Kontos an einem lesbaren
--                                Zugang: die Person selbst aus ihrem
--                                Verhaeltnis, eine Vertretung aus ihrem
--                                Nachweis (ANN-690)
--   app.platform_practice_phone  die Rufnummer der Praxis: die des Absenders
--                                ihrer Rechnungen (ANN-691)
--   public.platform_context      zwei Spalten mehr: own_name, practice_phone
--   public.platform_preview      die Einsicht liefert den Kontext weiter in
--                                derselben Form, wie die Person ihn sieht
--
-- Wofuer: der Gruss mit Namen und die Initialen im Kopf (Schritte 1b, 1e),
-- "Praxis anrufen" an Tuer und Termin (Schritt 1c, Briefing 3). Die Initialen
-- leitet die Oberflaeche aus dem Namen ab (`initialen` in
-- src/components/ui/personenfarben.ts) - eine Regel fuer alle Initialen,
-- keine zweite hier.
--
-- Unveraendert: Der Name der vertretenen Person steht nur an einem lesbaren
-- Vertretungszugang (POR-006), und protokolliert wird genau, was bisher
-- protokolliert wurde - kein neuer Eintrag, keine neue Aktion (ADR-010). Das
-- Lesen der eigenen Daten bleibt unprotokolliert (ADR-023 Punkt 24).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Der eigene Name (DRP-N1)
--
-- ANN-690: Die Person selbst heisst so, wie ihr Verhaeltnis sie fuehrt (Vor-
-- und Nachname); eine Vertretung so, wie der Nachweis ihres Zugangs sie nennt
-- (`representative_name`, ANN-203) - nie wie die vertretene Person. Nur an
-- einem lesbaren Zugang: gesperrt, nach der Lesefrist, in gesperrter Sitzung
-- und fuer jedes fremde Konto bleibt er leer. Geprueft wird hier, damit jeder
-- Aufrufer dieselbe Regel bekommt.
-- -----------------------------------------------------------------------------
create function app.platform_own_name(p_access_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case a.access_kind
           when 'self' then (
             select concat_ws(' ', p.given_name, p.family_name)
             from app.platform_relationship(a.relationship_kind, a.relationship_id) r
             join public.persons p on p.id = r.person_id
           )
           else a.representative_name
         end
  from public.platform_accesses a
  where a.id = p_access_id
    and exists (select 1 from app.platform_readable_access(a.id))
$$;

revoke all on function app.platform_own_name(uuid) from public, anon, authenticated;

comment on function app.platform_own_name(uuid) is
  'DRP-N1 (ANN-690): der eigene Name des Kontos an einem lesbaren Zugang, fuer Gruss und Initialen der Plattform. Person selbst: Vor- und Nachname aus ihrem Verhaeltnis; Vertretung: representative_name aus dem Nachweis, nie der Name der vertretenen Person. Sonst null.';

-- -----------------------------------------------------------------------------
-- 2. Die Rufnummer der Praxis (DRP-N2)
--
-- ANN-691: Auf der Plattform steht die Nummer, die die Praxis als Absender
-- ihrer Rechnungen fuehrt (practice_billing_profiles.phone, ABR-000) - dieselbe,
-- die jede Rechnung an die Person schon traegt. Keine zweite Nummer, keine
-- neue Spalte. Ohne Absender oder ohne Nummer: null, dann bietet die Plattform
-- keinen Anruf an.
-- -----------------------------------------------------------------------------
create function app.platform_practice_phone(p_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select b.phone
  from public.practice_billing_profiles b
  where b.organization_id = p_organization_id
$$;

revoke all on function app.platform_practice_phone(uuid) from public, anon, authenticated;

comment on function app.platform_practice_phone(uuid) is
  'DRP-N2 (ANN-691): die Rufnummer der Praxis fuer die Plattform ("Praxis anrufen"), aus dem Absender der Rechnungen. Ohne Absender oder Nummer null. Enthaelt keine Daten einer Person.';

-- -----------------------------------------------------------------------------
-- 3. platform_context mit eigenem Namen und Rufnummer der Praxis
--
-- Neue Fassung aus 20261002101000_por_006_acting_for.sql; neu sind nur die
-- beiden letzten Spalten. Die Rufnummer gehoert wie der Praxisname zur Praxis,
-- nicht zur Person: Sie steht auch an einem gesperrten Zugang und nach der
-- Lesefrist, denn gerade dann braucht die Person die Praxis ("Zugang beendet
-- oder gesperrt", Handoff 5.2). Der eigene Name steht nur, wo der Zugang
-- lesbar ist (app.platform_own_name).
-- -----------------------------------------------------------------------------
drop function public.platform_context();

create function public.platform_context()
returns table (
  access_id         uuid,
  organization_name text,
  relationship_kind text,
  status            text,
  readable          boolean,
  read_until        timestamptz,
  access_kind       text,
  represented_name  text,
  own_name          text,
  practice_phone    text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zeile record;
begin
  if auth.uid() is null
     or exists (select 1 from public.user_profiles up where up.id = auth.uid()) then
    return;
  end if;

  for v_zeile in
    select a.id, o.name, a.organization_id, a.relationship_kind, a.status, a.access_kind,
           exists (select 1 from app.platform_readable_access(a.id)) as lesbar,
           app.platform_access_ended_at(a.id) as bis,
           a.relationship_id, a.created_at
    from public.platform_accesses a
    join public.organizations o on o.id = a.organization_id
    where a.account_user_id = auth.uid()
      and a.status in ('active', 'locked')
    -- Die eigenen Bereiche zuerst, dann die Vertretungen.
    order by (a.access_kind <> 'self'), a.relationship_kind desc, a.created_at
  loop
    access_id := v_zeile.id;
    organization_name := v_zeile.name;
    relationship_kind := v_zeile.relationship_kind;
    status := v_zeile.status;
    readable := v_zeile.lesbar;
    read_until := v_zeile.bis;
    access_kind := v_zeile.access_kind;
    represented_name := null;
    own_name := app.platform_own_name(v_zeile.id);
    practice_phone := app.platform_practice_phone(v_zeile.organization_id);

    if v_zeile.access_kind <> 'self' and v_zeile.lesbar then
      select concat_ws(' ', p.given_name, p.family_name) into represented_name
      from app.platform_relationship(v_zeile.relationship_kind, v_zeile.relationship_id) r
      join public.persons p on p.id = r.person_id;

      perform app.log_platform_representation(
        v_zeile.id, 'platform_representation.read', jsonb_build_object('view', 'context')
      );
    end if;

    return next;
  end loop;
end;
$$;

revoke all on function public.platform_context() from public, anon;
grant execute on function public.platform_context() to authenticated;

comment on function public.platform_context() is
  'POR-004/POR-006/DRP-N1/DRP-N2: Plattformprojektion fuer das Geruest (DSN-001 Abschnitt 3, D6): Praxisname und Rufnummer der Praxis (ANN-691), eigene Zugaenge und Vertretungen mit Art, an einem lesbaren Zugang der eigene Name (ANN-690). Bei einer lesbaren Vertretung der Name der vertretenen Person ("Sie handeln fuer ...", ADR-023 Punkt 14) und ein Auditeintrag (Punkt 24, ANN-209). Eigenes Lesen wird nicht protokolliert.';

-- -----------------------------------------------------------------------------
-- 4. Der Verteiler der Einsicht: neue Fassung (aus
--    20261113100000_e_001_plattform_einsicht.sql)
--
-- Geaendert ist nur der Zweig 'platform_context': Er liefert eigenen Namen und
-- Rufnummer aus denselben Funktionen wie fuer die Person, damit die Einsicht
-- zeigt, was die Person sieht (DSN-001 D7). Alles andere ist wortgleich.
-- -----------------------------------------------------------------------------
create or replace function public.platform_preview(
  p_access_id uuid,
  p_function  text,
  p_args      jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor    uuid := auth.uid();
  v_zugang   public.platform_accesses%rowtype;
  v_rechnung uuid;
  v_ergebnis jsonb;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- ANN-525: Die Einsicht hat nur owner ("ueber meinen Zugang"). Abgewiesen
  -- wird wie jeder Lesepfad: access.denied mit HTTP 403; ohne Organisation
  -- (Plattformkonto, gesperrte Sitzung) mit 42501 und ohne Eintrag.
  if not app.has_any_role('owner') then
    perform app.record_denied_write(v_actor, 'platform_preview.read',
                                    'not allowed to preview the platform');
    return null;
  end if;

  -- Erst die Rolle, dann die Eingabe (ADR-023 Punkt 21): nur die feste Liste.
  if p_function is null or not (p_function = any (app.platform_preview_functions())) then
    perform app.record_denied_write(v_actor, 'platform_preview.read',
                                    'function not allowed in the preview');
    return null;
  end if;

  -- ANN-526: nur der eigene, aktive Zugang der Person in der eigenen
  -- Organisation. Fremd, eingeladen, gesperrt, entzogen und jede Vertretung
  -- antworten gleich.
  select a.* into v_zugang
  from public.platform_accesses a
  where a.id = p_access_id
    and a.organization_id = app.current_organization_id()
    and a.access_kind = 'self'
    and a.status = 'active'
    and a.account_user_id is not null;
  if not found then
    perform app.record_denied_write(v_actor, 'platform_preview.read',
                                    'platform access not available for the preview');
    return null;
  end if;

  -- Die Werte aus p_args typisiert und vor dem Protokoll; nur bekannte Namen.
  if p_args is not null and jsonb_typeof(p_args) <> 'object' then
    raise exception 'invalid preview arguments' using errcode = '22023';
  end if;
  if p_function = 'platform_invoice' then
    v_rechnung := (p_args ->> 'p_invoice_id')::uuid;
  end if;

  -- ADR-023 Punkt 24 letzter Satz: protokolliert wie ein Lesezugriff auf die
  -- Akte - dieselbe Aktion, hoechstens einmal je Person, Akte und Tag.
  perform app.log_record_access(
    v_zugang.organization_id, v_actor,
    case v_zugang.relationship_kind
      when 'treatment' then 'patient_record.viewed' else 'training_relationship.viewed' end,
    case v_zugang.relationship_kind
      when 'treatment' then 'patient' else 'training_relationship' end,
    v_zugang.relationship_id, 'user',
    jsonb_build_object('surface', 'web', 'view', 'platform_preview')
  );

  -- Ab hier nur lesend (wie app.platform_preview_grant), dann die Einsicht fuer
  -- genau diesen Zugang.
  perform pg_catalog.set_config('transaction_read_only', 'on', true);
  perform pg_catalog.set_config('app.platform_preview_access', v_zugang.id::text, true);

  if p_function = 'platform_context' then
    -- Dieselbe Form wie ein Eintrag aus public.platform_context(); dazu fuer
    -- die Leiste der Einsicht und den Rueckweg in die Praxis die Kennung des
    -- Verhaeltnisses und der Name der Person - beides sieht owner in der Akte.
    -- DRP-N1, DRP-N2: eigener Name und Rufnummer aus denselben Funktionen wie
    -- in public.platform_context().
    select jsonb_build_array(jsonb_build_object(
             'access_id', a.id,
             'organization_name', o.name,
             'relationship_kind', a.relationship_kind,
             'status', a.status,
             'readable', exists (select 1 from app.platform_readable_access(a.id)),
             'read_until', app.platform_access_ended_at(a.id),
             'access_kind', a.access_kind,
             'represented_name', null,
             'own_name', app.platform_own_name(a.id),
             'practice_phone', app.platform_practice_phone(a.organization_id),
             'relationship_id', a.relationship_id,
             'person_name', (
               select concat_ws(' ', p.given_name, p.family_name)
               from app.platform_relationship(a.relationship_kind, a.relationship_id) r
               join public.persons p on p.id = r.person_id
             )
           ))
      into v_ergebnis
    from public.platform_accesses a
    join public.organizations o on o.id = a.organization_id
    where a.id = v_zugang.id;
  elsif p_function = 'platform_onboarding' then
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_ergebnis
    from public.platform_onboarding(v_zugang.id) t;
  elsif p_function = 'platform_appointments' then
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_ergebnis
    from public.platform_appointments(v_zugang.id) t;
  elsif p_function = 'platform_appointment_requests' then
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_ergebnis
    from public.platform_appointment_requests(v_zugang.id) t;
  elsif p_function = 'platform_questionnaire' then
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_ergebnis
    from public.platform_questionnaire(v_zugang.id) t;
  elsif p_function = 'platform_invoices' then
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_ergebnis
    from public.platform_invoices(v_zugang.id) t;
  elsif p_function = 'platform_invoice' then
    v_ergebnis := public.platform_invoice(v_zugang.id, v_rechnung);
  elsif p_function = 'platform_files' then
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_ergebnis
    from public.platform_files(v_zugang.id) t;
  elsif p_function = 'platform_consents' then
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_ergebnis
    from public.platform_consents(v_zugang.id) t;
  elsif p_function = 'platform_representatives' then
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_ergebnis
    from public.platform_representatives(v_zugang.id) t;
  elsif p_function = 'platform_aftercare' then
    v_ergebnis := public.platform_aftercare(v_zugang.id);
  elsif p_function = 'platform_training_offer' then
    v_ergebnis := public.platform_training_offer(v_zugang.id);
  elsif p_function = 'platform_training_contract' then
    v_ergebnis := public.platform_training_contract(v_zugang.id);
  elsif p_function = 'platform_training_packages' then
    v_ergebnis := public.platform_training_packages(v_zugang.id);
  elsif p_function = 'platform_training_offers' then
    v_ergebnis := public.platform_training_offers(v_zugang.id);
  elsif p_function = 'platform_exercise_plans' then
    v_ergebnis := public.platform_exercise_plans(v_zugang.id);
    -- ANN-307 (Jannes): Die Uebungstage waehlt die Person fuer sich; die
    -- Praxis liest sie nicht (public.exercise_plan_days ohne Policy), nur die
    -- Auskunft nach Art. 15 nennt sie. Auch die Einsicht bekommt je Plan eine
    -- leere Liste - die einzige Stelle, an der sie von der Sicht der Person
    -- abweicht.
    if jsonb_typeof(v_ergebnis -> 'plans') = 'array' then
      v_ergebnis := jsonb_set(v_ergebnis, '{plans}', coalesce((
        select jsonb_agg(p.plan || jsonb_build_object('weekdays', '[]'::jsonb) order by p.nr)
        from jsonb_array_elements(v_ergebnis -> 'plans') with ordinality as p(plan, nr)
      ), '[]'::jsonb));
    end if;
  elsif p_function = 'platform_messages' then
    v_ergebnis := public.platform_messages(v_zugang.id);
  elsif p_function = 'platform_checkins' then
    v_ergebnis := public.platform_checkins(v_zugang.id);
  elsif p_function = 'platform_habits' then
    v_ergebnis := public.platform_habits(v_zugang.id);
  else
    -- Die Liste und die Zweige laufen nie auseinander (Test); sonst lieber ab.
    raise exception 'preview function without branch: %', p_function using errcode = 'XX000';
  end if;

  perform pg_catalog.set_config('app.platform_preview_access', '', true);
  return v_ergebnis;
end;
$$;
