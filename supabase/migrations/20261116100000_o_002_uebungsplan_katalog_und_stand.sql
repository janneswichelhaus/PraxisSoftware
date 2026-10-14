-- =============================================================================
-- O-002 (Befund B9, Auftrag vom 14.10.2026): Uebungsplan - Kataloguebungen beim
-- Hinzufuegen uebernehmen, Stand und Fassung des Plans
--
--   public.add_catalog_exercises_for_plan  gewaehlte Katalogeintraege fuer einen
--                                          Planentwurf in die Bibliothek
--                                          uebernehmen (ANN-536)
--   public.get_exercise_plan               + version_number, updated_at,
--                                          updated_on, updated_by_name,
--                                          follow_up.runs_from
--
-- EINE LISTE STATT KATALOG UND BIBLIOTHEK: Wer einen Plan zusammenstellt,
-- waehlt aus einer Liste - der Bibliothek der Praxis und den Eintraegen des
-- mitgelieferten Katalogs (src/features/exercises/katalog, ANN-382), die ihr
-- noch fehlen. Gewaehlte Katalogeintraege kommen beim Hinzufuegen in die
-- Bibliothek, danach legt die Anwendung wie bisher je Uebung eine Position an
-- (save_exercise_plan_item). Bis O-002 uebernahm nur owner, und immer alles,
-- was einer Vorlage fehlte (ANN-385).
--
-- DERSELBE WEG WIE DER IMPORT (ANN-382, ANN-386): app.import_exercise_catalog_
-- for prueft erst alle Eintraege (app.exercise_catalog_entry), dann schreibt
-- sie; was die Praxis schon hat, bleibt, wie es ist. Die neue Variante traegt
-- keinen Pruefvermerk - sie gilt bis zur Durchsicht durch owner als ungeprueft.
-- Den Inhalt schickt die Anwendung; der Server prueft Form, Werte und Groessen,
-- nicht die Herkunft. Neue Rechte an der Bibliothek entstehen nicht: Aendern,
-- Archivieren, Loeschen und der Pruefvermerk bleiben bei owner (ANN-293).
--
-- KEINE AUSWAHL (ADR-006 Punkt 10): Welche Uebung in den Plan kommt, waehlt die
-- Fachperson. Nichts hier liest Diagnose, Befund, Screening oder Verlauf.
--
-- KEINE NEUE AUDITAKTION (ADR-010 Fassung 3): Wer uebernommen hat, steht als
-- created_by an Uebung und Variante, wer zuletzt am Plan geaendert hat, als
-- updated_by am Plan. Keine neue Tabelle, keine neue Spalte.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Gewaehlte Katalogeintraege fuer einen Planentwurf uebernehmen
--
-- ANN-536: Wer einen Plan des Bereichs schreiben darf
-- (app.can_write_exercise_plans), uebernimmt beim Hinzufuegen die GEWAEHLTEN
-- Katalogeintraege - hoechstens so viele, wie der Entwurf noch fasst (30
-- Positionen). Rolle, Organisation, Bereich und Entwurf prueft derselbe
-- Einstieg wie bei jeder Position (app.exercise_plan_for_write).
--
-- Liefert je Schluessel die Variante der Praxis - neu uebernommen oder schon
-- vorhanden. Heisst schon eine eigene Uebung der Praxis so, wird sie genommen,
-- wenn sie genau eine Variante zur Wahl hat; sonst steht der Eintrag unter
-- conflicts (reason 'name'), ebenso ein vorhandener, aber archivierter
-- (reason 'archived'). Ein ungueltiger Eintrag uebernimmt nichts (22023).
-- -----------------------------------------------------------------------------
create function public.add_catalog_exercises_for_plan(p_plan_id uuid, p_entries jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor      uuid := auth.uid();
  v_plan       public.exercise_plans%rowtype;
  v_frei       integer;
  v_ergebnis   jsonb;
  v_e          jsonb;
  v_schluessel text;
  v_name       text;
  v_variante   uuid;
  v_archiviert boolean;
  v_anzahl     integer;
  v_varianten  jsonb := '{}'::jsonb;
  v_konflikte  jsonb := '[]'::jsonb;
begin
  -- 42501 ohne Schreibrecht in einem Bereich, P0002 fuer einen fremden Plan
  -- oder einen des anderen Bereichs (ADR-021 Punkt 6). Sperrt die Zeile.
  v_plan := app.exercise_plan_for_write(p_plan_id);
  if v_plan.status <> 'draft' then
    raise exception 'exercise plan is not a draft' using errcode = '22023';
  end if;
  perform app.exercise_plan_relationship_open(v_plan);

  if p_entries is null or jsonb_typeof(p_entries) <> 'array'
     or jsonb_array_length(p_entries) = 0 then
    raise exception 'catalog is empty or invalid' using errcode = '22023';
  end if;
  select 30 - count(*) into v_frei
  from public.exercise_plan_items i
  where i.plan_id = v_plan.id;
  if jsonb_array_length(p_entries) > v_frei then
    raise exception 'too many exercises in plan' using errcode = '22023';
  end if;

  -- Erst alles pruefen, dann schreiben; Vorhandenes ueberspringen, nie
  -- ueberschreiben, Namenskonflikte melden (ANN-382).
  v_ergebnis := app.import_exercise_catalog_for(v_plan.organization_id, v_actor, p_entries, false);

  for v_e in select value from jsonb_array_elements(p_entries) loop
    -- Schluessel und Name hat app.exercise_catalog_entry schon geprueft.
    v_schluessel := v_e ->> 'schluessel';
    v_name := btrim(v_e ->> 'name', E' \t\r\n');

    select v.id, (v.archived_at is not null or e.archived_at is not null)
      into v_variante, v_archiviert
    from public.exercise_variants v
    join public.exercises e on e.id = v.exercise_id
    where v.organization_id = v_plan.organization_id
      and v.catalog_key = v_schluessel;

    if found then
      if v_archiviert then
        v_konflikte := v_konflikte || jsonb_build_array(jsonb_build_object(
          'catalog_key', v_schluessel, 'name', v_name, 'reason', 'archived'));
      else
        v_varianten := v_varianten || jsonb_build_object(v_schluessel, v_variante);
      end if;
      continue;
    end if;

    -- Uebersprungen wegen einer gleichnamigen eigenen Uebung: eindeutig ist
    -- sie mit genau einer Variante, die nicht archiviert ist.
    select count(*), (array_agg(v.id))[1]
      into v_anzahl, v_variante
    from public.exercises e
    join public.exercise_variants v on v.exercise_id = e.id
    where e.organization_id = v_plan.organization_id
      and lower(btrim(e.name)) = lower(v_name)
      and e.archived_at is null
      and v.archived_at is null;

    if v_anzahl = 1 then
      v_varianten := v_varianten || jsonb_build_object(v_schluessel, v_variante);
    else
      v_konflikte := v_konflikte || jsonb_build_array(jsonb_build_object(
        'catalog_key', v_schluessel, 'name', v_name, 'reason', 'name'));
    end if;
  end loop;

  return jsonb_build_object(
    'variants', v_varianten,
    'imported', v_ergebnis -> 'imported',
    'conflicts', v_konflikte
  );
end;
$$;

revoke all on function public.add_catalog_exercises_for_plan(uuid, jsonb) from public, anon;
grant execute on function public.add_catalog_exercises_for_plan(uuid, jsonb) to authenticated;

comment on function public.add_catalog_exercises_for_plan(uuid, jsonb) is
  'O-002 (ANN-536): uebernimmt die gewaehlten Katalogeintraege fuer einen Planentwurf in die Bibliothek der Praxis - nur nach app.can_write_exercise_plans(Bereich des Plans), Plan im Entwurf, hoechstens so viele, wie er noch fasst (30). Derselbe Pruef- und Schreibweg wie public.import_exercise_catalog: ungeprueft bis zur Durchsicht durch owner (ANN-386), nie ueberschreiben. Liefert variants (Schluessel -> Variante der Praxis), imported und conflicts (name, archived). Keine neue Auditaktion: created_by steht an der Zeile.';

-- -----------------------------------------------------------------------------
-- 2. Stand und Fassung am Plan
--
-- Aus 20261019110000_ueb_010_exercise_sessions.sql (juengste Fassung); neu
-- sind version_number (die Stelle in der Kette ueber previous_plan_id, 1 =
-- erste Fassung), updated_at, updated_on (der Tag in der Zeitzone der Praxis),
-- updated_by_name und runs_from an der Folgefassung. Rechte, Protokoll und die
-- uebrigen Schluessel unveraendert.
-- -----------------------------------------------------------------------------
create or replace function public.get_exercise_plan(p_plan_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_org   uuid;
  v_plan  public.exercise_plans%rowtype;
  v_person record;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not (app.can_read_exercise_plans('therapy') or app.can_read_exercise_plans('training')) then
    perform app.record_denied_read(v_actor, 'exercise_plans.read', 'not allowed to read exercise plans');
    return null;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read exercise plans' using errcode = '42501';
  end if;

  select * into v_plan
  from public.exercise_plans p
  where p.id = p_plan_id and p.organization_id = v_org;
  if not found or not app.can_read_exercise_plans(v_plan.service_area) then
    return null;
  end if;

  perform app.exercise_plan_log_read(v_plan);

  if v_plan.service_area = 'therapy' then
    select pe.given_name, pe.family_name into v_person
    from public.patients pa join public.persons pe on pe.id = pa.person_id
    where pa.id = v_plan.patient_id;
  else
    select pe.given_name, pe.family_name into v_person
    from public.training_relationships t join public.persons pe on pe.id = t.person_id
    where t.id = v_plan.training_relationship_id;
  end if;

  return jsonb_build_object(
    'id', v_plan.id,
    'service_area', v_plan.service_area,
    'relationship_id', coalesce(v_plan.patient_id, v_plan.training_relationship_id),
    'given_name', v_person.given_name,
    'family_name', v_person.family_name,
    'title', v_plan.title,
    'sessions_per_week', v_plan.sessions_per_week,
    'status', v_plan.status,
    'previous_plan_id', v_plan.previous_plan_id,
    'follow_up', (
      select jsonb_build_object('id', f.id, 'status', f.status, 'runs_from', f.runs_from)
      from public.exercise_plans f where f.previous_plan_id = v_plan.id
    ),
    -- O-002: die Stelle in der Kette der Fassungen, 1 = erste. Die Kette
    -- bleibt in der Organisation (Fremdschluessel mit organization_id).
    'version_number', (
      with recursive kette (previous_plan_id, nummer) as (
        select q.previous_plan_id, 1
        from public.exercise_plans q
        where q.id = v_plan.id
        union all
        select q.previous_plan_id, k.nummer + 1
        from kette k
        join public.exercise_plans q on q.id = k.previous_plan_id
        where k.nummer < 1000
      )
      select max(k.nummer) from kette k
    ),
    'assigned_at', v_plan.assigned_at,
    'assigned_by_name', (select up.display_name from public.user_profiles up where up.id = v_plan.assigned_by),
    'runs_from', v_plan.runs_from,
    'runs_until', v_plan.runs_until,
    'original_runs_until', v_plan.original_runs_until,
    'extended_at', v_plan.extended_at,
    'ended_at', v_plan.ended_at,
    'ended_on', (select (v_plan.ended_at at time zone o.time_zone)::date
                 from public.organizations o where o.id = v_org),
    'ended_by_name', (select up.display_name from public.user_profiles up where up.id = v_plan.ended_by),
    'created_at', v_plan.created_at,
    'created_by_name', (select up.display_name from public.user_profiles up where up.id = v_plan.created_by),
    -- O-002: zuletzt geaendert - im Entwurf der Stand der Arbeit.
    'updated_at', v_plan.updated_at,
    'updated_on', (select (v_plan.updated_at at time zone o.time_zone)::date
                   from public.organizations o where o.id = v_org),
    'updated_by_name', (select up.display_name from public.user_profiles up where up.id = v_plan.updated_by),
    'today', app.training_today(v_org),
    'can_write', app.can_write_exercise_plans(v_plan.service_area),
    'review_due', app.exercise_plan_review_due(v_plan),
    'relationship_open', not exists (
      select 1 from public.training_relationships t
      where t.id = v_plan.training_relationship_id and t.contract_ended_on is not null
    ),
    'previous', (
      select jsonb_build_object(
        'id', q.id, 'title', q.title, 'sessions_per_week', q.sessions_per_week,
        'runs_from', q.runs_from, 'runs_until', q.runs_until,
        'items', coalesce((
          select jsonb_agg(app.exercise_plan_item_json(qi) order by qi.position)
          from public.exercise_plan_items qi where qi.plan_id = q.id
        ), '[]'::jsonb)
      )
      from public.exercise_plans q where q.id = v_plan.previous_plan_id
    ),
    'items', coalesce((
      select jsonb_agg(app.exercise_plan_item_json(i) order by i.position)
      from public.exercise_plan_items i where i.plan_id = v_plan.id
    ), '[]'::jsonb),
    -- UEB-010: was die Person an diesem Plan durchgefuehrt hat.
    'sessions', app.exercise_plan_sessions_json(v_plan.id)
  );
end;
$$;

comment on function public.get_exercise_plan(uuid) is
  'UEB-004, O-002: ein Plan mit Positionen und der vorigen Fassung - im Entwurf mit den Bezeichnungen der Bibliothek, nach der Zuweisung mit dem Schnappschuss; dazu die Fassungsnummer aus der Kette und wer zuletzt geaendert hat. Lesen nach app.can_read_exercise_plans(Bereich), protokolliert als Akte geoeffnet (einmal je Tag); andere Rollen: null und access.denied.';
