-- =============================================================================
-- ORG-006 Rückmeldungen von Beschäftigten: monatliches Barometer und
-- „Rückmeldung an die Praxisleitung“ (PROJECT_PRINCIPLES.md §20.2, Pfad A)
--
-- Beschäftigte (jede Praxisrolle mit Mitarbeiterdatensatz außer owner) geben
-- je Abgabe MIT oder OHNE Namen ab. Ohne Namen steht keine Person, kein Konto
-- und keine genauere Zeit als der Monat an der Zeile: kein Zeitstempel, keine
-- fortlaufende Nummer (die Kennung ist zufällig, gen_random_uuid ist v4).
-- Die Teilnahme am Barometer ist eine eigene Marke (Person, Monat) ohne
-- Zeitstempel und ohne gemeinsame Sequenz mit den Antworten; sie liest nur
-- die Person selbst - damit der Hinweis verschwindet und niemand doppelt
-- abgibt (ANN-607).
--
-- Lesen nur owner (§20.2 Nr. 3): namentliche Rückmeldungen einzeln (Name,
-- Monat, Inhalt), anonyme nur als Praxissumme und gemischte Freitexte - und
-- erst, wenn mindestens drei Beschäftigte teilnehmen können und fünf anonyme
-- Antworten im Zeitraum liegen; sonst „noch zu wenige Antworten“. Die Schwelle
-- steht hier, nicht im Client (ANN-607). Kein Verlauf je Person, keine Liste,
-- wer (nicht) teilgenommen hat, keine Zählung je Person.
--
-- Nur über SECURITY-DEFINER-Funktionen, kein Tabellenrecht (ADR-004). KEIN
-- Auditeintrag (ADR-010 Punkt 17: neue Protokollierung nur mit Freigabe);
-- auch der Löschlauf nennt die Rückmeldungen nicht in seiner Zusammenfassung.
-- Freitext steht nie in einer Fehlermeldung: Alles wird vor dem Schreiben
-- geprüft, damit keine Prüfregel der Tabelle mit der Zeile im Detail
-- antwortet (ADR-011).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Wer gibt Rückmeldung, wer liest sie
-- -----------------------------------------------------------------------------
-- Rückmeldung gibt jede Praxisrolle mit Mitarbeiterdatensatz - außer owner:
-- Die Praxisleitung liest, sie nimmt nicht teil (§20.2, ANN-607). Wer owner
-- und zugleich therapist ist, bleibt owner.
create function app.can_give_staff_feedback()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('team_lead', 'office', 'therapist', 'trainer')
     and not app.has_any_role('owner')
$$;

create function app.can_read_staff_feedback()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner')
$$;

revoke all on function app.can_give_staff_feedback() from public, anon, authenticated;
revoke all on function app.can_read_staff_feedback() from public, anon, authenticated;

comment on function app.can_give_staff_feedback() is
  'ORG-006 (§20.2, ANN-607): Wer Rückmeldung gibt - jede Praxisrolle mit Mitarbeiterdatensatz außer owner. Die eine Stelle für die Regel.';
comment on function app.can_read_staff_feedback() is
  'ORG-006 (§20.2 Nr. 3): Wer Rückmeldungen liest - allein owner; Teamleitung und Büro nicht. Die eine Stelle für die Regel.';

-- Der Monat der Praxis (erster Tag), in dem gerade abgegeben wird.
create function app.staff_feedback_month(p_org uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select date_trunc('month', now() at time zone o.time_zone)::date
  from public.organizations o
  where o.id = p_org
$$;

revoke all on function app.staff_feedback_month(uuid) from public, anon, authenticated;

-- Wie viele Beschäftigte teilnehmen können: aktive Mitarbeitende mit aktivem
-- Konto und einer Praxisrolle, ohne owner. Nur die Zahl, nie die Personen.
create function app.staff_feedback_eligible_count(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct sm.id)::integer
  from public.staff_members sm
  join public.user_profiles up
    on up.person_id = sm.person_id and up.organization_id = sm.organization_id and up.is_active
  where sm.organization_id = p_org
    and sm.employment_status = 'active'
    and exists (
      select 1 from public.user_roles ur
      where ur.user_id = up.id and ur.organization_id = p_org
        and ur.role_key in ('team_lead', 'office', 'therapist', 'trainer'))
    and not exists (
      select 1 from public.user_roles ur
      where ur.user_id = up.id and ur.organization_id = p_org and ur.role_key = 'owner')
$$;

revoke all on function app.staff_feedback_eligible_count(uuid) from public, anon, authenticated;

comment on function app.staff_feedback_eligible_count(uuid) is
  'ORG-006 (§20.2 Nr. 4, ANN-607): Zahl der Beschäftigten, die teilnehmen können - aktiv, mit aktivem Konto und Praxisrolle, ohne owner. Liefert nie Personen.';

-- -----------------------------------------------------------------------------
-- 2. Die Tabellen
-- -----------------------------------------------------------------------------
create table public.staff_feedback (
  -- Zufällig (UUID v4), nie fortlaufend: Aus der Kennung folgt keine
  -- Reihenfolge der Abgaben.
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  kind            text not null check (kind in ('barometer', 'message')),
  -- Der Monat der Abgabe (erster Tag) - die einzige Zeitangabe einer anonymen
  -- Rückmeldung.
  month           date not null check (extract(day from month) = 1),
  -- Nur MIT Namen: die Person und der Zeitpunkt (nur für die Reihenfolge der
  -- namentlichen Liste). Ohne Namen beide leer.
  staff_member_id uuid references public.staff_members (id) on delete cascade,
  submitted_at    timestamptz,
  -- Barometer: drei Skalen 1-9, alle freiwillig, und zwei Freitexte.
  mood            smallint check (mood between 1 and 9),
  tours           smallint check (tours between 1 and 9),
  team            smallint check (team between 1 and 9),
  easier_text     text check (easier_text is null or length(easier_text) between 1 and 2000),
  more_text       text check (more_text is null or length(more_text) between 1 and 2000),
  -- Rückmeldung an die Praxisleitung: ein Freitext.
  message_text    text check (message_text is null or length(message_text) between 1 and 2000),
  constraint staff_feedback_named check ((staff_member_id is null) = (submitted_at is null)),
  constraint staff_feedback_kind check (
    (kind = 'barometer' and message_text is null
     and num_nonnulls(mood, tours, team, easier_text, more_text) > 0)
    or (kind = 'message' and message_text is not null
        and num_nonnulls(mood, tours, team, easier_text, more_text) = 0)
  )
);

comment on table public.staff_feedback is
  'ORG-006 (§20.2, ANN-607, ANN-608): Rückmeldungen von Beschäftigten - Barometer (drei Skalen 1-9, zwei Freitexte) und Rückmeldung an die Praxisleitung. Mit Namen: Person und Zeitpunkt; ohne Namen: nur Organisation und Monat, keine Person, kein Konto, keine Uhrzeit, zufällige Kennung. Liest allein owner über public.list_staff_feedback_named und public.get_staff_feedback_summary (Schwelle 3/5). Datenklasse rueckmeldung: zwölf Monate ab Ende des Monats der Abgabe, endgültig gelöscht (ADR-008 Fassung 4). Kein Tabellenrecht, kein Auditeintrag.';

create index staff_feedback_org_month_idx on public.staff_feedback (organization_id, month);
-- Ein namentliches Barometer je Person und Monat (die Marke unten gilt für beide).
create unique index staff_feedback_one_named_barometer
  on public.staff_feedback (staff_member_id, month)
  where kind = 'barometer' and staff_member_id is not null;

revoke all on public.staff_feedback from anon, authenticated;
alter table public.staff_feedback enable row level security;

-- Die Teilnahme am Barometer: Person und Monat - sonst nichts. Kein
-- Zeitstempel, keine Sequenz, kein Bezug zur Antwort.
create table public.staff_feedback_participations (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  staff_member_id uuid not null references public.staff_members (id) on delete cascade,
  month           date not null check (extract(day from month) = 1),
  unique (staff_member_id, month)
);

comment on table public.staff_feedback_participations is
  'ORG-006 (ANN-607): Teilnahme am Barometer je Person und Monat - nur damit der Hinweis verschwindet und niemand doppelt abgibt. Ohne Zeitstempel und ohne Bezug zur Antwort; liest nur die Person selbst (public.get_my_staff_feedback_status). Datenklasse rueckmeldung_teilnahme: fällt nach dem Monat im nächsten Lauf, ohne Journal (die Regel hängt am Monat allein und greift nach einem Restore ebenso). Kein Tabellenrecht.';

revoke all on public.staff_feedback_participations from anon, authenticated;
alter table public.staff_feedback_participations enable row level security;

-- Die geschlossenen Zeiträume der Praxissumme (Zweitreview ORG-006, Befund 2):
-- feste, nicht überlappende Monatsblöcke je Art. Ein Block wird geschlossen,
-- sobald er fünf anonyme Antworten hat, und ändert sich danach nie - sonst
-- ließe sich aus zwei überlappenden Zeiträumen ein einzelner Monat
-- herausrechnen. Ohne Personenbezug; fällt mit den Rückmeldungen.
create table public.staff_feedback_blocks (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  kind            text not null check (kind in ('barometer', 'message')),
  from_month      date not null check (extract(day from from_month) = 1),
  to_month        date not null check (extract(day from to_month) = 1),
  unique (organization_id, kind, from_month),
  check (to_month >= from_month)
);

comment on table public.staff_feedback_blocks is
  'ORG-006 (§20.2 Nr. 4, ANN-607): geschlossene, nicht überlappende Zeiträume der Praxissumme je Art - ein Block hat mindestens fünf anonyme Antworten und ändert sich nie. Keine Person, keine Antwort. Wird mit den Rückmeldungen nach zwölf Monaten gelöscht. Kein Tabellenrecht.';

revoke all on public.staff_feedback_blocks from anon, authenticated;
alter table public.staff_feedback_blocks enable row level security;

-- -----------------------------------------------------------------------------
-- 3. Datenklassen und Fristen (ADR-008 Fassung 4, ANN-607)
-- -----------------------------------------------------------------------------
insert into public.retention_classes
  (key, basis, legal_reference, anchor, retention_interval, assumption_key, note, sort_order)
values
  ('rueckmeldung', 'intern', null, 'event_time', interval '12 months', 'ANN-607',
   'Rückmeldungen von Beschäftigten (§20.2): Barometer und Rückmeldung an die Praxisleitung, mit und ohne Namen. Zwölf Monate ab Ende des Monats der Abgabe, dann endgültig gelöscht - kein Soft-Delete (ADR-008 Fassung 4).',
   101),
  ('rueckmeldung_teilnahme', 'intern', null, 'event_time', interval '1 day', 'ANN-607',
   'Teilnahme am Barometer je Person und Monat: nur, damit der Hinweis verschwindet und niemand doppelt abgibt. Fällt einen Tag nach Ende des Monats.',
   102);

insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values
  ('staff_feedback', 'rueckmeldung', 'automatisch',
   'Rückmeldungen von Beschäftigten (ORG-006): zwölf Monate ab Ende des Monats der Abgabe, endgültig gelöscht, mit Eintrag im Löschjournal (ANN-607).',
   237),
  ('staff_feedback_participations', 'rueckmeldung_teilnahme', 'automatisch',
   'Teilnahme am Barometer (ORG-006): fällt nach ihrem Monat im nächsten Lauf; ohne Journal, damit keine Zahl der Teilnehmenden je Monat entsteht (ANN-607).',
   238);

-- -----------------------------------------------------------------------------
-- 4. Abgeben
-- -----------------------------------------------------------------------------
-- Gemeinsamer Einstieg: angemeldet, darf, Organisation, eigener aktiver
-- Mitarbeiterdatensatz - sonst 42501 ohne Unterschied.
create function app.staff_feedback_giver(out o_org uuid, out o_staff uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  o_org := app.staff_request_org(app.can_give_staff_feedback(), 'not allowed to give staff feedback');
  select sm.id into o_staff
  from public.staff_members sm
  where sm.id = app.own_staff_member(o_org) and sm.employment_status = 'active';
  if o_staff is null then
    raise exception 'not allowed to give staff feedback' using errcode = '42501';
  end if;
end;
$$;

revoke all on function app.staff_feedback_giver() from public, anon, authenticated;

-- Ein Freitext: getrimmt, leer heißt keiner. Die Länge wird hier geprüft, damit
-- nie eine Prüfregel der Tabelle mit dem Text im Detail antwortet (ADR-011).
create function app.staff_feedback_text(p_text text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
begin
  if v_text is not null and length(v_text) > 2000 then
    raise exception 'text is too long' using errcode = '22023';
  end if;
  return v_text;
end;
$$;

revoke all on function app.staff_feedback_text(text) from public, anon, authenticated;

-- Das Barometer des laufenden Monats, einmal je Person und Monat.
create function public.submit_staff_barometer(
  p_named boolean, p_mood integer, p_tours integer, p_team integer,
  p_easier text, p_more text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wer    record;
  v_monat  date;
  v_easier text;
  v_more   text;
begin
  select * into v_wer from app.staff_feedback_giver();
  if p_named is null then
    raise exception 'choose with or without name' using errcode = '22023';
  end if;
  if (p_mood is not null and p_mood not between 1 and 9)
     or (p_tours is not null and p_tours not between 1 and 9)
     or (p_team is not null and p_team not between 1 and 9) then
    raise exception 'scale value out of range' using errcode = '22023';
  end if;
  v_easier := app.staff_feedback_text(p_easier);
  v_more := app.staff_feedback_text(p_more);
  if num_nonnulls(p_mood, p_tours, p_team, v_easier, v_more) = 0 then
    raise exception 'feedback is empty' using errcode = '22023';
  end if;
  v_monat := app.staff_feedback_month(v_wer.o_org);

  -- Erst die Marke: Gibt es sie schon, endet hier alles (auch bei zwei
  -- gleichzeitigen Abgaben - die zweite wartet auf die erste).
  insert into public.staff_feedback_participations (organization_id, staff_member_id, month)
  values (v_wer.o_org, v_wer.o_staff, v_monat)
  on conflict (staff_member_id, month) do nothing;
  if not found then
    raise exception 'barometer already submitted' using errcode = '23505';
  end if;

  insert into public.staff_feedback (
    organization_id, kind, month, staff_member_id, submitted_at,
    mood, tours, team, easier_text, more_text
  )
  values (
    v_wer.o_org, 'barometer', v_monat,
    case when p_named then v_wer.o_staff end,
    case when p_named then now() end,
    p_mood, p_tours, p_team, v_easier, v_more
  );

  return jsonb_build_object('month', v_monat, 'named', p_named);
end;
$$;

revoke all on function public.submit_staff_barometer(boolean, integer, integer, integer, text, text) from public, anon;
grant execute on function public.submit_staff_barometer(boolean, integer, integer, integer, text, text) to authenticated;

comment on function public.submit_staff_barometer(boolean, integer, integer, integer, text, text) is
  'ORG-006 (ANN-607): das Barometer des laufenden Monats abgeben - einmal je Person und Monat, mit oder ohne Namen; nie owner. Ohne Namen ohne Person und Zeitpunkt. Kein Auditeintrag.';

-- Die Rückmeldung an die Praxisleitung: jederzeit, ein Freitext.
create function public.submit_staff_feedback_message(p_named boolean, p_text text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wer   record;
  v_monat date;
  v_text  text;
begin
  select * into v_wer from app.staff_feedback_giver();
  if p_named is null then
    raise exception 'choose with or without name' using errcode = '22023';
  end if;
  v_text := app.staff_feedback_text(p_text);
  if v_text is null then
    raise exception 'feedback is empty' using errcode = '22023';
  end if;
  v_monat := app.staff_feedback_month(v_wer.o_org);

  insert into public.staff_feedback (
    organization_id, kind, month, staff_member_id, submitted_at, message_text
  )
  values (
    v_wer.o_org, 'message', v_monat,
    case when p_named then v_wer.o_staff end,
    case when p_named then now() end,
    v_text
  );

  return jsonb_build_object('month', v_monat, 'named', p_named);
end;
$$;

revoke all on function public.submit_staff_feedback_message(boolean, text) from public, anon;
grant execute on function public.submit_staff_feedback_message(boolean, text) to authenticated;

comment on function public.submit_staff_feedback_message(boolean, text) is
  'ORG-006 (ANN-608): Rückmeldung an die Praxisleitung - jederzeit, ein Freitext, mit oder ohne Namen; nie owner. Kein Auditeintrag.';

-- -----------------------------------------------------------------------------
-- 5. Lesen: der eigene Stand
-- -----------------------------------------------------------------------------
-- Ob die Person teilnimmt und das Barometer dieses Monats schon abgegeben
-- hat. Jede Praxisrolle darf fragen (owner bekommt „nimmt nicht teil“); ein
-- Patienten- oder Plattformkonto bekommt 42501.
create function public.get_my_staff_feedback_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_staff  uuid;
  v_monat  date;
  v_kann   boolean;
begin
  v_org := app.staff_request_org(
    app.has_any_role('owner', 'team_lead', 'office', 'therapist', 'trainer'),
    'not allowed to read staff feedback status');
  v_monat := app.staff_feedback_month(v_org);
  v_kann := app.can_give_staff_feedback();
  if v_kann then
    select sm.id into v_staff
    from public.staff_members sm
    where sm.id = app.own_staff_member(v_org) and sm.employment_status = 'active';
    v_kann := v_staff is not null;
  end if;
  return jsonb_build_object(
    'can_take_part', v_kann,
    'can_read', app.can_read_staff_feedback(),
    'month', v_monat,
    'barometer_submitted', v_kann and exists (
      select 1 from public.staff_feedback_participations p
      where p.staff_member_id = v_staff and p.month = v_monat)
  );
end;
$$;

revoke all on function public.get_my_staff_feedback_status() from public, anon;
grant execute on function public.get_my_staff_feedback_status() to authenticated;

comment on function public.get_my_staff_feedback_status() is
  'ORG-006 (ANN-607): der eigene Stand - nimmt die Person teil, liest sie, und hat sie das Barometer dieses Monats abgegeben. Nur über sich selbst.';

-- -----------------------------------------------------------------------------
-- 6. Lesen: owner
-- -----------------------------------------------------------------------------
-- Namentliche Rückmeldungen einzeln: Name, Monat, Inhalt, die neueste zuerst.
-- Kein Filter nach Person, keine Kurve, keine Zählung je Person (§20.2 Nr. 3).
create function public.list_staff_feedback_named()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  v_org := app.staff_request_org(app.can_read_staff_feedback(), 'not allowed to read staff feedback');
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', f.id,
             'kind', f.kind,
             'month', f.month,
             'name', app.staff_display_name(f.staff_member_id),
             'mood', f.mood,
             'tours', f.tours,
             'team', f.team,
             'easier_text', f.easier_text,
             'more_text', f.more_text,
             'message_text', f.message_text
           ) order by f.month desc, f.submitted_at desc, f.id), '[]'::jsonb)
    from public.staff_feedback f
    where f.organization_id = v_org and f.staff_member_id is not null
  );
end;
$$;

revoke all on function public.list_staff_feedback_named() from public, anon;
grant execute on function public.list_staff_feedback_named() to authenticated;

comment on function public.list_staff_feedback_named() is
  'ORG-006 (§20.2 Nr. 3): namentliche Rückmeldungen einzeln - Name, Monat, Inhalt, die neueste zuerst; nur owner. Kein Filter je Person, kein Verlauf.';

-- Wie viele Antworten mindestens im Zeitraum liegen, und wie viele
-- Beschäftigte teilnehmen können müssen (§20.2 Nr. 4, ANN-607).
create function app.staff_feedback_threshold(out o_answers integer, out o_eligible integer)
language sql
immutable
set search_path = ''
as $$
  select 5, 3
$$;

revoke all on function app.staff_feedback_threshold() from public, anon, authenticated;

-- Der Zeitraum: der jüngste geschlossene Block (Zweitreview, Befund 2).
-- Blöcke entstehen vorwärts ab dem ersten Monat nach dem letzten Block (oder
-- ab der ältesten anonymen Antwort, höchstens zwölf Monate zurück), Monat für
-- Monat, bis fünf Antworten beisammen sind; dann ist der Block zu und der
-- nächste beginnt. Kein Monat gehört zu zwei Blöcken, ein Block ändert sich
-- nie. Der laufende Monat zählt nie: Sonst ließe sich eine einzelne neue
-- Antwort als Differenz zweier Abrufe lesen (ANN-607). Spannt ein offener
-- Block mehr als zwölf Monate, rückt sein Beginn nach - diese Monate waren nie
-- gezeigt. Liefert Beginn und Ende des jüngsten Blocks der letzten zwölf
-- Monate, sonst null.
create function app.staff_feedback_window(p_org uuid, p_kind text, out o_von date, out o_bis date)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_monat   date := app.staff_feedback_month(p_org);
  v_letzter date := (v_monat - interval '1 month')::date;
  v_grenze  date := (v_monat - interval '12 months')::date;
  v_start   date;
  v_m       date;
  v_n       integer := 0;
  v_schwelle integer := (app.staff_feedback_threshold()).o_answers;
begin
  select (max(b.to_month) + interval '1 month')::date into v_start
  from public.staff_feedback_blocks b
  where b.organization_id = p_org and b.kind = p_kind;
  if v_start is null then
    select min(f.month) into v_start
    from public.staff_feedback f
    where f.organization_id = p_org and f.kind = p_kind and f.staff_member_id is null;
  end if;
  if v_start is not null then
    v_start := greatest(v_start, v_grenze);
    v_m := v_start;
    while v_m <= v_letzter loop
      -- Mehr als zwölf Monate offen: der älteste fällt heraus (nie gezeigt).
      while v_m >= (v_start + interval '12 months')::date loop
        v_n := v_n - (select count(*) from public.staff_feedback f
                      where f.organization_id = p_org and f.kind = p_kind
                        and f.staff_member_id is null and f.month = v_start);
        v_start := (v_start + interval '1 month')::date;
      end loop;
      v_n := v_n + (select count(*) from public.staff_feedback f
                    where f.organization_id = p_org and f.kind = p_kind
                      and f.staff_member_id is null and f.month = v_m);
      if v_n >= v_schwelle then
        insert into public.staff_feedback_blocks (organization_id, kind, from_month, to_month)
        values (p_org, p_kind, v_start, v_m);
        v_start := (v_m + interval '1 month')::date;
        v_n := 0;
      end if;
      v_m := (v_m + interval '1 month')::date;
    end loop;
  end if;

  select b.from_month, b.to_month into o_von, o_bis
  from public.staff_feedback_blocks b
  where b.organization_id = p_org and b.kind = p_kind and b.to_month >= v_grenze
  order by b.to_month desc
  limit 1;
end;
$$;

revoke all on function app.staff_feedback_window(uuid, text) from public, anon, authenticated;

-- Eine Skala als Summe: Zahl, Median, Verteilung 1-9 - nur ab fünf Antworten
-- auf genau diese Frage.
create function app.staff_feedback_scale(p_values smallint[])
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(array_length(p_values, 1), 0) < (app.staff_feedback_threshold()).o_answers
      then jsonb_build_object('enough', false)
    else jsonb_build_object(
      'enough', true,
      'answered', array_length(p_values, 1),
      'median', (select round(percentile_cont(0.5) within group (order by v)::numeric, 1)
                 from unnest(p_values) as v),
      'distribution', (select jsonb_agg((select count(*) from unnest(p_values) as v where v = s) order by s)
                       from generate_series(1, 9) as s)
    )
  end
$$;

revoke all on function app.staff_feedback_scale(smallint[]) from public, anon, authenticated;

-- Die Praxissumme der anonymen Rückmeldungen (§20.2 Nr. 4). Ohne drei
-- Beschäftigte, die teilnehmen können, oder ohne fünf anonyme Antworten im
-- Zeitraum: nur „zu wenige“. Freitexte gemischt (nach dem Text geordnet),
-- ohne Monat und ohne Bezug zu den Skalen derselben Abgabe.
create function public.get_staff_feedback_summary()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_von     date;
  v_bis     date;
  v_baro    jsonb := jsonb_build_object('status', 'too_few');
  v_nachr   jsonb := jsonb_build_object('status', 'too_few');
begin
  v_org := app.staff_request_org(app.can_read_staff_feedback(), 'not allowed to read staff feedback');
  if app.staff_feedback_eligible_count(v_org) < (app.staff_feedback_threshold()).o_eligible then
    return jsonb_build_object('barometer', v_baro, 'messages', v_nachr);
  end if;
  select o_von, o_bis into v_von, v_bis from app.staff_feedback_window(v_org, 'barometer');
  if v_von is not null then
    select jsonb_build_object(
             'status', 'ready',
             'from_month', v_von,
             'to_month', v_bis,
             'answers', count(*),
             'mood', app.staff_feedback_scale(array_agg(f.mood) filter (where f.mood is not null)),
             'tours', app.staff_feedback_scale(array_agg(f.tours) filter (where f.tours is not null)),
             'team', app.staff_feedback_scale(array_agg(f.team) filter (where f.team is not null)),
             'easier_texts', coalesce(jsonb_agg(f.easier_text order by f.easier_text)
                                        filter (where f.easier_text is not null), '[]'::jsonb),
             'more_texts', coalesce(jsonb_agg(f.more_text order by f.more_text)
                                      filter (where f.more_text is not null), '[]'::jsonb)
           )
      into v_baro
    from public.staff_feedback f
    where f.organization_id = v_org and f.kind = 'barometer' and f.staff_member_id is null
      and f.month between v_von and v_bis;
    -- Liegt ein Teil des Blocks schon hinter der Frist, kann er unter die
    -- Schwelle fallen: dann nichts.
    if (v_baro ->> 'answers')::integer < (app.staff_feedback_threshold()).o_answers then
      v_baro := jsonb_build_object('status', 'too_few');
    end if;
  end if;

  select o_von, o_bis into v_von, v_bis from app.staff_feedback_window(v_org, 'message');
  if v_von is not null then
    select jsonb_build_object(
             'status', 'ready',
             'from_month', v_von,
             'to_month', v_bis,
             'answers', count(*),
             'texts', jsonb_agg(f.message_text order by f.message_text)
           )
      into v_nachr
    from public.staff_feedback f
    where f.organization_id = v_org and f.kind = 'message' and f.staff_member_id is null
      and f.month between v_von and v_bis;
    if (v_nachr ->> 'answers')::integer < (app.staff_feedback_threshold()).o_answers then
      v_nachr := jsonb_build_object('status', 'too_few');
    end if;
  end if;

  return jsonb_build_object('barometer', v_baro, 'messages', v_nachr);
end;
$$;

revoke all on function public.get_staff_feedback_summary() from public, anon;
grant execute on function public.get_staff_feedback_summary() to authenticated;

comment on function public.get_staff_feedback_summary() is
  'ORG-006 (§20.2 Nr. 4, ANN-607): Praxissumme der anonymen Rückmeldungen - nur owner; Skalen mit Median und Verteilung, Freitexte gemischt; nur mit drei Beschäftigten, die teilnehmen können, und fünf anonymen Antworten im jüngsten geschlossenen Block (abgeschlossene Monate, feste nicht überlappende Blöcke, höchstens zwölf Monate), sonst status too_few.';

-- -----------------------------------------------------------------------------
-- 7. Löschlauf (ADR-008 Fassung 4, ANN-607)
-- -----------------------------------------------------------------------------
create function app.delete_due_staff_feedback(p_org uuid, p_time_zone text, p_run uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anzahl integer := 0;
  v_teil   integer;
begin
  -- Rückmeldungen: zwölf Monate ab Ende des Monats der Abgabe, endgültig.
  with faellig as (
    select f.id, f.organization_id,
           app.retention_due_at(
             (f.month + interval '1 month' - interval '1 day')::date,
             app.retention_interval('rueckmeldung'),
             p_time_zone
           ) as due_at
    from public.staff_feedback f
    where f.organization_id = p_org
  ),
  geloescht as (
    delete from public.staff_feedback f
    using faellig x
    where f.id = x.id and x.due_at <= now()
    returning f.id, f.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run, 'staff_feedback', g.id, 'rueckmeldung', x.due_at
  from geloescht g join faellig x on x.id = g.id;
  get diagnostics v_teil = row_count;
  v_anzahl := v_anzahl + v_teil;

  -- Teilnahme: fällt nach ihrem Monat. Ohne Journal - sonst stünde die Zahl
  -- der Teilnehmenden je Monat im Nachweis des Laufs; die Regel hängt am
  -- Monat allein und greift nach einem Restore im nächsten Lauf ebenso.
  delete from public.staff_feedback_participations p
  where p.organization_id = p_org
    and app.retention_due_at(
          (p.month + interval '1 month' - interval '1 day')::date,
          app.retention_interval('rueckmeldung_teilnahme'),
          p_time_zone
        ) <= now();
  get diagnostics v_teil = row_count;
  v_anzahl := v_anzahl + v_teil;

  -- Anonyme Antworten abgeschlossener Monate neu schreiben (Zweitreview,
  -- Befund 1): in zufälliger Reihenfolge, mit neuer Kennung, in dieser einen
  -- Transaktion. Danach teilen sie keine Transaktionsnummer (`xmin`) und keine
  -- Lage (`ctid`) mehr mit der Teilnahmemarke ihrer Abgabe und tragen keine
  -- Spur ihres Zeitpunkts. Bis dahin - im laufenden Monat - bliebe die
  -- Verknüpfung nur mit Zugriff an den Rechten der Anwendung vorbei möglich
  -- (ANN-607). Zählt nicht als Löschung.
  with alt as (
    delete from public.staff_feedback f
    where f.organization_id = p_org and f.staff_member_id is null
      and f.month < app.staff_feedback_month(p_org)
    returning f.organization_id, f.kind, f.month, f.mood, f.tours, f.team,
              f.easier_text, f.more_text, f.message_text
  )
  insert into public.staff_feedback
    (organization_id, kind, month, mood, tours, team, easier_text, more_text, message_text)
  select a.organization_id, a.kind, a.month, a.mood, a.tours, a.team,
         a.easier_text, a.more_text, a.message_text
  from alt a
  order by random();

  -- Blöcke, die ganz vor der Frist liegen, fallen mit (kein Personenbezug).
  delete from public.staff_feedback_blocks b
  where b.organization_id = p_org
    and app.retention_due_at(
          (b.to_month + interval '1 month' - interval '1 day')::date,
          app.retention_interval('rueckmeldung'),
          p_time_zone
        ) <= now();

  return v_anzahl;
end;
$$;

revoke all on function app.delete_due_staff_feedback(uuid, text, uuid) from public, anon, authenticated;

comment on function app.delete_due_staff_feedback(uuid, text, uuid) is
  'ORG-006 (ANN-607): löscht Rückmeldungen von Beschäftigten zwölf Monate ab Ende ihres Monats endgültig (mit Eintrag im Löschjournal) und Teilnahmemarken nach ihrem Monat (ohne Journal). Aufgerufen aus public.apply_retention(); ohne Eintrag in dessen Auditzusammenfassung.';

-- -----------------------------------------------------------------------------
-- 8. Der Lauf ruft die Rückmeldungen mit auf - sonst unverändert (Stand ERS-001)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_retention()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_run       uuid := extensions.gen_random_uuid();
  v_org       record;
  v_akte      record;
  v_akten     integer;
  v_gehalten  integer;
  v_steuer    integer;
  v_verhaelt  record;
  v_training  integer;
  v_termine   integer;
  v_audit     integer;
  v_auftraege integer;
  v_journal   integer;
  v_zugang    integer;
  v_fotos     integer;
  v_warte     integer;
  v_aufgaben  integer;
  v_anrufe    integer;
  v_konten    integer;
  v_plattform integer;
  v_wuensche  integer;
  v_nachrichten integer;
  v_anhaenge  integer;
  v_radflotte integer;
  v_urlaub integer;
  v_arbeitszeit integer;
  v_zeitkonto integer;
  v_erstattung integer;
  v_rueckmeldung integer;
  v_gesamt    integer := 0;
begin
  for v_org in select o.id, o.time_zone from public.organizations o order by o.id
  loop
    v_akten    := 0;
    v_gehalten := 0;
    v_steuer   := 0;
    v_training := 0;

    -- -------------------------------------------------------------------
    -- Plattform, Teil 1 (POR-002, ADR-023 Punkt 5, ANN-189): Konten beim
    -- Anmeldedienst, 30 Tage nach dem Ende des letzten Zugangs. VOR den
    -- Verhaeltnissen: Solange das Verhaeltnis steht, ist das Ende seines
    -- Zugangs das Ende der Lesefrist (DSN-001 D2) und nicht der Tag, an dem
    -- der Lauf das Verhaeltnis loescht.
    -- -------------------------------------------------------------------
    v_konten := app.delete_due_platform_accounts(v_org.id, v_run);

    -- -------------------------------------------------------------------
    -- Patientenfotos: zwoelf Monate ab Aufnahme, spaetestens drei Monate
    -- nach dem festgehaltenen Abschluss, Widerruf (ADR-017 Punkt 38).
    -- Ein Legal Hold haelt an.
    -- -------------------------------------------------------------------
    v_fotos := app.delete_due_patient_photos(v_org.id, null, v_run, null, 'retention');

    -- -------------------------------------------------------------------
    -- Klinische Patientenakte: zehn Jahre nach Abschluss der Behandlung.
    --
    -- B1 (BEF-151, ADR-008 Fassung 3): Der Anker ist nicht mehr allein der
    -- ausdrueckliche Abschluss, sondern app.patient_retention_anchor - das
    -- spaeteste Datum aus letzter Behandlung, erfasster Leistung und einem
    -- etwaigen ausdruecklichen Abschluss. Eine Akte mit kuenftigem Termin
    -- faellt nie, und ohne jede Behandlung laeuft weiter keine Frist.
    -- -------------------------------------------------------------------
    for v_akte in
      select k.id, k.due_at
      from (
        select p.id,
               app.retention_due_at(
                 app.patient_retention_anchor(p.id),
                 app.retention_interval('patientenakte'),
                 v_org.time_zone
               ) as due_at
        from public.patients p
        where p.organization_id = v_org.id
      ) k
      join public.patients p on p.id = k.id
      where k.due_at is not null
        and k.due_at <= now()
        and not app.patient_has_upcoming_care(k.id)
      order by k.due_at
      for update of p skip locked
    loop
      if app.under_legal_hold(v_org.id, 'patient', v_akte.id) then
        v_gehalten := v_gehalten + 1;
        continue;
      end if;

      -- Neu mit ABR-003: Die steuerliche Frist einer ausgestellten Rechnung
      -- kann die zehn Jahre der Akte ueberdauern. Gesetzliche Aufbewahrung
      -- hat Vorrang vor der regulaeren Loeschung (ADR-008 Punkt 2).
      if app.billing_retention_due_at(v_akte.id, v_org.time_zone) > now() then
        v_steuer := v_steuer + 1;
        continue;
      end if;

      v_akten := v_akten + app.delete_patient_record(v_akte.id, v_run, v_akte.due_at);
    end loop;

    -- -------------------------------------------------------------------
    -- Trainingsverhaeltnis: drei Jahre ab Vertragsende (ADR-021 Punkt 4)
    --
    -- Eigene Schleife und nicht ein Zweig der Akte: Die Frist ist kuerzer,
    -- der Anker ein anderer, und die Rechtsgrundlage traegt die
    -- Heilbehandlungs-Ausnahme nicht. Ohne Vertragsende laeuft keine Frist -
    -- ein laufendes Training wird nie geloescht.
    --
    -- KEIN LEGAL HOLD, UND ZWAR ABSICHTLICH: Loeschsperren stehen heute auf
    -- Patientenebene (ANN-033); ein Hold auf ein Trainingsverhaeltnis ist
    -- nicht darstellbar und waere hier eine Pruefung ohne Gegenstand. Wer
    -- eine Loeschung anhalten muss, raeumt bis dahin contract_ended_on - der
    -- Anker ist genau dafuer ruecknehmbar gebaut (LEI-001). Eine Sperre in
    -- der Behandlung wirkt nicht hierher: Der Hold haengt am Verhaeltnis
    -- (ADR-021), und die gemeinsame Person haelt sie ueber die Akte.
    --
    -- SKIP LOCKED wie bei der Akte: ein Verhaeltnis, an dem gerade jemand
    -- arbeitet, kommt im naechsten Lauf erneut dran.
    -- -------------------------------------------------------------------
    for v_verhaelt in
      select t.id,
             app.retention_due_at(
               t.contract_ended_on,
               app.retention_interval('trainingsverhaeltnis'),
               v_org.time_zone
             ) as due_at
      from public.training_relationships t
      where t.organization_id = v_org.id
        and t.contract_ended_on is not null
        and app.retention_due_at(
              t.contract_ended_on,
              app.retention_interval('trainingsverhaeltnis'),
              v_org.time_zone
            ) <= now()
      order by t.contract_ended_on
      for update of t skip locked
    loop
      -- TRN-008 (ANN-183): Die steuerliche Frist der Belege kann die drei
      -- Jahre des Verhaeltnisses ueberdauern. Gesetzliche Aufbewahrung hat
      -- Vorrang vor der regulaeren Loeschung (ADR-008 Punkt 2) - dieselbe
      -- Regel wie an der Akte.
      if app.training_billing_retention_due_at(v_verhaelt.id, v_org.time_zone) > now() then
        v_steuer := v_steuer + 1;
        -- Zweitreview: gehalten werden nur die Belege und was sie tragen;
        -- der Rest faellt nach den drei Jahren aus ADR-021 Punkt 4.
        v_training := v_training
          + app.reduce_training_relationship(v_verhaelt.id, v_run, v_verhaelt.due_at);
        continue;
      end if;

      v_training := v_training
        + app.delete_training_relationship(v_verhaelt.id, v_run, v_verhaelt.due_at);
    end loop;

    -- -------------------------------------------------------------------
    -- Abgesagte Termine und No-shows ohne Behandlungsnachweis: drei Jahre
    -- ab Ende des Kalenderjahres der Absage beziehungsweise des Vermerks.
    --
    -- Haengt Dokumentation am Termin, gilt die Frist der Akte - der Termin
    -- ist dann Teil des Behandlungsnachweises (ADR-008 Punkt 2). Ein
    -- Vorgang mit Gebuehrenanlass bleibt stehen: er ist die Grundlage
    -- einer Forderung (ANN-035, CAL-014b). Die mit der Abrechnung
    -- angekuendigte Bedingung "ohne Rechnung" ist damit erfuellt: Eine
    -- Rechnung kann nur an einem dokumentierten Termin oder an einem
    -- Gebuehrenanlass haengen, und beide nimmt die Abfrage bereits aus.
    -- -------------------------------------------------------------------
    with faellig as (
      select a.id,
             a.organization_id,
             app.retention_due_at(
               (date_trunc(
                  'year',
                  coalesce(a.cancelled_at, a.no_show_recorded_at) at time zone v_org.time_zone
                ) + interval '1 year' - interval '1 day')::date,
               app.retention_interval('termin_ohne_nachweis'),
               v_org.time_zone
             ) as due_at
      from public.appointments a
      where a.organization_id = v_org.id
        and a.fee_basis is null
        -- CAL-026: NUR Praxistermine. Ein Trainingstermin faellt mit seinem
        -- Verhaeltnis (oben) und nach dessen Frist - nicht hier. Zwei Gruende,
        -- und beide sind hart: Diese Frist rechnet ab Kalenderjahresende statt
        -- ab Vertragsende, und die Sperrpruefung darunter laeuft ueber
        -- a.patient_id, der am Trainingstermin leer ist - eine Sperre am
        -- Verhaeltnis haette die Zeile nicht gehalten (ADR-022, Konsequenzen).
        and a.kind <> 'training'
        and (
          (a.status = 'cancelled' and a.cancelled_at is not null)
          or (a.status = 'no_show' and a.no_show_recorded_at is not null)
        )
        and not exists (
          select 1 from public.treatment_notes t where t.appointment_id = a.id
        )
        and not app.under_legal_hold(v_org.id, 'patient', a.patient_id)
    ),
    geloescht as (
      delete from public.appointments a
      using faellig f
      where a.id = f.id
        and f.due_at <= now()
      returning a.id, a.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'appointments', g.id, 'termin_ohne_nachweis', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_termine = row_count;

    -- -------------------------------------------------------------------
    -- Auditlog: drei Jahre ab dem Ereignis (ANN-029)
    -- -------------------------------------------------------------------
    -- LOG-EPIC-001: zwei Klassen (app.audit_retention_class), und ein Legal
    -- Hold haelt jede Zeile seiner Akte - ueber den Gegenstand oder
    -- context.patient_id, auch fuer zusammengefuehrte Doppelanlagen.
    with geloescht as (
      delete from public.audit_log a
      where a.organization_id = v_org.id
        and a.occurred_at < now() - app.retention_interval(app.audit_retention_class(a.action))
        and not app.audit_entry_held(v_org.id, a.subject_type, a.subject_id, a.context)
      returning a.id, a.organization_id, a.occurred_at, app.audit_retention_class(a.action) as klasse
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'audit_log', g.id, g.klasse,
           g.occurred_at + app.retention_interval(g.klasse)
    from geloescht g;
    get diagnostics v_audit = row_count;

    -- -------------------------------------------------------------------
    -- Quittierte Loeschauftraege der Ablage: drei Jahre ab der Quittung
    -- (LOG-EPIC-001). Offene Auftraege bleiben. Nicht im Journal: Ein
    -- Auftrag ist selbst der Nachweis einer Loeschung, kein Fachdatensatz.
    -- -------------------------------------------------------------------
    delete from public.storage_deletion_orders o
    where o.organization_id = v_org.id
      and o.receipted_at is not null
      and o.receipted_at < now() - app.retention_interval('loeschauftrag');
    get diagnostics v_auftraege = row_count;

    -- -------------------------------------------------------------------
    -- Loeschjournal: 60 Tage ab der Loeschung (ADR-012: Backups 30 Tage,
    -- dazu 30 Tage Puffer). Zuletzt, damit die Eintraege dieses Laufs nicht
    -- mitfallen.
    -- -------------------------------------------------------------------
    delete from public.deletion_journal j
    where j.organization_id = v_org.id
      and j.deleted_at < now() - app.retention_interval('loeschjournal');
    get diagnostics v_journal = row_count;

    -- -------------------------------------------------------------------
    -- Einladungen: zwoelf Monate nach Abschluss des Vorgangs (ANN-026)
    -- -------------------------------------------------------------------
    with faellig as (
      select i.id,
             i.organization_id,
             coalesce(
               i.accepted_at,
               i.revoked_at,
               case when i.status = 'pending' and i.expires_at <= now() then i.expires_at end
             ) + app.retention_interval('zugangseinladung') as due_at
      from public.staff_account_invitations i
      where i.organization_id = v_org.id
    ),
    geloescht as (
      delete from public.staff_account_invitations i
      using faellig f
      where i.id = f.id
        and f.due_at is not null
        and f.due_at <= now()
      returning i.id, i.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'staff_account_invitations', g.id, 'zugangseinladung', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_zugang = row_count;

    -- -------------------------------------------------------------------
    -- Warteliste: zwoelf Monate nach dem Schliessen (ANN-133). Offene
    -- Eintraege fallen nur mit der Akte. Ein Legal Hold an der Akte haelt.
    -- -------------------------------------------------------------------
    with faellig as (
      select w.id,
             w.organization_id,
             w.closed_at + app.retention_interval('warteliste') as due_at
      from public.waitlist_entries w
      where w.organization_id = v_org.id
        and w.status <> 'open'
        and w.closed_at is not null
        and not app.under_legal_hold(v_org.id, 'patient', w.patient_id)
    ),
    geloescht as (
      delete from public.waitlist_entries w
      using faellig f
      where w.id = f.id
        and f.due_at <= now()
      returning w.id, w.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'waitlist_entries', g.id, 'warteliste', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_warte = row_count;

    -- -------------------------------------------------------------------
    -- Aufgaben: zwoelf Monate nach dem Erledigen (ANN-142). Offene
    -- Aufgaben bleiben; mit Personenbezug fallen sie mit der Akte. Ein
    -- Legal Hold an der Akte haelt auch die erledigte Aufgabe.
    -- -------------------------------------------------------------------
    with faellig as (
      select k.id,
             k.organization_id,
             k.done_at + app.retention_interval('aufgabe') as due_at
      from public.tasks k
      where k.organization_id = v_org.id
        and k.status = 'done'
        and k.done_at is not null
        and (k.patient_id is null or not app.under_legal_hold(v_org.id, 'patient', k.patient_id))
    ),
    geloescht as (
      delete from public.tasks k
      using faellig f
      where k.id = f.id
        and f.due_at <= now()
      returning k.id, k.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'tasks', g.id, 'aufgabe', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_aufgaben = row_count;

    -- -------------------------------------------------------------------
    -- Anrufstand: vierzehn Tage nach dem Termin (ANN-144). Ein "nicht
    -- erreicht" soll kein Merkmal der Person werden (§20, IDEA-PRX-041).
    -- -------------------------------------------------------------------
    with faellig as (
      select c.id,
             c.organization_id,
             a.starts_at + app.retention_interval('anrufstand') as due_at
      from public.appointment_call_states c
      join public.appointments a on a.id = c.appointment_id
      where c.organization_id = v_org.id
        -- Ein Legal Hold an der Akte haelt auch den Anrufstand (ADR-008
        -- Punkt 7, Zweitreview).
        and not app.under_legal_hold(v_org.id, 'patient', a.patient_id)
    ),
    geloescht as (
      delete from public.appointment_call_states c
      using faellig f
      where c.id = f.id
        and f.due_at <= now()
      returning c.id, c.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'appointment_call_states', g.id, 'anrufstand', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_anrufe = row_count;

    -- -------------------------------------------------------------------
    -- Terminwuensche der Plattform (POR-009, ANN-246): zwoelf Monate nach
    -- der Antwort der Praxis bzw. dem Zurueckziehen. Offene Wuensche
    -- bleiben; mit dem Verhaeltnis fallen sie ohnehin (cascade). Ein Legal
    -- Hold an der Akte haelt auch den beantworteten Wunsch.
    -- -------------------------------------------------------------------
    with faellig as (
      select w.id,
             w.organization_id,
             w.resolved_at + app.retention_interval('terminwunsch') as due_at
      from public.platform_appointment_requests w
      where w.organization_id = v_org.id
        and w.status <> 'open'
        and w.resolved_at is not null
        and (w.patient_id is null or not app.under_legal_hold(v_org.id, 'patient', w.patient_id))
    ),
    geloescht as (
      delete from public.platform_appointment_requests w
      using faellig f
      where w.id = f.id
        and f.due_at <= now()
      returning w.id, w.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'platform_appointment_requests', g.id, 'terminwunsch', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_wuensche = row_count;

    -- -------------------------------------------------------------------
    -- KOM-005 (ADR-017 Punkt 65): Anhaenge an Rueckfragen, 30 Tage ab der
    -- Aufnahme oder ab ihrer Sperre. Vor den Vorgaengen: ein Anhang, der mit
    -- seinem Vorgang faellt, steht nicht doppelt im Journal. Ein Legal Hold
    -- an der Akte haelt (gesperrt, ANN-335).
    -- -------------------------------------------------------------------
    v_anhaenge := app.remove_message_attachments(v_org.id, 'due', null, v_run);

    -- -------------------------------------------------------------------
    -- FLT-001 (ANN-551): Radflotte - Schluessel 30 Tage nach der Rueckgabe,
    -- Sperren, Check-Ups und Pannen drei Jahre ab Ende des Kalenderjahres;
    -- offene nie. Ohne Patientenbezug, deshalb ohne Legal Hold der Akte.
    -- -------------------------------------------------------------------
    v_radflotte := app.delete_due_fleet_records(v_org.id, v_org.time_zone, v_run);

    -- -------------------------------------------------------------------
    -- URL-001 (ANN-579): Urlaub - genehmigte und stornierte Antraege und
    -- Ansprueche drei Jahre ab Ende des Urlaubsjahres, abgelehnte und
    -- zurueckgezogene ein Jahr nach ihrem Ende; offene nie. Ohne
    -- Patientenbezug, deshalb ohne Legal Hold der Akte.
    -- -------------------------------------------------------------------
    v_urlaub := app.delete_due_staff_leave(v_org.id, v_org.time_zone, v_run);

    -- -------------------------------------------------------------------
    -- AZ-001 (ANN-591): Arbeitszeitaenderungen - genehmigte drei Jahre ab
    -- Ende des Jahres ihrer Wirkung, abgelehnte und zurueckgezogene ein Jahr
    -- nach ihrem Ende; offene nie. Ohne Patientenbezug, ohne Legal Hold.
    -- -------------------------------------------------------------------
    v_arbeitszeit := app.delete_due_working_time_requests(v_org.id, v_org.time_zone, v_run);

    -- -------------------------------------------------------------------
    -- ZK-001 (ANN-597): Zeitkonto - gültige Einträge drei Jahre ab Ende
    -- ihres Jahres, ihr Saldo bleibt als Übertrag; zurückgewiesene und
    -- zurückgenommene ein Jahr nach ihrem Ende. Ohne Patientenbezug.
    -- -------------------------------------------------------------------
    v_zeitkonto := app.delete_due_time_account_entries(v_org.id, v_org.time_zone, v_run);

    -- -------------------------------------------------------------------
    -- ERS-001 (ANN-602): Erstattungen - ausgezahlte acht Jahre ab Ende des
    -- Jahres der Auszahlung (Par. 147 AO), abgelehnte und zurückgezogene ein
    -- Jahr; die Belege fallen mit, ihre Objekte über den Löschauftrag.
    -- -------------------------------------------------------------------
    v_erstattung := app.delete_due_reimbursements(v_org.id, v_org.time_zone, v_run);

    -- -------------------------------------------------------------------
    -- ORG-006 (ANN-607): Rückmeldungen von Beschäftigten - zwölf Monate ab
    -- Ende des Monats der Abgabe, endgültig; Teilnahmemarken nach ihrem
    -- Monat. Bewusst NICHT in der Zusammenfassung unten (ADR-010 Punkt 17,
    -- §20.2): Der Nachweis ist das Löschjournal.
    -- -------------------------------------------------------------------
    v_rueckmeldung := app.delete_due_staff_feedback(v_org.id, v_org.time_zone, v_run);

    -- -------------------------------------------------------------------
    -- Nachrichten der Behandlung (KOM-001, ADR-008 "Organisatorische
    -- Patientenkommunikation", ANN-001): drei Jahre ab Ende des
    -- Kalenderjahres, in dem der Vorgang abgeschlossen wurde: erledigt, oder
    -- beantwortet und danach nichts mehr von der Person (Anker: die letzte
    -- Antwort; Zweitreview S1, ANN-308). Offene bleiben; der Akte
    -- zugeordnete (KOM-004, ANN-312) fallen erst mit ihr; im Training fallen
    -- sie mit dem Verhaeltnis (cascade). Ein Legal Hold an der Akte haelt.
    -- -------------------------------------------------------------------
    with faellig as (
      select m.id,
             m.organization_id,
             app.retention_due_at(
               (date_trunc('year', coalesce(m.closed_at, m.last_entry_at)
                                     at time zone v_org.time_zone)
                 + interval '1 year' - interval '1 day')::date,
               app.retention_interval('patientenkommunikation'),
               v_org.time_zone
             ) as due_at
      from public.platform_messages m
      where m.organization_id = v_org.id
        and m.relationship_kind = 'treatment'
        and m.status in ('closed', 'answered')
        and m.record_assigned_at is null
        and not app.under_legal_hold(v_org.id, 'patient', m.patient_id)
    ),
    geloescht as (
      delete from public.platform_messages m
      using faellig f
      where m.id = f.id
        and f.due_at <= now()
      returning m.id, m.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'platform_messages', g.id, 'patientenkommunikation', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_nachrichten = row_count;

    -- -------------------------------------------------------------------
    -- Plattform, Teil 2 (POR-002, ANN-189): Zugaenge mit ihren Einladungen,
    -- drei Jahre nach ihrem Ende. Nach den Verhaeltnissen oben: Ein im
    -- selben Lauf geloeschtes Verhaeltnis hat seinen Zugang da schon beendet.
    -- -------------------------------------------------------------------
    v_plattform := app.delete_due_platform_accesses(v_org.id, v_run);

    v_gesamt := v_gesamt + v_fotos + v_akten + v_training + v_termine + v_audit + v_zugang + v_warte
                + v_aufgaben + v_anrufe + v_konten + v_plattform + v_wuensche + v_nachrichten + v_anhaenge
                + v_radflotte + v_urlaub + v_arbeitszeit + v_zeitkonto + v_erstattung + v_rueckmeldung;

    if v_fotos + v_akten + v_training + v_termine + v_audit + v_zugang + v_warte + v_aufgaben + v_anrufe
       + v_konten + v_plattform + v_auftraege + v_journal + v_wuensche + v_nachrichten + v_anhaenge
       + v_radflotte + v_urlaub + v_arbeitszeit + v_zeitkonto + v_erstattung > 0
       or v_gehalten > 0 or v_steuer > 0 then
      insert into public.audit_log (
        organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
      )
      values (
        v_org.id, null, 'system', 'retention.applied', 'organization', v_org.id, 'success',
        jsonb_build_object(
          'surface', 'scheduler',
          'run_id', v_run,
          'patientenfoto', v_fotos,
          'patientenakte', v_akten,
          'trainingsverhaeltnis', v_training,
          'termin_ohne_nachweis', v_termine,
          'auditlog', v_audit,
          'loeschauftrag', v_auftraege,
          'loeschjournal', v_journal,
          'zugangseinladung', v_zugang,
          'warteliste', v_warte,
          'aufgabe', v_aufgaben,
          'anrufstand', v_anrufe,
          'plattformkonto', v_konten,
          'plattformzugang', v_plattform,
          'terminwunsch', v_wuensche,
          'patientenkommunikation', v_nachrichten,
          'rueckfrageanhang', v_anhaenge,
          'radflotte', v_radflotte,
          'urlaub', v_urlaub,
          'arbeitszeit', v_arbeitszeit,
          'zeitkonto', v_zeitkonto,
          'erstattung', v_erstattung,
          'legal_hold_gehalten', v_gehalten,
          'steuerfrist_gehalten', v_steuer
        )
      );
    end if;
  end loop;

  return v_gesamt;
end;
$function$;

-- Nach einem Restore werden Rückmeldungen wie alle anderen erneut gelöscht.
CREATE OR REPLACE FUNCTION public.reapply_deletion_journal()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_reihenfolge text[] := array[
    'invoice_payment_reminders',
    'invoice_cancellations',
    'payments',
    'invoice_items',
    'invoices',
    'invoice_recipients',
    'billable_services',
    'treatment_note_versions',
    'treatment_notes',
    'patient_files',
    -- Vor Grundlage und Termin: ein Eintrag zeigt auf beide (on delete set
    -- null) - geloescht wird er vorher, damit nichts umgeschrieben wird
    -- (PRX-001, Zweitreview 5).
    'waitlist_entries',
    -- PRX-012: eine Aufgabe zeigt auf Person und Mitarbeitende (cascade
    -- beziehungsweise set null) - geloescht wird sie vorher.
    'tasks',
    -- TRN-009: das Trainingsprotokoll haengt am Termin (restrict) und faellt
    -- vor ihm - dieselbe Reihenfolge wie im Lauf.
    'training_protocols',
    -- PRX-014: der Anrufstand haengt am Termin und faellt vor ihm.
    'appointment_call_states',
    -- POR-009: ein Terminwunsch zeigt auf Termin (set null) und Verhaeltnis
    -- (cascade) - geloescht wird er vorher.
    'platform_appointment_requests',
    -- KOM-005: ein Anhang haengt am Vorgang (cascade) und faellt vor ihm.
    'platform_message_attachments',
    -- KOM-001: ein Vorgang zeigt auf Plan, Uebung (set null) und Akte
    -- (cascade); seine Eintraege fallen mit ihm.
    'platform_messages',
    -- FLT-001: die Radflotte haengt an keiner Akte. Schluessel und Sperren
    -- vor den Pannen (eine Sperre zeigt auf ihre Panne, set null); einzeln
    -- geloeschte Fotos vor Check-Up und Panne, deren Stellen und uebrige
    -- Fotos mit ihnen fallen (cascade); das ausgemusterte Rad zuletzt.
    'fleet_key_handovers',
    'fleet_blocks',
    'fleet_photos',
    'fleet_checkups',
    'fleet_breakdowns',
    'fleet_bikes',
    -- URL-001: Storno und Abwesenheiten in den Arbeitszeiten fallen mit ihrem
    -- Urlaub (cascade).
    'staff_leave_requests',
    'staff_leave_entitlements',
    -- AZ-001: Arbeitszeitaenderungen haengen an keiner anderen Zeile.
    'staff_working_time_requests',
    -- ZK-001: ein Eintrag im Zeitkonto; seine Abweichung faellt mit ihm
    -- (cascade).
    'staff_time_account_entries',
    -- ERS-001: einzeln verworfene Belege vor ihrem Antrag; eine Erstattung
    -- nimmt ihre übrigen Belege mit (cascade), deren Objekte über den
    -- Löschauftrag.
    'staff_reimbursement_receipts',
    'staff_reimbursements',
    -- ORG-006: Rückmeldungen von Beschäftigten hängen an keiner anderen Zeile.
    'staff_feedback',
    'treatment_base_items',
    'treatment_bases',
    'appointments',
    'legal_holds',
    'patient_contact_details',
    'patient_care_details',
    'patients',
    -- TRN-EPIC-003 (Zweitreview): Kontaktdaten des Trainings aus der
    -- Teilloeschung. Ihr Schluessel ist das Verhaeltnis, nicht `id`.
    'training_contact_details',
    -- TRN-005: die Vereinbarung nach ihren Terminen (on delete set null) und
    -- vor ihrem Verhaeltnis (restrict) - dieselbe Reihenfolge wie im Lauf
    -- (app.delete_training_relationship). Fehlte seit CAL-026.
    'training_bases',
    -- Vor persons: die Person faellt erst, wenn kein Verhaeltnis mehr auf
    -- sie zeigt - nach einem Restore genauso wie im Lauf (LEI-002).
    'training_relationships',
    'persons',
    'audit_log',
    'staff_account_invitations',
    -- POR-002: der Zugang mit seinen Einladungen (on delete cascade) und das
    -- Konto beim Anmeldedienst. `auth_users` ist kein Tabellenname in
    -- public, sondern die eine Ausnahme unten.
    'platform_accesses',
    'auth_users'
  ];
  v_tabelle   text;
  v_ids       uuid[];
  v_geloescht uuid[];
  v_unbekannt text[];
  v_gesamt    integer := 0;
begin
  select array_agg(distinct j.target_table)
    into v_unbekannt
  from public.deletion_journal j
  where not (j.target_table = any (v_reihenfolge));

  if v_unbekannt is not null then
    raise exception 'deletion journal references tables without a reapply order: %', v_unbekannt
      using errcode = '22023';
  end if;

  foreach v_tabelle in array v_reihenfolge
  loop
    select array_agg(j.target_id)
      into v_ids
    from public.deletion_journal j
    where j.target_table = v_tabelle;

    continue when v_ids is null;

    -- Das Konto einer Plattform liegt beim Anmeldedienst (ADR-023 Punkt 5).
    -- ABN-011 (BEF-115): auch hier ueber die Admin-API. Was nach dem Restore
    -- wieder da ist, verliert sofort jeden Zugang und bekommt einen
    -- Loeschauftrag. Als erneut angewandt gilt der Journaleintrag erst mit
    -- der Bestaetigung (confirm_platform_account_deletion, Zweitreview B1).
    if v_tabelle = 'auth_users' then
      update public.platform_accesses a
         set status = 'revoked',
             revoked_at = coalesce(a.revoked_at, now()),
             revoked_by = null,
             revoked_reason = 'account_deleted',
             locked_at = null,
             locked_by = null
       where a.account_user_id = any (v_ids) and a.status <> 'revoked';

      perform app.order_platform_account_deletion(
        j.target_id, j.organization_id, null, j.due_at, 'reapply')
      from public.deletion_journal j
      join auth.users u on u.id = j.target_id
      where j.target_table = 'auth_users'
        and j.target_id = any (v_ids);
      v_geloescht := null;
    else
    -- Tabellenname aus der festen Liste oben, nie aus Benutzereingabe;
    -- die Kennungen gehen als Parameter, nicht als Text.
    execute format(
      'with g as (delete from public.%I where %I = any($1) returning %I as id) select array_agg(id) from g',
      v_tabelle,
      app.deletion_key_column(v_tabelle),
      app.deletion_key_column(v_tabelle)
    )
    into v_geloescht
    using v_ids;
    end if;

    if v_geloescht is not null then
      update public.deletion_journal
         set reapplied_at = now()
       where target_table = v_tabelle
         and target_id = any (v_geloescht);

      v_gesamt := v_gesamt + array_length(v_geloescht, 1);
    end if;
  end loop;

  -- Die Wiederanwendung weist deletion_journal.reapplied_at nach (LOG-EPIC-001).

  return v_gesamt;
end;
$function$;
