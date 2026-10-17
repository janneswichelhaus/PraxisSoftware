-- =============================================================================
-- URL-001 (Überholung 7): Urlaub mit der gemeinsamen Antragsmechanik
--
-- Ersetzt die Urlaubsvorschau (`src/features/vacation`) durch echte Anträge:
--
--   * Zustände (ANN-576): beantragt → genehmigt oder abgelehnt (mit Grund);
--     zurückgezogen, solange beantragt. Genehmigtes wird nicht still
--     geändert: Ein Storno ist ein neuer Antrag mit Bezug (`kind`
--     'cancellation', `refers_to`); genehmigt, wird das Original
--     „storniert“, und seine Tage sind wieder frei.
--   * Entscheidet owner, nie über den eigenen Antrag; den eigenen Urlaub
--     trägt owner direkt ein (gilt als genehmigt, ANN-576). Die Teamleitung
--     entscheidet nicht: „team_lead bearbeitet Urlaubsanträge“ war Option 3
--     von BEF-066, gewählt ist Option 2 (Zweitreview, §16). Geöffnet wird an
--     einer Stelle (`app.can_decide_staff_requests`).
--   * Sichtbarkeit nach BEF-066 (Jannes 2026-10-09, ANN-580): Eigenes sieht
--     jede Person ganz, auch die Notiz zum Antrag - die sieht sonst niemand,
--     auch nicht, wer entscheidet („nie den Grund“). Am offenen Antrag sehen
--     die Entscheidenden Person, Zeitraum, Tage, das Urlaubskonto der Person,
--     wer zugleich fehlt und wie viele Termine im Zeitraum liegen. Fremde
--     Urlaubskonten sonst nur owner (Ansprüche pflegen, Hinweispflicht).
--     Andere sehen von genehmigtem Urlaub nur Name und Zeitraum, und das ab
--     heute - kein Verlauf über die Kolleg:innen. Keine Summe über alle
--     Personen (§20). Kein Tabellenrecht - gelesen und geschrieben
--     wird nur über die Funktionen unten (ADR-004).
--   * Tage (ANN-577): Arbeitstage nach dem Wochenplan der Person (ohne Plan
--     Montag bis Freitag) ohne die gesetzlichen Feiertage des Bundeslands der
--     Praxis, am Server gezählt. Nur ganze Tage.
--   * Wirkung (ANN-578): Genehmigter Urlaub jeder Person - auch wer erst
--     spaeter einplanbar wird - sperrt jeden Tag des Zeitraums als
--     Abwesenheit in den Arbeitszeiten (`staff_working_hour_exceptions`, kind
--     'unavailable', mit Bezug auf den Antrag): dieselbe Quelle, die
--     Kalender, Slotsuche, Trainingstermine und Radflotte schon lesen.
--     Abweichende Arbeitszeiten (`block`) im Zeitraum halten die Genehmigung
--     an, und umgekehrt überschreibt `set_staff_working_hour_exception` keinen
--     Urlaubstag mehr. Termine werden nie still abgesagt, sondern genannt.
--   * Nachweis ist das Datenmodell (ADR-010 Punkt 15): beantragt von/am,
--     entschieden von/am, Grund. Kein Auditeintrag.
--   * Fristen (ADR-008, ANN-579): genehmigte und stornierte Anträge sowie
--     Ansprüche drei Jahre ab Ende des Urlaubsjahres; abgelehnte und
--     zurückgezogene ein Jahr nach ihrem Ende. Löschlauf mit Journal; die
--     Abwesenheiten eines Urlaubs fallen mit ihm (cascade).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Das Bundesland der Praxis (ANN-577)
-- -----------------------------------------------------------------------------
alter table public.organizations
  add column federal_state text not null default 'BW'
    constraint organizations_federal_state check (federal_state in ('BW', 'NW'));

comment on column public.organizations.federal_state is
  'URL-001 (ANN-577): Bundesland der Praxis fuer die gesetzlichen Feiertage beim Zaehlen von Urlaubstagen. BW (Tuebingen) oder NW (Koeln); Voreinstellung BW.';

-- -----------------------------------------------------------------------------
-- 2. Feiertage und Urlaubstage
-- -----------------------------------------------------------------------------
-- Ostersonntag nach der Gaußschen Osterformel (Meeus/Jones/Butcher), wie
-- `src/features/vacation/feiertage.ts`. Alle Werte sind positiv; die
-- Ganzzahldivision von PostgreSQL schneidet ab wie `Math.floor`.
create function app.easter_sunday(p_year integer)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  a integer := p_year % 19;
  b integer := p_year / 100;
  c integer := p_year % 100;
  d integer := b / 4;
  e integer := b % 4;
  f integer := (b + 8) / 25;
  g integer := (b - f + 1) / 3;
  h integer := (19 * a + b - d - g + 15) % 30;
  i integer := c / 4;
  k integer := c % 4;
  l integer := (32 + 2 * e + 2 * i - h - k) % 7;
  m integer := (a + 11 * h + 22 * l) / 451;
begin
  return make_date(p_year, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1);
end;
$$;

revoke all on function app.easter_sunday(integer) from public, anon, authenticated;

comment on function app.easter_sunday(integer) is
  'URL-001 (ANN-577): Ostersonntag eines Jahres (gregorianisch). Dieselbe Rechnung wie src/features/vacation/feiertage.ts.';

-- Gesetzliche Feiertage in BW und NW (FeiertG NRW Par. 2; Innenministerium
-- BW): Neujahr, Heilige Drei Koenige (nur BW), Karfreitag, Ostermontag,
-- 1. Mai, Christi Himmelfahrt, Pfingstmontag, Fronleichnam, 3. Oktober,
-- Allerheiligen, 1. und 2. Weihnachtstag.
create function app.is_public_holiday(p_date date, p_state text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_ostern date := app.easter_sunday(extract(year from p_date)::integer);
  v_md     text := to_char(p_date, 'MM-DD');
begin
  return v_md in ('01-01', '05-01', '10-03', '11-01', '12-25', '12-26')
      or (p_state = 'BW' and v_md = '01-06')
      or p_date in (v_ostern - 2, v_ostern + 1, v_ostern + 39, v_ostern + 50, v_ostern + 60);
end;
$$;

revoke all on function app.is_public_holiday(date, text) from public, anon, authenticated;

comment on function app.is_public_holiday(date, text) is
  'URL-001 (ANN-577): ob ein Tag in BW oder NW gesetzlicher Feiertag ist. Dieselbe Liste wie src/features/vacation/feiertage.ts.';

-- Urlaubstage eines Zeitraums fuer eine Person: Tage mit Block im Wochenplan
-- (staff_working_hours), ohne Wochenplan Montag bis Freitag, jeweils ohne
-- Feiertag. Abweichungen fuer ein Datum zaehlen nicht (ANN-577).
create function app.leave_days(p_org uuid, p_staff_member_id uuid, p_from date, p_to date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with plan as (
    select distinct w.weekday
    from public.staff_working_hours w
    where w.organization_id = p_org and w.staff_member_id = p_staff_member_id
  ),
  tage as (
    select d::date as tag
    from generate_series(p_from, p_to, interval '1 day') as d
  )
  select count(*)::integer
  from tage t
  cross join (select o.federal_state from public.organizations o where o.id = p_org) as o
  where not app.is_public_holiday(t.tag, o.federal_state)
    and (
      exists (select 1 from plan p where p.weekday = extract(isodow from t.tag))
      or (not exists (select 1 from plan) and extract(isodow from t.tag) <= 5)
    )
$$;

revoke all on function app.leave_days(uuid, uuid, date, date) from public, anon, authenticated;

comment on function app.leave_days(uuid, uuid, date, date) is
  'URL-001 (ANN-577): Urlaubstage eines Zeitraums - Arbeitstage nach Wochenplan (ohne Plan Mo-Fr) ohne gesetzliche Feiertage des Bundeslands der Praxis.';

-- -----------------------------------------------------------------------------
-- 3. Die gemeinsame Antragsmechanik: Einstieg, eigene Person, Namen, Rechte
-- -----------------------------------------------------------------------------
-- Gemeinsamer Einstieg aller Antragspfade (Urlaub, Arbeitszeit, Zeitkonto,
-- Erstattungen): angemeldet, darf, hat eine Organisation - in dieser
-- Reihenfolge, erst dann die Eingaben. Ein Patienten- oder Plattformkonto
-- bekommt so immer 42501 (plattform-abschottung.test.ts). Dieselbe Regel wie
-- app.fleet_org; eigene Funktion, damit die Anträge nicht an der Radflotte
-- hängen.
create function app.staff_request_org(p_allowed boolean, p_message text)
returns uuid
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
  if not coalesce(p_allowed, false) then
    raise exception '%', p_message using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception '%', p_message using errcode = '42501';
  end if;
  return v_org;
end;
$$;

revoke all on function app.staff_request_org(boolean, text) from public, anon, authenticated;

comment on function app.staff_request_org(boolean, text) is
  'URL-001: gemeinsamer Einstieg der Antragspfade - angemeldet, berechtigt, Organisation; sonst 42501. Liefert die Organisation.';

-- Der Mitarbeiterdatensatz des angemeldeten Kontos in der eigenen Praxis.
create function app.own_staff_member(p_org uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select sm.id
  from public.user_profiles up
  join public.staff_members sm
    on sm.person_id = up.person_id and sm.organization_id = up.organization_id
  where up.id = auth.uid() and up.organization_id = p_org
  limit 1
$$;

revoke all on function app.own_staff_member(uuid) from public, anon, authenticated;

comment on function app.own_staff_member(uuid) is
  'URL-001: der Mitarbeiterdatensatz des angemeldeten Kontos in der Praxis - oder null (Patienten- und Plattformkonten haben keinen).';

-- Wer Antraege entscheidet: owner (ANN-576, BEF-066 Option 2); wer fremde
-- Urlaubskonten ausserhalb eines offenen Antrags sieht: owner (ANN-580).
create function app.can_decide_staff_requests()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner')
$$;

create function app.can_read_staff_leave_balances()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner')
$$;

-- Wer Urlaub beantragt: jede Praxisrolle mit Mitarbeiterdatensatz.
create function app.can_request_leave()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'team_lead', 'office', 'therapist', 'trainer')
$$;

revoke all on function app.can_decide_staff_requests() from public, anon;
revoke all on function app.can_read_staff_leave_balances() from public, anon;
revoke all on function app.can_request_leave() from public, anon;
grant execute on function app.can_decide_staff_requests() to authenticated;
grant execute on function app.can_read_staff_leave_balances() to authenticated;
grant execute on function app.can_request_leave() to authenticated;

comment on function app.can_decide_staff_requests() is
  'URL-001 (ANN-576): Wer Antraege der Mitarbeitenden entscheidet - owner, nie den eigenen (BEF-066 Option 2). Die eine Stelle fuer die Regel.';
comment on function app.can_read_staff_leave_balances() is
  'URL-001 (ANN-580, BEF-066): Wer fremde Urlaubskonten ausserhalb eines offenen Antrags liest - owner (pflegt die Ansprueche, Hinweispflicht). Die eine Stelle fuer die Regel.';
comment on function app.can_request_leave() is
  'URL-001: Wer Urlaub beantragt - jede Praxisrolle mit Mitarbeiterdatensatz, nie ein Patienten- oder Plattformkonto.';

-- -----------------------------------------------------------------------------
-- 4. Tabellen
-- -----------------------------------------------------------------------------
create table public.staff_leave_entitlements (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  staff_member_id uuid not null references public.staff_members (id) on delete restrict,
  year            smallint not null check (year between 2000 and 2100),
  days            smallint not null check (days between 0 and 60),
  carryover_days  smallint not null default 0 check (carryover_days between 0 and 60),
  updated_at      timestamptz not null default now(),
  updated_by      uuid not null,
  constraint staff_leave_entitlements_one_per_year unique (organization_id, staff_member_id, year)
);

comment on table public.staff_leave_entitlements is
  'URL-001: Urlaubsanspruch einer Person fuer ein Kalenderjahr - Tage und Uebertrag aus dem Vorjahr, eingetragen von owner. Kein automatischer Verfall (Hinweispflicht nach EuGH C-684/16). Beschaeftigtendaten; Datenklasse urlaub: drei Jahre ab Ende des Jahres (ANN-579). Kein Tabellenrecht.';

revoke all on public.staff_leave_entitlements from anon, authenticated;
alter table public.staff_leave_entitlements enable row level security;

create table public.staff_leave_requests (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  staff_member_id uuid not null references public.staff_members (id) on delete restrict,
  kind            text not null default 'leave' check (kind in ('leave', 'cancellation')),
  -- Ein Storno zeigt auf den genehmigten Urlaub, den er aufhebt.
  refers_to       uuid references public.staff_leave_requests (id) on delete cascade,
  starts_on       date not null,
  ends_on         date not null,
  days            smallint not null check (days between 0 and 93),
  -- Ein Urlaub über den Jahreswechsel: so viele seiner Tage zählen zum
  -- Folgejahr (ANN-577).
  days_following_year smallint not null default 0
                    check (days_following_year between 0 and 93 and days_following_year <= days),
  message         text check (message is null or length(message) between 1 and 500),
  status          text not null default 'requested'
                    check (status in ('requested', 'approved', 'rejected', 'withdrawn', 'cancelled')),
  requested_by    uuid not null,
  requested_at    timestamptz not null default now(),
  decided_by      uuid,
  decided_at      timestamptz,
  decision_note   text check (decision_note is null or length(decision_note) between 1 and 500),
  withdrawn_at    timestamptz,
  -- Selbst eingetragen (owner, ANN-576): genehmigt ohne zweite Person.
  self_entered    boolean not null default false,
  constraint staff_leave_requests_period check (ends_on >= starts_on and ends_on - starts_on <= 92),
  constraint staff_leave_requests_reference check (
    (kind = 'leave' and refers_to is null) or (kind = 'cancellation' and refers_to is not null)
  ),
  -- Genehmigt, abgelehnt und storniert tragen ihre Entscheidung; ein
  -- stornierter Urlaub behält die Genehmigung, den Storno trägt sein Antrag.
  constraint staff_leave_requests_decided check (
    (status in ('approved', 'rejected', 'cancelled')) = (decided_at is not null and decided_by is not null)
  ),
  constraint staff_leave_requests_reject_reason check (status <> 'rejected' or decision_note is not null),
  constraint staff_leave_requests_withdrawn check ((status = 'withdrawn') = (withdrawn_at is not null))
);

comment on table public.staff_leave_requests is
  'URL-001 (ANN-576): Urlaubsantraege und Stornos. Beantragt von/am, entschieden von/am, Grund - der Nachweis (ADR-010 Punkt 15). Die Notiz (message) sieht nur die Person selbst (BEF-066, ANN-580). Datenklasse urlaub (genehmigt, storniert: drei Jahre ab Ende des Urlaubsjahres) bzw. urlaub_kurz (abgelehnt, zurueckgezogen: ein Jahr), ANN-579. Kein Tabellenrecht.';
comment on column public.staff_leave_requests.days is
  'Urlaubstage am Server gezaehlt (app.leave_days) beim Beantragen - spaetere Aenderungen am Wochenplan aendern einen Antrag nicht.';

create index staff_leave_requests_staff_idx
  on public.staff_leave_requests (organization_id, staff_member_id, starts_on);
create index staff_leave_requests_open_idx
  on public.staff_leave_requests (organization_id) where status = 'requested';
create index staff_leave_requests_refers_idx
  on public.staff_leave_requests (refers_to) where refers_to is not null;
-- Hoechstens ein offener Storno je Urlaub.
create unique index staff_leave_requests_one_open_cancellation
  on public.staff_leave_requests (refers_to) where kind = 'cancellation' and status = 'requested';

revoke all on public.staff_leave_requests from anon, authenticated;
alter table public.staff_leave_requests enable row level security;

-- Die Abwesenheit, die ein genehmigter Urlaub in die Arbeitszeiten schreibt,
-- kennt ihren Antrag: Ein Storno entfernt genau diese Zeilen, eine von Hand
-- eingetragene bleibt (ANN-578). Faellt der Antrag nach seiner Frist, fallen
-- seine Tage mit (cascade, ANN-579) - sie stuenden sonst unbefristet als
-- Abwesenheit der Person da (Zweitreview).
alter table public.staff_working_hour_exceptions
  add column leave_request_id uuid
    references public.staff_leave_requests (id) on delete cascade;

comment on column public.staff_working_hour_exceptions.leave_request_id is
  'URL-001 (ANN-578): Abwesenheit aus einem genehmigten Urlaubsantrag. Ein Storno entfernt genau diese Zeilen, die Frist des Antrags loescht sie mit (cascade); von Hand eingetragene tragen null.';

create index staff_working_hour_exceptions_leave_idx
  on public.staff_working_hour_exceptions (leave_request_id) where leave_request_id is not null;

-- Gelesen werden die Abweichungen weiter direkt (Kalender, Planung,
-- scheduling/api.ts), aber nur die Spalten, die der Kalender braucht: Bezug
-- auf den Antrag, Urheber und Zeitpunkt markierten sonst genau die Tage, die
-- Urlaub waren - fuer jede Praxisrolle und rueckwirkend (Zweitreview Runde 2,
-- ANN-580). Ein Urlaubstag steht im Kalender wie jede Abwesenheit.
revoke select on public.staff_working_hour_exceptions from authenticated;
grant select (id, organization_id, staff_member_id, on_date, kind, starts_at, ends_at)
  on public.staff_working_hour_exceptions to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Datenklassen und Fristen (ADR-008, ANN-579)
-- -----------------------------------------------------------------------------
insert into public.retention_classes
  (key, basis, legal_reference, anchor, retention_interval, assumption_key, note, sort_order)
values
  ('urlaub', 'intern', 'Par. 195, 199 BGB', 'calendar_year_end', interval '3 years', 'ANN-579',
   'Genehmigte und stornierte Urlaubsantraege und Urlaubsansprueche: drei Jahre ab Ende des Kalenderjahres des Urlaubs bzw. Anspruchs - die Verjaehrung von Anspruechen auf Urlaub und Abgeltung. Keine gesetzliche Aufbewahrungspflicht; offene nie.',
   93),
  ('urlaub_kurz', 'intern', null, 'case_closed', interval '1 year', 'ANN-579',
   'Abgelehnte und zurueckgezogene Urlaubsantraege: ein Jahr nach ihrem Ende (Entscheidung oder Zurueckziehen). Genug fuer Rueckfragen, ohne Verlauf ueber die Person (PROJECT_PRINCIPLES.md 20).',
   94);

insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values
  ('staff_leave_requests', 'urlaub', 'automatisch',
   'Genehmigte und stornierte Urlaubsantraege (URL-001): drei Jahre ab Ende des Urlaubsjahres; nie, solange ein Storno offen ist (ANN-579). Ein Storno faellt mit seinem Urlaub (cascade).',
   221),
  ('staff_leave_requests', 'urlaub_kurz', 'automatisch',
   'Abgelehnte und zurueckgezogene Urlaubsantraege und Stornos (URL-001): ein Jahr nach ihrem Ende; offene nie (ANN-579).',
   223),
  ('staff_leave_entitlements', 'urlaub', 'automatisch',
   'Urlaubsansprueche je Person und Jahr (URL-001): drei Jahre ab Ende des Jahres (ANN-579).',
   222),
  ('staff_working_hour_exceptions', 'urlaub', 'ueber_elterndatensatz',
   'Abwesenheiten aus genehmigtem Urlaub (URL-001, leave_request_id): fallen mit ihrem Antrag (cascade, ANN-579). Von Hand eingetragene Abweichungen bleiben Beschaeftigtendaten ohne Loeschweg.',
   224);

-- -----------------------------------------------------------------------------
-- 6. Hilfen: Name, Urlaubskonto, Wirkung
-- -----------------------------------------------------------------------------
create function app.staff_display_name(p_staff_member_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(btrim(concat_ws(' ', p.given_name, p.family_name)), '')
  from public.staff_members sm
  join public.persons p on p.id = sm.person_id
  where sm.id = p_staff_member_id
$$;

revoke all on function app.staff_display_name(uuid) from public, anon, authenticated;

-- Wer entschieden hat, als Name fuer die Person, die beantragt hat.
create function app.account_display_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(btrim(concat_ws(' ', p.given_name, p.family_name)), '')
  from public.user_profiles up
  join public.persons p on p.id = up.person_id
  where up.id = p_user_id
$$;

revoke all on function app.account_display_name(uuid) from public, anon, authenticated;

-- Das Urlaubskonto einer Person fuer ein Jahr: Anspruch und Uebertrag, was
-- genehmigt und was beantragt ist (getrennt), und der Rest. Ein Urlaub ueber
-- den Jahreswechsel zaehlt mit seinen Tagen je Jahr.
create function app.leave_balance(p_org uuid, p_staff_member_id uuid, p_year integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with anspruch as (
    select e.days, e.carryover_days
    from public.staff_leave_entitlements e
    where e.organization_id = p_org and e.staff_member_id = p_staff_member_id and e.year = p_year
  ),
  tage as (
    select r.status,
           case when extract(year from r.starts_on)::integer = p_year
                then r.days - r.days_following_year
                else r.days_following_year end as tage
    from public.staff_leave_requests r
    where r.organization_id = p_org
      and r.staff_member_id = p_staff_member_id
      and r.kind = 'leave'
      and r.status in ('approved', 'requested')
      and (extract(year from r.starts_on)::integer = p_year
           or extract(year from r.ends_on)::integer = p_year)
  )
  select jsonb_build_object(
    'year', p_year,
    'entitlement', (select a.days from anspruch a),
    'carryover', (select a.carryover_days from anspruch a),
    'approved', coalesce((select sum(t.tage) from tage t where t.status = 'approved'), 0),
    'requested', coalesce((select sum(t.tage) from tage t where t.status = 'requested'), 0),
    'rest', (select a.days + a.carryover_days from anspruch a)
              - coalesce((select sum(t.tage) from tage t where t.status = 'approved'), 0)
  )
$$;

revoke all on function app.leave_balance(uuid, uuid, integer) from public, anon, authenticated;

-- Genehmigter Urlaub anderer im Zeitraum: nur Name und Zeitraum (BEF-066).
create function app.team_leave(p_org uuid, p_without uuid, p_from date, p_to date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'staff_member_id', r.staff_member_id,
           'name', app.staff_display_name(r.staff_member_id),
           'starts_on', r.starts_on,
           'ends_on', r.ends_on
         ) order by r.starts_on, r.ends_on), '[]'::jsonb)
  from public.staff_leave_requests r
  where r.organization_id = p_org
    and r.kind = 'leave'
    and r.status = 'approved'
    and r.staff_member_id is distinct from p_without
    and r.starts_on <= p_to and r.ends_on >= p_from
$$;

revoke all on function app.team_leave(uuid, uuid, date, date) from public, anon, authenticated;

-- Die Wirkung eines genehmigten Urlaubs (ANN-578): je Tag eine Abwesenheit,
-- fuer jede Person - auch wer heute nicht einplanbar ist: Wird sie es spaeter
-- (Kalender, Rolle), sind die Tage schon gesperrt (Zweitreview Runde 2).
-- Kalender, Slotsuche und Trainingstermine (create_training_appointment)
-- pruefen dieselbe Quelle. Abweichende Arbeitszeiten im Zeitraum halten an -
-- die stuenden sonst still neben dem Urlaub. Eine schon von Hand eingetragene
-- Abwesenheit bleibt, wie sie ist. Gesperrt wird die Person wie in
-- set_staff_working_hour_exception (NO KEY: Termine und Antraege derselben
-- Person warten nicht auf den Vorgang), damit kein Block zwischen Pruefung und
-- Eintrag entsteht. `created_by` bleibt leer; der Nachweis ist `decided_by`
-- am Antrag.
create function app.apply_leave(p_org uuid, p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antrag record;
begin
  select r.staff_member_id, r.starts_on, r.ends_on into v_antrag
  from public.staff_leave_requests r
  where r.id = p_request_id and r.organization_id = p_org;

  perform 1 from public.staff_members sm where sm.id = v_antrag.staff_member_id for no key update;

  if exists (
    select 1 from public.staff_working_hour_exceptions e
    where e.organization_id = p_org
      and e.staff_member_id = v_antrag.staff_member_id
      and e.kind = 'block'
      and e.on_date between v_antrag.starts_on and v_antrag.ends_on
  ) then
    raise exception 'working hours exception in period' using errcode = '55000';
  end if;

  insert into public.staff_working_hour_exceptions
    (organization_id, staff_member_id, on_date, kind, created_by, leave_request_id)
  select p_org, v_antrag.staff_member_id, d::date, 'unavailable', null, p_request_id
  from generate_series(v_antrag.starts_on, v_antrag.ends_on, interval '1 day') as d
  where not exists (
    select 1 from public.staff_working_hour_exceptions e
    where e.organization_id = p_org
      and e.staff_member_id = v_antrag.staff_member_id
      and e.on_date = d::date
  );
end;
$$;

revoke all on function app.apply_leave(uuid, uuid) from public, anon, authenticated;

-- Die bestaetigten Termine einer Person in einem Zeitraum - sie werden nach
-- einer Genehmigung genannt, nie still abgesagt (ANN-578).
create function app.appointments_in_leave(p_org uuid, p_staff_member_id uuid, p_from date, p_to date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.appointments a
  join public.organizations o on o.id = a.organization_id
  where a.organization_id = p_org
    and a.staff_member_id = p_staff_member_id
    and a.status = 'confirmed'
    and a.starts_at >= (p_from::timestamp at time zone o.time_zone)
    and a.starts_at < ((p_to + 1)::timestamp at time zone o.time_zone)
$$;

revoke all on function app.appointments_in_leave(uuid, uuid, date, date) from public, anon, authenticated;

-- Dieselben Termine je Tag (Ortszeit der Praxis): Nach der Genehmigung steht
-- jeder Tag mit dem Weg zu „Tag umplanen“ da.
create function app.appointment_days_in_leave(p_org uuid, p_staff_member_id uuid, p_from date, p_to date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('on_date', t.tag, 'appointments', t.anzahl)
                            order by t.tag), '[]'::jsonb)
  from (
    select (a.starts_at at time zone o.time_zone)::date as tag, count(*)::integer as anzahl
    from public.appointments a
    join public.organizations o on o.id = a.organization_id
    where a.organization_id = p_org
      and a.staff_member_id = p_staff_member_id
      and a.status = 'confirmed'
      and a.starts_at >= (p_from::timestamp at time zone o.time_zone)
      and a.starts_at < ((p_to + 1)::timestamp at time zone o.time_zone)
    group by 1
  ) t
$$;

revoke all on function app.appointment_days_in_leave(uuid, uuid, date, date) from public, anon, authenticated;

-- Die Tage mit abweichenden Arbeitszeiten im Zeitraum: An ihnen haelt eine
-- Genehmigung an (app.apply_leave). Genannt werden sie vorher - beim
-- Entscheiden und beim eigenen Eintragen -, damit niemand erst nach dem Tipp
-- erfaehrt, wo er zuerst aendern muss (Praxis-Review).
create function app.exception_days_in_leave(p_org uuid, p_staff_member_id uuid, p_from date, p_to date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(distinct e.on_date order by e.on_date), '[]'::jsonb)
  from public.staff_working_hour_exceptions e
  where e.organization_id = p_org
    and e.staff_member_id = p_staff_member_id
    and e.kind = 'block'
    and e.on_date between p_from and p_to
$$;

revoke all on function app.exception_days_in_leave(uuid, uuid, date, date) from public, anon, authenticated;

-- Ein Zeitraum, wie ihn ein Antrag tragen darf: Ende nicht vor dem Beginn,
-- hoechstens 93 Tage, nicht in der Vergangenheit (Ortszeit der Praxis).
create function app.assert_leave_period(p_org uuid, p_starts_on date, p_ends_on date)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_heute date;
begin
  if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on
     or p_ends_on - p_starts_on > 92 then
    raise exception 'leave period is invalid' using errcode = '22023';
  end if;
  select (now() at time zone o.time_zone)::date into v_heute
  from public.organizations o where o.id = p_org;
  if p_starts_on < v_heute then
    raise exception 'leave must not start in the past' using errcode = '22023';
  end if;
end;
$$;

revoke all on function app.assert_leave_period(uuid, date, date) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 7. Beantragen, zurueckziehen, stornieren, entscheiden
-- -----------------------------------------------------------------------------
create function public.preview_leave(p_starts_on date, p_ends_on date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
  v_tage  integer;
  v_folge integer := 0;
  v_jahr  integer;
begin
  v_org := app.staff_request_org(app.can_request_leave(), 'not allowed to request leave');
  v_staff := app.own_staff_member(v_org);
  if v_staff is null then
    raise exception 'no staff member for this account' using errcode = '22023';
  end if;
  perform app.assert_leave_period(v_org, p_starts_on, p_ends_on);

  v_jahr := extract(year from p_starts_on)::integer;
  v_tage := app.leave_days(v_org, v_staff, p_starts_on, p_ends_on);
  if extract(year from p_ends_on)::integer > v_jahr then
    v_folge := app.leave_days(v_org, v_staff, make_date(v_jahr + 1, 1, 1), p_ends_on);
  end if;

  return jsonb_build_object(
    'days', v_tage,
    'days_following_year', v_folge,
    'balance', app.leave_balance(v_org, v_staff, v_jahr),
    'overlaps_own', exists (
      select 1 from public.staff_leave_requests r
      where r.organization_id = v_org and r.staff_member_id = v_staff
        and r.kind = 'leave' and r.status in ('requested', 'approved')
        and r.starts_on <= p_ends_on and r.ends_on >= p_starts_on
    ),
    'team', app.team_leave(v_org, v_staff, p_starts_on, p_ends_on),
    'self_entered', app.has_any_role('owner'),
    -- Eigene Termine und abweichende Arbeitszeiten im Zeitraum: Wer selbst
    -- eintraegt, plant danach um bzw. aendert vorher (ANN-578).
    'appointment_days', app.appointment_days_in_leave(v_org, v_staff, p_starts_on, p_ends_on),
    'exception_days', app.exception_days_in_leave(v_org, v_staff, p_starts_on, p_ends_on)
  );
end;
$$;

revoke all on function public.preview_leave(date, date) from public, anon;
grant execute on function public.preview_leave(date, date) to authenticated;

comment on function public.preview_leave(date, date) is
  'URL-001: was ein Urlaubsantrag fuer die eigene Person ergaebe - Tage (am Server gezaehlt), Konto, ob er sich mit einem eigenen ueberschneidet, wer zur selben Zeit genehmigt fehlt (nur Name und Zeitraum), die eigenen Termine je Tag und die Tage mit abweichenden Arbeitszeiten im Zeitraum.';

create function public.request_leave(p_starts_on date, p_ends_on date, p_message text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_staff   uuid;
  v_tage    integer;
  v_folge   integer := 0;
  v_jahr    integer;
  v_text    text := nullif(btrim(coalesce(p_message, '')), '');
  v_selbst  boolean;
  v_id      uuid;
begin
  v_org := app.staff_request_org(app.can_request_leave(), 'not allowed to request leave');
  v_staff := app.own_staff_member(v_org);
  if v_staff is null then
    raise exception 'no staff member for this account' using errcode = '22023';
  end if;
  perform app.assert_leave_period(v_org, p_starts_on, p_ends_on);
  if v_text is not null and length(v_text) > 500 then
    raise exception 'message is too long' using errcode = '22023';
  end if;

  -- Zwei eigene Antraege fuer dieselben Tage gibt es nicht. Gesperrt wird die
  -- Person, damit zwei gleichzeitige Antraege nicht beide durchgehen.
  perform 1 from public.staff_members sm where sm.id = v_staff for no key update;
  if exists (
    select 1 from public.staff_leave_requests r
    where r.organization_id = v_org and r.staff_member_id = v_staff
      and r.kind = 'leave' and r.status in ('requested', 'approved')
      and r.starts_on <= p_ends_on and r.ends_on >= p_starts_on
  ) then
    raise exception 'leave overlaps' using errcode = '23P01';
  end if;

  v_jahr := extract(year from p_starts_on)::integer;
  v_tage := app.leave_days(v_org, v_staff, p_starts_on, p_ends_on);
  if v_tage = 0 then
    raise exception 'no working days in period' using errcode = '22023';
  end if;
  if extract(year from p_ends_on)::integer > v_jahr then
    v_folge := app.leave_days(v_org, v_staff, make_date(v_jahr + 1, 1, 1), p_ends_on);
  end if;

  -- Den eigenen Urlaub traegt owner selbst ein (ANN-576).
  v_selbst := app.has_any_role('owner');

  insert into public.staff_leave_requests (
    organization_id, staff_member_id, kind, starts_on, ends_on, days, days_following_year,
    message, status, requested_by, decided_by, decided_at, self_entered
  )
  values (
    v_org, v_staff, 'leave', p_starts_on, p_ends_on, v_tage, v_folge, v_text,
    case when v_selbst then 'approved' else 'requested' end, auth.uid(),
    case when v_selbst then auth.uid() end, case when v_selbst then now() end, v_selbst
  )
  returning id into v_id;

  if v_selbst then
    perform app.apply_leave(v_org, v_id);
  end if;
  return v_id;
end;
$$;

revoke all on function public.request_leave(date, date, text) from public, anon;
grant execute on function public.request_leave(date, date, text) to authenticated;

comment on function public.request_leave(date, date, text) is
  'URL-001 (ANN-576): Urlaub fuer die eigene Person beantragen - die Tage zaehlt der Server, keine Ueberschneidung mit eigenem Urlaub, nicht in der Vergangenheit. owner traegt den eigenen Urlaub direkt ein (genehmigt, self_entered). Kein Auditeintrag (ADR-010 Punkt 15).';

create function public.withdraw_leave_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
begin
  v_org := app.staff_request_org(app.can_request_leave(), 'not allowed to request leave');
  v_staff := app.own_staff_member(v_org);
  update public.staff_leave_requests r
     set status = 'withdrawn', withdrawn_at = now()
   where r.id = p_request_id
     and r.organization_id = v_org
     and r.staff_member_id = v_staff
     and r.status = 'requested';
  if not found then
    raise exception 'leave request not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.withdraw_leave_request(uuid) from public, anon;
grant execute on function public.withdraw_leave_request(uuid) to authenticated;

comment on function public.withdraw_leave_request(uuid) is
  'URL-001: den eigenen offenen Antrag (Urlaub oder Storno) zurueckziehen. Fremde, entschiedene und unbekannte Antraege sind nicht zu unterscheiden.';

create function public.request_leave_cancellation(p_request_id uuid, p_message text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_staff   uuid;
  v_urlaub  record;
  v_heute   date;
  v_text    text := nullif(btrim(coalesce(p_message, '')), '');
  v_selbst  boolean;
  v_id      uuid;
begin
  v_org := app.staff_request_org(app.can_request_leave(), 'not allowed to request leave');
  v_staff := app.own_staff_member(v_org);
  if v_text is not null and length(v_text) > 500 then
    raise exception 'message is too long' using errcode = '22023';
  end if;

  select r.id, r.starts_on, r.ends_on, r.days, r.days_following_year into v_urlaub
  from public.staff_leave_requests r
  where r.id = p_request_id and r.organization_id = v_org and r.staff_member_id = v_staff
    and r.kind = 'leave' and r.status = 'approved'
  for update;
  if not found then
    raise exception 'leave request not found' using errcode = 'P0002';
  end if;

  -- Storniert wird ein Urlaub, der noch nicht begonnen hat. Ein laufender
  -- gaebe sonst Tage frei, die schon genommen sind (ANN-576).
  select (now() at time zone o.time_zone)::date into v_heute
  from public.organizations o where o.id = v_org;
  if v_urlaub.starts_on < v_heute then
    raise exception 'leave already started' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.staff_leave_requests r
    where r.refers_to = v_urlaub.id and r.kind = 'cancellation' and r.status = 'requested'
  ) then
    raise exception 'cancellation already requested' using errcode = '55000';
  end if;

  v_selbst := app.has_any_role('owner');
  insert into public.staff_leave_requests (
    organization_id, staff_member_id, kind, refers_to, starts_on, ends_on, days,
    days_following_year, message, status, requested_by, decided_by, decided_at, self_entered
  )
  values (
    v_org, v_staff, 'cancellation', v_urlaub.id, v_urlaub.starts_on, v_urlaub.ends_on,
    v_urlaub.days, v_urlaub.days_following_year, v_text,
    case when v_selbst then 'approved' else 'requested' end, auth.uid(),
    case when v_selbst then auth.uid() end, case when v_selbst then now() end, v_selbst
  )
  returning id into v_id;

  if v_selbst then
    update public.staff_leave_requests set status = 'cancelled' where id = v_urlaub.id;
    delete from public.staff_working_hour_exceptions e where e.leave_request_id = v_urlaub.id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.request_leave_cancellation(uuid, text) from public, anon;
grant execute on function public.request_leave_cancellation(uuid, text) to authenticated;

comment on function public.request_leave_cancellation(uuid, text) is
  'URL-001 (ANN-576): einen genehmigten eigenen Urlaub stornieren - als neuer Antrag mit Bezug, der wieder entschieden wird; owner storniert den eigenen direkt. Nur vor Beginn des Urlaubs.';

create function public.decide_leave_request(p_request_id uuid, p_approve boolean, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_antrag  record;
  v_text    text := nullif(btrim(coalesce(p_note, '')), '');
begin
  v_org := app.staff_request_org(app.can_decide_staff_requests(), 'not allowed to decide requests');
  if p_approve is null then
    raise exception 'decision is required' using errcode = '22023';
  end if;
  if v_text is not null and length(v_text) > 500 then
    raise exception 'note is too long' using errcode = '22023';
  end if;
  if not p_approve and v_text is null then
    raise exception 'rejection needs a reason' using errcode = '22023';
  end if;

  select r.* into v_antrag
  from public.staff_leave_requests r
  where r.id = p_request_id and r.organization_id = v_org and r.status = 'requested'
  for update;
  if not found then
    raise exception 'leave request not found' using errcode = 'P0002';
  end if;
  -- Wer selbst beantragt, entscheidet nicht ueber den eigenen Antrag (ANN-576).
  if v_antrag.staff_member_id = app.own_staff_member(v_org) or v_antrag.requested_by = auth.uid() then
    raise exception 'not allowed to decide own request' using errcode = '42501';
  end if;

  if not p_approve then
    update public.staff_leave_requests
       set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = v_text
     where id = v_antrag.id;
    return jsonb_build_object('status', 'rejected', 'appointments', 0, 'appointment_days', '[]'::jsonb);
  end if;

  if v_antrag.kind = 'leave' then
    -- Inzwischen genehmigter eigener Urlaub fuer dieselben Tage? Dann nicht.
    if exists (
      select 1 from public.staff_leave_requests r
      where r.organization_id = v_org and r.staff_member_id = v_antrag.staff_member_id
        and r.id <> v_antrag.id and r.kind = 'leave' and r.status = 'approved'
        and r.starts_on <= v_antrag.ends_on and r.ends_on >= v_antrag.starts_on
    ) then
      raise exception 'leave overlaps' using errcode = '23P01';
    end if;
    update public.staff_leave_requests
       set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_note = v_text
     where id = v_antrag.id;
    perform app.apply_leave(v_org, v_antrag.id);
    return jsonb_build_object(
      'status', 'approved',
      'appointments', app.appointments_in_leave(
        v_org, v_antrag.staff_member_id, v_antrag.starts_on, v_antrag.ends_on),
      'appointment_days', app.appointment_days_in_leave(
        v_org, v_antrag.staff_member_id, v_antrag.starts_on, v_antrag.ends_on)
    );
  end if;

  -- Ein Storno: der Urlaub ist aufgehoben, seine Abwesenheiten fallen - nur,
  -- solange er nicht begonnen hat (wie beim Beantragen des Stornos).
  if v_antrag.starts_on < (
    select (now() at time zone o.time_zone)::date from public.organizations o where o.id = v_org
  ) then
    raise exception 'leave already started' using errcode = '55000';
  end if;
  update public.staff_leave_requests
     set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_note = v_text
   where id = v_antrag.id;
  update public.staff_leave_requests
     set status = 'cancelled'
   where id = v_antrag.refers_to and status = 'approved';
  delete from public.staff_working_hour_exceptions e where e.leave_request_id = v_antrag.refers_to;
  return jsonb_build_object('status', 'approved', 'appointments', 0, 'appointment_days', '[]'::jsonb);
end;
$$;

revoke all on function public.decide_leave_request(uuid, boolean, text) from public, anon;
grant execute on function public.decide_leave_request(uuid, boolean, text) to authenticated;

comment on function public.decide_leave_request(uuid, boolean, text) is
  'URL-001 (ANN-576, ANN-578): owner entscheidet einen offenen Antrag, nie den eigenen. Ablehnen nur mit Grund. Genehmigter Urlaub sperrt seine Tage in den Arbeitszeiten; ein genehmigter Storno hebt Urlaub und Sperre auf. Antwort: Zustand, Zahl der bestaetigten Termine im Zeitraum und je Tag (zum Umplanen).';

create function public.set_leave_entitlement(
  p_staff_member_id uuid,
  p_year            integer,
  p_days            integer,
  p_carryover_days  integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  v_org := app.staff_request_org(app.can_manage_staff_employment(), 'not allowed to manage leave entitlements');
  perform app.assert_staff_member_in_org(p_staff_member_id, v_org);
  if p_staff_member_id is null then
    raise exception 'staff member is required' using errcode = '22023';
  end if;
  if p_year is null or p_year not between 2000 and 2100
     or p_days is null or p_days not between 0 and 60
     or coalesce(p_carryover_days, 0) not between 0 and 60 then
    raise exception 'leave entitlement is invalid' using errcode = '22023';
  end if;

  insert into public.staff_leave_entitlements
    (organization_id, staff_member_id, year, days, carryover_days, updated_by)
  values (v_org, p_staff_member_id, p_year, p_days, coalesce(p_carryover_days, 0), auth.uid())
  on conflict (organization_id, staff_member_id, year)
  do update set days = excluded.days,
                carryover_days = excluded.carryover_days,
                updated_at = now(),
                updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.set_leave_entitlement(uuid, integer, integer, integer) from public, anon;
grant execute on function public.set_leave_entitlement(uuid, integer, integer, integer) to authenticated;

comment on function public.set_leave_entitlement(uuid, integer, integer, integer) is
  'URL-001: Urlaubsanspruch und Uebertrag einer Person fuer ein Jahr eintragen - nur owner (Beschaeftigungsangaben, app.can_manage_staff_employment).';

-- -----------------------------------------------------------------------------
-- 8. Lesen: Urlaub in einem Aufruf
-- -----------------------------------------------------------------------------
create function public.list_leave(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org      uuid;
  v_staff    uuid;
  v_jahr     integer;
  v_entsch   boolean;
  v_konten   boolean;
  v_heute    date;
  v_land     text;
begin
  v_org := app.staff_request_org(app.can_request_leave(), 'not allowed to read leave');
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'leave window is invalid' using errcode = '22023';
  end if;
  v_staff := app.own_staff_member(v_org);
  v_jahr := extract(year from p_from)::integer;
  v_entsch := app.can_decide_staff_requests();
  v_konten := app.can_read_staff_leave_balances();
  select (now() at time zone o.time_zone)::date, o.federal_state into v_heute, v_land
  from public.organizations o where o.id = v_org;

  return jsonb_build_object(
    'my_staff_member_id', v_staff,
    'can_decide', v_entsch,
    'self_entered', app.has_any_role('owner'),
    'can_manage_entitlements', app.can_manage_staff_employment(),
    -- Fuer die Feiertage im Kalender beim Beantragen (ANN-577).
    'federal_state', v_land,
    'balance', case when v_staff is null then null else app.leave_balance(v_org, v_staff, v_jahr) end,
    -- Eigene Antraege mit allem, auch der Nachricht und der Entscheidung.
    'own', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'kind', r.kind, 'refers_to', r.refers_to,
               'starts_on', r.starts_on, 'ends_on', r.ends_on, 'days', r.days,
               'message', r.message, 'status', r.status, 'requested_at', r.requested_at,
               'decided_at', r.decided_at, 'decided_by_name', app.account_display_name(r.decided_by),
               'decision_note', r.decision_note, 'self_entered', r.self_entered,
               'open_cancellation', exists (
                 select 1 from public.staff_leave_requests c
                 where c.refers_to = r.id and c.kind = 'cancellation' and c.status = 'requested')
             ) order by r.starts_on desc, r.requested_at desc)
      from public.staff_leave_requests r
      where r.organization_id = v_org and r.staff_member_id = v_staff
        and (r.status = 'requested' or r.ends_on >= p_from or r.decided_at >= now() - interval '30 days')
    ), '[]'::jsonb),
    -- Fuer die Entscheidenden: offene Antraege anderer mit Konto, wer zur
    -- selben Zeit fehlt und wie viele Termine im Zeitraum liegen.
    'to_decide', case when not v_entsch then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'kind', r.kind, 'refers_to', r.refers_to,
               'staff_member_id', r.staff_member_id,
               'name', app.staff_display_name(r.staff_member_id),
               'starts_on', r.starts_on, 'ends_on', r.ends_on, 'days', r.days,
               -- Das Konto des Beginnjahrs zaehlt nur dessen Tage.
               'days_following_year', r.days_following_year,
               -- Ohne die Notiz: die sieht nur die Person (BEF-066, ANN-580).
               'requested_at', r.requested_at,
               'balance', app.leave_balance(v_org, r.staff_member_id,
                                            extract(year from r.starts_on)::integer),
               'team', app.team_leave(v_org, r.staff_member_id, r.starts_on, r.ends_on),
               'appointments', app.appointments_in_leave(v_org, r.staff_member_id, r.starts_on, r.ends_on),
               'exception_days', case when r.kind = 'leave' then
                 app.exception_days_in_leave(v_org, r.staff_member_id, r.starts_on, r.ends_on)
                 else '[]'::jsonb end
             ) order by r.requested_at)
      from public.staff_leave_requests r
      where r.organization_id = v_org and r.status = 'requested'
        and r.staff_member_id is distinct from v_staff
    ), '[]'::jsonb) end,
    -- Fuer alle: genehmigter Urlaub anderer im Fenster - nur Name und
    -- Zeitraum, und nur ab heute: kein Verlauf ueber die Kolleg:innen
    -- (Zweitreview). owner pflegt die Konten und sieht auch Vergangenes.
    'team', app.team_leave(
      v_org, v_staff,
      case when app.has_any_role('owner') then p_from else greatest(p_from, v_heute) end,
      p_to),
    -- Fremde Urlaubskonten nur fuer owner (ANN-580), je Person, ohne Summe.
    'balances', case when not v_konten then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
               'staff_member_id', sm.id,
               'name', app.staff_display_name(sm.id),
               'balance', app.leave_balance(v_org, sm.id, v_jahr),
               -- Den Anspruch des Folgejahrs traegt owner vorab ein; die
               -- Seite belegt ihn damit vor, statt ihn leer zu ueberschreiben.
               'next_balance', app.leave_balance(v_org, sm.id, v_jahr + 1)
             ) order by app.staff_display_name(sm.id))
      from public.staff_members sm
      where sm.organization_id = v_org and sm.employment_status = 'active'
    ), '[]'::jsonb) end
  );
end;
$$;

revoke all on function public.list_leave(date, date) from public, anon;
grant execute on function public.list_leave(date, date) to authenticated;

comment on function public.list_leave(date, date) is
  'URL-001: Urlaub in einem Aufruf - eigene Antraege mit Notiz und Konto ganz; fuer owner die offenen Antraege anderer mit Konto, ohne Notiz; fuer alle genehmigter Urlaub anderer nur mit Name und Zeitraum ab heute; fremde Konten nur owner (BEF-066, ANN-580). Ohne Summe ueber alle (PROJECT_PRINCIPLES.md 20).';

-- -----------------------------------------------------------------------------
-- 9. Arbeitszeiten: kein Urlaubstag wird still ueberschrieben (ANN-578)
-- -----------------------------------------------------------------------------
-- Stand LOG-001b, dazu zwei Dinge (Zweitreview): Die Person wird gesperrt wie
-- in app.apply_leave, und ein Tag im Zeitraum eines genehmigten Urlaubs
-- laesst sich hier weder freigeben noch mit Bloecken belegen - der Urlaub
-- bliebe sonst genehmigt, die Tage aber buchbar. Erst stornieren (55000).
CREATE OR REPLACE FUNCTION public.set_staff_working_hour_exception(p_staff_member_id uuid, p_date date, p_unavailable boolean, p_blocks jsonb DEFAULT '[]'::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor    uuid;
  v_org      uuid;
  v_tz       text;
  v_abwesend boolean;
  v_alt      jsonb;
  v_neu      jsonb;
  v_alt_ids  uuid[];
  v_neu_ids  uuid[];
  v_aktion   text;
  v_art      text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_working_hours() then
    raise exception 'not allowed to manage working hours' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage working hours' using errcode = '42501';
  end if;

  select o.time_zone into v_tz
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  if p_date is null then
    raise exception 'date is required' using errcode = '22023';
  end if;

  if not app.is_assignable_therapist(p_staff_member_id, v_org) then
    raise exception 'staff member not assignable' using errcode = 'P0002';
  end if;

  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' then
    raise exception 'blocks must be an array' using errcode = '22023';
  end if;

  v_abwesend := coalesce(p_unavailable, false);

  if v_abwesend and jsonb_array_length(p_blocks) > 0 then
    raise exception 'an unavailable day cannot have blocks' using errcode = '22023';
  end if;

  -- URL-001: dieselbe Sperre wie app.apply_leave, dann der Urlaubstag.
  perform 1 from public.staff_members sm where sm.id = p_staff_member_id for no key update;

  -- Gegen den genehmigten Urlaub, nicht gegen die Zeile: Ein Tag, der vor
  -- der Genehmigung von Hand abwesend stand, gehoert ebenso dazu (Zweitreview
  -- Runde 2).
  if exists (
    select 1 from public.staff_leave_requests r
    where r.organization_id = v_org
      and r.staff_member_id = p_staff_member_id
      and r.kind = 'leave'
      and r.status = 'approved'
      and p_date between r.starts_on and r.ends_on
  ) then
    raise exception 'day is part of approved leave' using errcode = '55000';
  end if;

  select coalesce(
           jsonb_agg(
             jsonb_build_array(a.kind, a.starts_at::text, a.ends_at::text)
             order by a.kind, a.starts_at nulls first
           ),
           '[]'::jsonb
         ),
         coalesce(array_agg(a.id order by a.kind, a.starts_at nulls first), '{}'::uuid[])
    into v_alt, v_alt_ids
  from public.staff_working_hour_exceptions a
  where a.staff_member_id = p_staff_member_id
    and a.organization_id = v_org
    and a.on_date = p_date;

  if v_abwesend then
    v_neu := jsonb_build_array(jsonb_build_array('unavailable', null, null));
  else
    begin
      select coalesce(
               jsonb_agg(jsonb_build_array('block', w.von::text, w.bis::text) order by w.von),
               '[]'::jsonb
             )
        into v_neu
      from (
        select (b ->> 'von')::time as von, (b ->> 'bis')::time as bis
        from jsonb_array_elements(p_blocks) as b
      ) w;
    exception
      when invalid_datetime_format or datetime_field_overflow
           or invalid_text_representation then
        raise exception 'working hour block is invalid' using errcode = '22023';
    end;
  end if;

  if v_alt = v_neu then
    return jsonb_array_length(v_alt);
  end if;

  delete from public.staff_working_hour_exceptions
   where staff_member_id = p_staff_member_id
     and organization_id = v_org
     and on_date = p_date;

  if v_abwesend then
    with eingefuegt as (
      insert into public.staff_working_hour_exceptions (
        organization_id, staff_member_id, on_date, kind, created_by
      )
      values (v_org, p_staff_member_id, p_date, 'unavailable', v_actor)
      returning id
    )
    select coalesce(array_agg(id), '{}'::uuid[]) into v_neu_ids from eingefuegt;
  else
    begin
      with eingefuegt as (
        insert into public.staff_working_hour_exceptions (
          organization_id, staff_member_id, on_date, kind, starts_at, ends_at, created_by
        )
        select v_org, p_staff_member_id, p_date, 'block',
               (b ->> 'von')::time, (b ->> 'bis')::time, v_actor
        from jsonb_array_elements(p_blocks) as b
        returning id
      )
      select coalesce(array_agg(id), '{}'::uuid[]) into v_neu_ids from eingefuegt;
    exception
      when exclusion_violation then
        raise exception 'working hours overlap' using errcode = '23P01';
      when check_violation or not_null_violation
           or invalid_datetime_format or datetime_field_overflow then
        raise exception 'working hour block is invalid' using errcode = '22023';
    end;
  end if;

  v_aktion := app.working_hour_action(
    jsonb_array_length(v_alt), jsonb_array_length(v_neu)
  );

  -- Art der organisatorischen Aktion, nicht ihre Uhrzeiten.
  v_art := case
             when v_aktion = 'removed' then null
             when v_abwesend then 'unavailable'
             else 'block'
           end;


  return jsonb_array_length(v_neu);
end;
$function$;

-- -----------------------------------------------------------------------------
-- 10. Loeschlauf (ADR-008, ANN-579)
-- -----------------------------------------------------------------------------
create function app.delete_due_staff_leave(p_org uuid, p_time_zone text, p_run uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anzahl integer := 0;
  v_teil   integer;
begin
  -- Genehmigt und storniert: drei Jahre ab Ende des Kalenderjahres, in dem
  -- der Urlaub endet. Ein Storno faellt mit seinem Urlaub (cascade).
  with faellig as (
    select r.id, r.organization_id,
           app.retention_due_at(
             make_date(extract(year from r.ends_on)::integer, 12, 31),
             app.retention_interval('urlaub'),
             p_time_zone
           ) as due_at
    from public.staff_leave_requests r
    where r.organization_id = p_org and r.kind = 'leave' and r.status in ('approved', 'cancelled')
      and not exists (
        select 1 from public.staff_leave_requests c
        where c.refers_to = r.id and c.status = 'requested'
      )
  ),
  geloescht as (
    delete from public.staff_leave_requests r
    using faellig f
    where r.id = f.id and f.due_at <= now()
    returning r.id, r.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run, 'staff_leave_requests', g.id, 'urlaub', f.due_at
  from geloescht g join faellig f on f.id = g.id;
  get diagnostics v_teil = row_count;
  v_anzahl := v_anzahl + v_teil;

  -- Abgelehnt und zurueckgezogen - auch ein abgelehnter oder
  -- zurueckgezogener Storno: ein Jahr nach ihrem Ende.
  with faellig as (
    select r.id, r.organization_id,
           app.retention_due_at(
             (coalesce(r.decided_at, r.withdrawn_at) at time zone p_time_zone)::date,
             app.retention_interval('urlaub_kurz'),
             p_time_zone
           ) as due_at
    from public.staff_leave_requests r
    where r.organization_id = p_org and r.status in ('rejected', 'withdrawn')
  ),
  geloescht as (
    delete from public.staff_leave_requests r
    using faellig f
    where r.id = f.id and f.due_at <= now()
    returning r.id, r.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run, 'staff_leave_requests', g.id, 'urlaub_kurz', f.due_at
  from geloescht g join faellig f on f.id = g.id;
  get diagnostics v_teil = row_count;
  v_anzahl := v_anzahl + v_teil;

  -- Ansprueche: drei Jahre ab Ende ihres Jahres.
  with faellig as (
    select e.id, e.organization_id,
           app.retention_due_at(
             make_date(e.year, 12, 31),
             app.retention_interval('urlaub'),
             p_time_zone
           ) as due_at
    from public.staff_leave_entitlements e
    where e.organization_id = p_org
  ),
  geloescht as (
    delete from public.staff_leave_entitlements e
    using faellig f
    where e.id = f.id and f.due_at <= now()
    returning e.id, e.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run, 'staff_leave_entitlements', g.id, 'urlaub', f.due_at
  from geloescht g join faellig f on f.id = g.id;
  get diagnostics v_teil = row_count;
  v_anzahl := v_anzahl + v_teil;

  return v_anzahl;
end;
$$;

revoke all on function app.delete_due_staff_leave(uuid, text, uuid) from public, anon, authenticated;

comment on function app.delete_due_staff_leave(uuid, text, uuid) is
  'URL-001 (ANN-579): loescht faellige Urlaubsantraege und -ansprueche mit Eintrag im Loeschjournal. Aufgerufen aus public.apply_retention().';

-- Der Lauf ruft den Urlaub mit auf - sonst unveraendert (Stand FLT-001).
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
                + v_radflotte + v_urlaub;

    if v_fotos + v_akten + v_training + v_termine + v_audit + v_zugang + v_warte + v_aufgaben + v_anrufe
       + v_konten + v_plattform + v_auftraege + v_journal + v_wuensche + v_nachrichten + v_anhaenge
       + v_radflotte + v_urlaub > 0
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
          'legal_hold_gehalten', v_gehalten,
          'steuerfrist_gehalten', v_steuer
        )
      );
    end if;
  end loop;

  return v_gesamt;
end;
$function$;

-- Nach einem Restore werden Urlaubsantraege und -ansprueche wie alle anderen
-- erneut geloescht - vor Mitarbeitenden und Personen.
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
