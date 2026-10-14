-- =============================================================================
-- E-001: Einsicht der Praxisinhaber:in in die Plattform einer Person
-- (Befund B11, BEF-161; DSN-001 D7; ADR-023 Punkt 24 letzter Satz, Fassung 5)
--
-- Jannes: "Ueber meinen Zugang will ich das Patienten- und Kundenportal
-- einsehen, so wie die Person es sieht. Nur lesen, kein Anmelden als die
-- Person, nichts darf in ihrem Namen geschehen."
--
-- Der Weg ist ein Verteiler mit fester Liste, kein zweites Konto und kein
-- Token der Person:
--
--   public.platform_preview(p_access_id, p_function, p_args)
--     prueft Anmeldung, Rolle owner, offene Sitzung und den Zugang (eigene
--     Organisation, eigener Zugang der Person, aktiv), schreibt den
--     Lesezugriff wie beim Oeffnen der Akte (patient_record.viewed bzw.
--     training_relationship.viewed ueber app.log_record_access, hoechstens
--     einmal je Person, Akte und Tag; ADR-010 Punkt 16, keine neue Aktion),
--     schaltet die Transaktion auf nur lesend, setzt transaktionslokal
--     app.platform_preview_access
--     und ruft genau eine Projektion aus app.platform_preview_functions() -
--     mit festem Aufruf je Name, ohne dynamisches SQL.
--
--   app.platform_preview_grant(p_access_id)
--     die Freigabe im Waechter: nur wenn die Einstellung genau diese Kennung
--     traegt und der Aufrufer owner derselben Organisation ist, der Zugang
--     eigener und aktiv, die Sitzung offen. Gibt sie frei, ist die
--     Transaktion ab da nur lesend.
--
--   app.platform_readable_access, app.platform_own_access_after_reading
--     neue Fassungen mit der Freigabe als zweitem Weg neben der Person selbst.
--     Lesefrist, Zustand und Sitzung gelten fuer beide gleich. Die
--     Faehigkeiten (app.platform_access_allows, app.platform_access_writable)
--     bleiben, wie sie sind: Die Einsicht zeigt can_write, can_answer und Co.
--     so, wie die Person sie hat; geschrieben wird trotzdem nichts, weil die
--     Transaktion nur lesend ist.
--
-- Nicht in der Liste: jeder Schreibweg, platform_export (schreibt ins
-- Protokoll), issue_platform_file_link und issue_platform_message_attachment_link
-- (schreiben Freigaben), platform_notification_settings (Geraet der Person;
-- ANN-344: die Praxis sieht die Wahl nicht).
--
-- Eine Ausnahme im Ergebnis: Die Uebungstage aus platform_exercise_plans
-- (ANN-307, nur die Person und die Auskunft) kommen in der Einsicht leer.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die feste Liste
-- -----------------------------------------------------------------------------
create function app.platform_preview_functions()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'platform_context',
    'platform_onboarding',
    'platform_appointments',
    'platform_appointment_requests',
    'platform_questionnaire',
    'platform_invoices',
    'platform_invoice',
    'platform_files',
    'platform_consents',
    'platform_representatives',
    'platform_aftercare',
    'platform_training_offer',
    'platform_training_contract',
    'platform_training_packages',
    'platform_training_offers',
    'platform_exercise_plans',
    'platform_messages',
    'platform_checkins',
    'platform_habits'
  ]::text[]
$$;

comment on function app.platform_preview_functions() is
  'E-001: die lesenden Projektionen, die public.platform_preview aufruft (DSN-001 D7). Nichts Schreibendes, kein Export, keine Datei- oder Anhangverweise.';

revoke all on function app.platform_preview_functions() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Die Freigabe der Einsicht im Waechter
-- -----------------------------------------------------------------------------
create function app.platform_preview_grant(p_access_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  -- Nur innerhalb von public.platform_preview gesetzt, transaktionslokal; eine
  -- Kennung aus dem Browser kommt hier nie an.
  if p_access_id is null
     or coalesce(current_setting('app.platform_preview_access', true), '') <> p_access_id::text then
    return false;
  end if;
  -- Dieselben Bedingungen wie beim Eintritt in die Einsicht: owner mit offener
  -- Sitzung (has_any_role prueft is_active und app.session_open()), der eigene
  -- aktive Zugang der Person in der eigenen Organisation.
  if not app.has_any_role('owner') then
    return false;
  end if;
  if not exists (
    select 1
    from public.platform_accesses a
    where a.id = p_access_id
      and a.organization_id = app.current_organization_id()
      and a.access_kind = 'self'
      and a.status = 'active'
      and a.account_user_id is not null
  ) then
    return false;
  end if;
  -- ANN-529: Was die Einsicht freigibt, wird nur gelesen. Ab hier kann diese
  -- Transaktion nichts mehr schreiben (SQLSTATE 25006) - keinen Schreibweg der
  -- Person, auch keinen, der nur das Recht 'read' verlangt, und keinen
  -- kuenftigen.
  perform pg_catalog.set_config('transaction_read_only', 'on', true);
  return true;
end;
$$;

comment on function app.platform_preview_grant(uuid) is
  'E-001: Gibt die Einsicht der Praxisinhaber:in fuer genau diesen Zugang frei - nur innerhalb von public.platform_preview (Einstellung app.platform_preview_access), nur owner der Organisation, nur der eigene aktive Zugang der Person. Schaltet die Transaktion dabei auf nur lesend.';

revoke all on function app.platform_preview_grant(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Der Waechter: neue Fassung (aus 20261012100000_sec_001_sitzungssperre.sql)
-- -----------------------------------------------------------------------------
create or replace function app.platform_readable_access(p_access_id uuid)
returns table (organization_id uuid, relationship_kind text, relationship_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select a.organization_id, a.relationship_kind, a.relationship_id
  from public.platform_accesses a
  where a.id = p_access_id
    and a.status = 'active'
    and coalesce(app.platform_access_ended_at(a.id) > now(), true)
    and app.session_open()
    and (
      -- Die Person selbst oder ihre Vertretung (ADR-023 Punkt 19), unveraendert.
      (a.account_user_id = auth.uid()
       and not exists (select 1 from public.user_profiles up where up.id = auth.uid()))
      -- E-001: die Einsicht der Praxisinhaber:in, nur innerhalb von
      -- public.platform_preview; die Transaktion ist dann nur lesend.
      or app.platform_preview_grant(a.id)
    )
$$;

-- Nach der Lesefrist bleibt der Person das Widerrufen (D2, ANN-261) - die
-- Einsicht sieht dasselbe. Aus 20261013100000_por_016_platform_consents.sql.
create or replace function app.platform_own_access_after_reading(p_access_id uuid)
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
      and a.access_kind = 'self'
      and a.status = 'active'
      and (a.patient_id is not null or a.training_relationship_id is not null)
      and app.session_open()
      and (
        (a.account_user_id = auth.uid()
         and not exists (select 1 from public.user_profiles up where up.id = auth.uid()))
        or app.platform_preview_grant(a.id)
      )
  ), false)
$$;

-- -----------------------------------------------------------------------------
-- 4. Der Verteiler
-- -----------------------------------------------------------------------------
create function public.platform_preview(
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
    select jsonb_build_array(jsonb_build_object(
             'access_id', a.id,
             'organization_name', o.name,
             'relationship_kind', a.relationship_kind,
             'status', a.status,
             'readable', exists (select 1 from app.platform_readable_access(a.id)),
             'read_until', app.platform_access_ended_at(a.id),
             'access_kind', a.access_kind,
             'represented_name', null,
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

comment on function public.platform_preview(uuid, text, jsonb) is
  'E-001 (DSN-001 D7, ADR-023 Fassung 5): Einsicht der Praxisinhaber:in in die Plattform einer Person, nur lesend. Nur owner, nur der eigene aktive Zugang der Person, feste Liste lesender Projektionen (app.platform_preview_functions), Ergebnis wie fuer die Person ausser den Uebungstagen (ANN-307: nur die Person); protokolliert als patient_record.viewed bzw. training_relationship.viewed (ADR-023 Punkt 24), die Transaktion ist danach nur lesend. Abgewiesen: access.denied mit HTTP 403.';

revoke all on function public.platform_preview(uuid, text, jsonb) from public, anon;
grant execute on function public.platform_preview(uuid, text, jsonb) to authenticated;
