-- =============================================================================
-- ZK-001 Zeitkonto: Mehrarbeit und Freizeitausgleich mit Beginn und Ende
-- (Überholung 9, Pfad A)
--
-- Mitarbeitende tragen Mehrarbeit und Freizeitausgleich selbst ein; ein
-- Eintrag gilt sofort und zählt im Saldo - kein Antrag (ANN-593). owner weist
-- mit Grund zurück, nie im eigenen Konto; owner und Büro tragen auch für
-- andere ein und buchen Korrekturen (ANN-594). Ein Freizeitausgleich wirkt
-- als Abweichung in den Arbeitszeiten: Die übrigen Blöcke des Tages bleiben,
-- die freie Zeit ist nicht buchbar; zurückgewiesen oder zurückgenommen fällt
-- die Abweichung (ANN-595). Sichtbarkeit nach BEF-066 Option 2 mit Büro
-- (ANN-596). Fristen nach der Spezifikation: gültige Einträge drei Jahre ab
-- Ende ihres Jahres, ihr Saldo bleibt als Übertrag stehen; zurückgewiesene
-- und zurückgenommene ein Jahr (ANN-597).
--
-- Nur über SECURITY-DEFINER-Funktionen, kein Tabellenrecht (ADR-004). Kein
-- Auditeintrag: eingetragen von/am, zurückgewiesen von/am und Grund stehen
-- am Eintrag (ADR-010 Punkt 15). Keine Auswertung über Personen, keine
-- Ableitung aus Kalender oder Touren (PROJECT_PRINCIPLES.md 16, 20).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Wer ein Zeitkonto führt, wer für andere bucht
-- -----------------------------------------------------------------------------
-- Ein Zeitkonto hat jede Praxisrolle mit Mitarbeiterdatensatz - wie Urlaub und
-- Arbeitszeit. Für andere tragen owner und Büro ein und sehen deren Konten
-- (BEF-066 Option 2 mit Büro); zurückweisen kann nur owner
-- (app.can_decide_staff_requests, ANN-576).
create function app.can_keep_time_account()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'team_lead', 'office', 'therapist', 'trainer')
$$;

create function app.can_book_time_accounts()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'office')
$$;

revoke all on function app.can_keep_time_account() from public, anon;
revoke all on function app.can_book_time_accounts() from public, anon;
grant execute on function app.can_keep_time_account() to authenticated;
grant execute on function app.can_book_time_accounts() to authenticated;

comment on function app.can_keep_time_account() is
  'ZK-001: Wer ein Zeitkonto führt - jede Praxisrolle mit Mitarbeiterdatensatz, nie ein Patienten- oder Plattformkonto.';
comment on function app.can_book_time_accounts() is
  'ZK-001 (ANN-594, BEF-066 Option 2 mit Büro): Wer für andere einträgt, Korrekturen bucht und fremde Zeitkonten sieht - owner und Büro. Die eine Stelle für die Regel.';

-- -----------------------------------------------------------------------------
-- 2. Die Tabelle
-- -----------------------------------------------------------------------------
create table public.staff_time_account_entries (
  id                uuid primary key default extensions.gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,
  staff_member_id   uuid not null references public.staff_members (id) on delete restrict,
  -- 'overtime' Mehrarbeit (+), 'time_off' Freizeitausgleich (-), 'correction'
  -- Korrektur (+/-, owner und Büro, ohne Lage: kein Arbeitszeitnachweis),
  -- 'carryover' der Saldo der nach ihrer Frist gelöschten Einträge eines
  -- Jahres (ANN-597, nur der Löschlauf schreibt ihn).
  kind              text not null check (kind in ('overtime', 'time_off', 'correction', 'carryover')),
  on_date           date not null,
  -- Ortszeit der Praxis; Mehrarbeit und Freizeitausgleich immer mit Lage
  -- (ANN-593, EuGH C-55/18).
  starts_at         time,
  ends_at           time,
  -- Wirkung auf den Saldo in Minuten, am Server berechnet.
  minutes           integer not null
                      check ((minutes <> 0 or kind = 'carryover') and minutes between -1000000 and 1000000),
  -- Grund der Person; bei einer Korrektur Pflicht.
  note              text check (note is null or length(note) between 1 and 500),
  status            text not null default 'valid' check (status in ('valid', 'rejected', 'withdrawn')),
  -- Leer nur beim Übertrag: den schreibt der Löschlauf, keine Person.
  entered_by        uuid,
  entered_at        timestamptz not null default now(),
  -- Von owner oder Büro für eine andere Person eingetragen.
  entered_for_other boolean not null default false,
  rejected_by       uuid,
  rejected_at       timestamptz,
  rejection_note    text check (rejection_note is null or length(rejection_note) between 1 and 500),
  withdrawn_at      timestamptz,
  constraint staff_time_account_entries_times check (
    (kind in ('correction', 'carryover') and starts_at is null and ends_at is null
     and (kind = 'carryover' or note is not null))
    or (kind in ('overtime', 'time_off') and starts_at is not null and ends_at is not null
        and starts_at < ends_at)
  ),
  constraint staff_time_account_entries_sign check (
    kind in ('correction', 'carryover') or (kind = 'overtime' and minutes > 0)
    or (kind = 'time_off' and minutes < 0)
  ),
  constraint staff_time_account_entries_carryover check (
    (kind = 'carryover') = (entered_by is null)
    and (kind <> 'carryover' or (status = 'valid' and not entered_for_other))
  ),
  constraint staff_time_account_entries_rejected check (
    (status = 'rejected') = (rejected_at is not null and rejected_by is not null and rejection_note is not null)
  ),
  constraint staff_time_account_entries_withdrawn check ((status = 'withdrawn') = (withdrawn_at is not null)),
  -- Zwei gültige Einträge derselben Person überschneiden sich am Tag nie.
  constraint staff_time_account_entries_no_overlap exclude using gist (
    staff_member_id with =,
    on_date with =,
    app.timerange(starts_at, ends_at, '[)') with &&
  ) where (status = 'valid' and kind in ('overtime', 'time_off'))
);

comment on table public.staff_time_account_entries is
  'ZK-001 (ANN-593 bis ANN-597): Einträge im Zeitkonto - Mehrarbeit und Freizeitausgleich mit Datum, Beginn und Ende, Korrekturen durch owner und Büro, Überträge des Löschlaufs. Gelten sofort; zurückgewiesen (owner, mit Grund) oder zurückgenommen zählen sie nicht. Eingetragen von/am, zurückgewiesen von/am und Grund sind der Nachweis (ADR-010 Punkt 15). Datenklassen zeitkonto (gültige: drei Jahre ab Ende des Jahres, der Saldo bleibt als Übertrag) und zeitkonto_kurz (zurückgewiesene und zurückgenommene: ein Jahr); Überträge bleiben Beschäftigtendaten (ANN-030). Kein Tabellenrecht.';

create index staff_time_account_entries_staff_idx
  on public.staff_time_account_entries (organization_id, staff_member_id, on_date);
-- Je Person und Jahr ein Übertrag (sein Datum ist der 31. Dezember).
create unique index staff_time_account_entries_one_carryover
  on public.staff_time_account_entries (staff_member_id, on_date)
  where kind = 'carryover';

revoke all on public.staff_time_account_entries from anon, authenticated;
alter table public.staff_time_account_entries enable row level security;

-- Der Freizeitausgleich steht als Abweichung in den Arbeitszeiten und kennt
-- seinen Eintrag: Zurückgewiesen oder zurückgenommen wird er gelöscht, fällt
-- der Eintrag, fällt er mit (cascade). Gelesen wird die Spalte nicht: Das
-- Spaltenrecht der Abweichungen (URL-001) nennt sie nicht.
alter table public.staff_working_hour_exceptions
  add column time_account_entry_id uuid
    references public.staff_time_account_entries (id) on delete cascade;

comment on column public.staff_working_hour_exceptions.time_account_entry_id is
  'ZK-001 (ANN-595): Abweichung aus einem Freizeitausgleich - die übrigen Blöcke des Tages oder die ganztägige Abwesenheit. Fällt mit dem Eintrag. Von Hand eingetragene tragen null.';

create index staff_working_hour_exceptions_time_account_idx
  on public.staff_working_hour_exceptions (time_account_entry_id)
  where time_account_entry_id is not null;

-- -----------------------------------------------------------------------------
-- 3. Datenklassen und Fristen (ADR-008, ANN-597)
-- -----------------------------------------------------------------------------
insert into public.retention_classes
  (key, basis, legal_reference, anchor, retention_interval, assumption_key, note, sort_order)
values
  ('zeitkonto', 'intern', 'Par. 195, 199 BGB; Par. 16 Abs. 2 ArbZG', 'calendar_year_end', interval '3 years',
   'ANN-597',
   'Gültige Einträge im Zeitkonto: drei Jahre ab Ende des Kalenderjahres ihres Datums - die Verjährung von Ansprüchen auf Ausgleich oder Vergütung; Par. 16 Abs. 2 ArbZG verlangt mindestens zwei Jahre. Ihr Saldo bleibt als Übertrag des Jahres stehen.',
   97),
  ('zeitkonto_kurz', 'intern', null, 'case_closed', interval '1 year', 'ANN-597',
   'Zurückgewiesene und zurückgenommene Einträge im Zeitkonto: ein Jahr nach Zurückweisung bzw. Rücknahme. Genug für Rückfragen, ohne Verlauf über die Person (PROJECT_PRINCIPLES.md 20).',
   98);

insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values
  ('staff_time_account_entries', 'zeitkonto', 'automatisch',
   'Gültige Einträge im Zeitkonto (ZK-001): drei Jahre ab Ende des Jahres ihres Datums; ihr Saldo bleibt als Übertrag (ANN-597).',
   228),
  ('staff_time_account_entries', 'zeitkonto_kurz', 'automatisch',
   'Zurückgewiesene und zurückgenommene Einträge im Zeitkonto (ZK-001): ein Jahr nach ihrem Ende (ANN-597).',
   229),
  ('staff_time_account_entries', 'beschaeftigtendaten', 'keine',
   'Überträge im Zeitkonto (ZK-001, kind carryover): der Saldo gelöschter Einträge je Jahr, ohne Lage und Grund; Frist offen wie die übrigen Beschäftigtendaten (ANN-030, ANN-597).',
   230),
  ('staff_working_hour_exceptions', 'zeitkonto', 'ueber_elterndatensatz',
   'Abweichungen aus einem Freizeitausgleich (ZK-001, time_account_entry_id): fallen mit ihrem Eintrag - zurückgewiesen, zurückgenommen oder nach seiner Frist (cascade, ANN-595, ANN-597).',
   231);

-- Fällt ein gültiger Eintrag nach seiner Frist, bleibt sein Saldo als Übertrag
-- seines Jahres stehen (ANN-597, Zweitreview B2). Der Trigger hängt am
-- Löschen selbst: So stimmt der Saldo nach dem Lauf und ebenso, wenn
-- public.reapply_deletion_journal() nach einem Restore erneut löscht.
create function app.carry_over_time_account_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.staff_time_account_entries
    (organization_id, staff_member_id, kind, on_date, minutes, status, entered_by)
  values (old.organization_id, old.staff_member_id, 'carryover',
          make_date(extract(year from old.on_date)::integer, 12, 31), old.minutes, 'valid', null)
  on conflict (staff_member_id, on_date) where kind = 'carryover'
  do update set minutes = public.staff_time_account_entries.minutes + excluded.minutes;
  return old;
end;
$$;

revoke all on function app.carry_over_time_account_entry() from public, anon, authenticated;

create trigger staff_time_account_entries_carry_over
  before delete on public.staff_time_account_entries
  for each row
  when (old.status = 'valid' and old.kind <> 'carryover')
  execute function app.carry_over_time_account_entry();

-- -----------------------------------------------------------------------------
-- 4. Hilfen: Saldo, wessen Konto, was ein Eintrag bewirkt
-- -----------------------------------------------------------------------------
-- Der Saldo: die Summe der gültigen Einträge in Minuten.
create function app.time_account_balance(p_org uuid, p_staff_member_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(e.minutes), 0)::integer
  from public.staff_time_account_entries e
  where e.organization_id = p_org and e.staff_member_id = p_staff_member_id and e.status = 'valid'
$$;

revoke all on function app.time_account_balance(uuid, uuid) from public, anon, authenticated;

-- Wessen Konto: ohne Angabe das eigene; ein anderes nur für owner und Büro.
-- Ein fremdes ohne Recht und ein unbekanntes sind nicht zu unterscheiden
-- (P0002, PROJECT_PRINCIPLES.md 13).
create function app.time_account_target(p_org uuid, p_staff_member_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_eigen uuid := app.own_staff_member(p_org);
begin
  if p_staff_member_id is null or p_staff_member_id = v_eigen then
    if v_eigen is null then
      raise exception 'no staff member for this account' using errcode = '22023';
    end if;
    return v_eigen;
  end if;
  if not app.can_book_time_accounts() or not exists (
    select 1 from public.staff_members sm
    where sm.id = p_staff_member_id and sm.organization_id = p_org
  ) then
    raise exception 'time account not found' using errcode = 'P0002';
  end if;
  return p_staff_member_id;
end;
$$;

revoke all on function app.time_account_target(uuid, uuid) from public, anon, authenticated;

-- Was gegen einen Eintrag spricht und was er bewirkt (ANN-593, ANN-595):
--   {"day": {"kind", "blocks"}, "minutes": +/-n oder null, "problems": [...],
--    "remaining": [{von, bis}], "appointments": n}
-- Ohne Zeiten (bzw. ohne Minuten bei der Korrektur) nur der Tag - für die
-- Schnellwahl. Gründe:
--   date_out_of_range     Mehrarbeit bis 31 Tage zurück, nicht in der Zukunft;
--                         Freizeitausgleich 31 Tage zurück bis ein Jahr voraus;
--                         Korrektur bis ein Jahr zurück, nicht in der Zukunft
--   times_invalid         Beginn vor Ende, ganze Minuten
--   overlaps_working_hours Mehrarbeit liegt in der Arbeitszeit des Tages
--   leave, absent, changed_day  Freizeitausgleich nur an einem Tag nach
--                         Wochenplan - nicht im Urlaub, nicht an einem Tag mit
--                         Abwesenheit oder geänderten Zeiten
--   no_working_time       an dem Tag ist keine Arbeitszeit
--   outside_working_hours Freizeitausgleich nur innerhalb der Arbeitszeit
--   overlaps_entry        ein anderer gültiger Eintrag liegt in der Zeit
--   correction_invalid    Korrektur mit Minuten (nicht 0, höchstens 1000 Stunden)
--                         und - beim Eintragen - mit Grund
create function app.time_account_check(
  p_org uuid, p_staff_member_id uuid, p_kind text, p_on_date date,
  p_starts_at time, p_ends_at time, p_minutes integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_heute    date;
  v_tag      jsonb;
  v_plan     app.timemultirange;
  v_bereich  app.timerange;
  v_innen    app.timemultirange;
  v_probleme text[] := '{}';
  v_minuten  integer;
  v_rest     jsonb := '[]'::jsonb;
  v_termine  integer := 0;
begin
  if p_kind is null or p_kind not in ('overtime', 'time_off', 'correction') then
    raise exception 'kind must be overtime, time_off or correction' using errcode = '22023';
  end if;
  if p_on_date is null then
    raise exception 'date is required' using errcode = '22023';
  end if;
  select (now() at time zone o.time_zone)::date into v_heute
  from public.organizations o where o.id = p_org;

  -- Außerhalb des Fensters gibt es keinen Tag (Zweitreview B1): Sonst ließe
  -- sich über die Vorschau jedes Datum einer Person abfragen.
  if (p_kind = 'overtime' and (p_on_date < v_heute - 31 or p_on_date > v_heute))
     or (p_kind = 'time_off' and (p_on_date < v_heute - 31 or p_on_date > v_heute + 365))
     or (p_kind = 'correction' and (p_on_date < v_heute - 366 or p_on_date > v_heute)) then
    return jsonb_build_object('day', null, 'minutes', null, 'problems', jsonb_build_array('date_out_of_range'),
                              'remaining', v_rest, 'appointments', v_termine);
  end if;

  -- Eine Korrektur ohne Lage und ohne Tag; ihren Grund verlangt das Eintragen.
  if p_kind = 'correction' then
    if p_minutes is not null then
      if p_minutes = 0 or p_minutes not between -60000 and 60000 then
        v_probleme := array_append(v_probleme, 'correction_invalid');
      else
        v_minuten := p_minutes;
      end if;
    end if;
    return jsonb_build_object('day', null, 'minutes', v_minuten, 'problems', to_jsonb(v_probleme),
                              'remaining', v_rest, 'appointments', v_termine);
  end if;

  v_tag := app.effective_day(p_org, p_staff_member_id, p_on_date);

  select range_agg(app.timerange((b ->> 'von')::time, (b ->> 'bis')::time, '[)'))
    into v_plan
  from jsonb_array_elements(coalesce(v_tag -> 'blocks', '[]'::jsonb)) as b;

  if p_kind = 'time_off' then
    if v_tag ->> 'kind' = 'leave' then
      v_probleme := array_append(v_probleme, 'leave');
    elsif v_tag ->> 'kind' = 'unavailable' then
      v_probleme := array_append(v_probleme, 'absent');
    elsif v_tag ->> 'kind' = 'exception' then
      v_probleme := array_append(v_probleme, 'changed_day');
    elsif v_plan is null then
      v_probleme := array_append(v_probleme, 'no_working_time');
    end if;
  end if;

  -- Ohne Zeiten: nur der Tag.
  if p_starts_at is null and p_ends_at is null then
    return jsonb_build_object('day', v_tag, 'minutes', null, 'problems', to_jsonb(v_probleme),
                              'remaining', v_rest, 'appointments', v_termine);
  end if;

  if p_starts_at is null or p_ends_at is null or p_starts_at >= p_ends_at
     or date_trunc('minute', p_starts_at::interval) <> p_starts_at::interval
     or date_trunc('minute', p_ends_at::interval) <> p_ends_at::interval then
    v_probleme := array_append(v_probleme, 'times_invalid');
    return jsonb_build_object('day', v_tag, 'minutes', null, 'problems', to_jsonb(v_probleme),
                              'remaining', v_rest, 'appointments', v_termine);
  end if;

  v_bereich := app.timerange(p_starts_at, p_ends_at, '[)');

  if p_kind = 'overtime' then
    -- Mehrarbeit liegt außerhalb der Arbeitszeit des Tages, sonst zählte sie
    -- doppelt; an einem freien Tag zählt sie ganz.
    if v_plan is not null and v_plan && v_bereich then
      v_probleme := array_append(v_probleme, 'overlaps_working_hours');
    end if;
    v_minuten := (extract(epoch from (p_ends_at - p_starts_at)) / 60)::integer;
  elsif v_plan is not null and v_tag ->> 'kind' = 'plan' then
    -- Freizeitausgleich: innerhalb der Spanne des Tages, gezählt wird die
    -- Arbeitszeit darin (eine Pause zählt nicht). Es bleiben die übrigen Blöcke.
    v_innen := v_plan * app.timemultirange(v_bereich);
    if isempty(v_innen) or not (app.timerange(lower(v_plan), upper(v_plan), '[)') @> v_bereich) then
      v_probleme := array_append(v_probleme, 'outside_working_hours');
    else
      select -sum(extract(epoch from (upper(r) - lower(r))) / 60)::integer
        into v_minuten
      from unnest(v_innen) as r;
      select coalesce(jsonb_agg(jsonb_build_object('von', to_char(lower(r), 'HH24:MI'),
                                                   'bis', to_char(upper(r), 'HH24:MI'))
                                order by lower(r)), '[]'::jsonb)
        into v_rest
      from unnest(v_plan - app.timemultirange(v_bereich)) as r;
    end if;
    -- Die bestätigten Termine in der freien Zeit - genannt, nie verschoben.
    select count(*)::integer into v_termine
    from public.appointments a
    join public.organizations o on o.id = a.organization_id
    where a.organization_id = p_org
      and a.staff_member_id = p_staff_member_id
      and a.status = 'confirmed'
      and a.starts_at < ((p_on_date + p_ends_at)::timestamp at time zone o.time_zone)
      and a.ends_at > ((p_on_date + p_starts_at)::timestamp at time zone o.time_zone);
  end if;

  if exists (
    select 1 from public.staff_time_account_entries e
    where e.organization_id = p_org and e.staff_member_id = p_staff_member_id
      and e.on_date = p_on_date and e.status = 'valid' and e.kind in ('overtime', 'time_off')
      and app.timerange(e.starts_at, e.ends_at, '[)') && v_bereich
  ) then
    v_probleme := array_append(v_probleme, 'overlaps_entry');
  end if;

  return jsonb_build_object('day', v_tag, 'minutes', v_minuten, 'problems', to_jsonb(v_probleme),
                            'remaining', v_rest, 'appointments', v_termine);
end;
$$;

revoke all on function app.time_account_check(uuid, uuid, text, date, time, time, integer)
  from public, anon, authenticated;

-- Was die Prüfung über das Konto einer anderen Person preisgibt (Zweitreview
-- B1): Urlaub sieht außer owner niemand als Urlaub, sondern wie im Kalender
-- als Abwesenheit (ANN-580); frühere Fassungen des Wochenplans liest nur der
-- Server (ANN-589) - vor heute ohne Blöcke.
create function app.time_account_foreign_view(p_check jsonb, p_org uuid, p_on_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sicht jsonb := p_check;
  v_heute date;
begin
  select (now() at time zone o.time_zone)::date into v_heute
  from public.organizations o where o.id = p_org;
  if not app.can_read_staff_leave_balances() then
    if v_sicht -> 'day' ->> 'kind' = 'leave' then
      v_sicht := jsonb_set(v_sicht, '{day,kind}', to_jsonb('unavailable'::text));
    end if;
    v_sicht := jsonb_set(v_sicht, '{problems}', (
      select coalesce(jsonb_agg(case when p.wert = 'leave' then 'absent' else p.wert end order by p.n),
                      '[]'::jsonb)
      from jsonb_array_elements_text(v_sicht -> 'problems') with ordinality as p (wert, n)
    ));
  end if;
  if p_on_date < v_heute and jsonb_typeof(v_sicht -> 'day') = 'object' then
    v_sicht := jsonb_set(v_sicht, '{day,blocks}', 'null'::jsonb);
    v_sicht := jsonb_set(v_sicht, '{remaining}', '[]'::jsonb);
  end if;
  return v_sicht;
end;
$$;

revoke all on function app.time_account_foreign_view(jsonb, uuid, date) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Vorschau, eintragen, zurücknehmen, zurückweisen
-- -----------------------------------------------------------------------------
-- Was ein Eintrag ergäbe - ohne zu schreiben. Ohne Zeiten nur der Tag und der
-- Saldo (für die Schnellwahl).
create function public.preview_time_account_entry(
  p_staff_member_id uuid, p_kind text, p_on_date date,
  p_starts_at time default null, p_ends_at time default null, p_minutes integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_staff  uuid;
  v_pruef  jsonb;
  v_saldo  integer;
begin
  v_org := app.staff_request_org(app.can_keep_time_account(), 'not allowed to keep a time account');
  v_staff := app.time_account_target(v_org, p_staff_member_id);
  v_pruef := app.time_account_check(v_org, v_staff, p_kind, p_on_date, p_starts_at, p_ends_at, p_minutes);
  if v_staff is distinct from app.own_staff_member(v_org) then
    v_pruef := app.time_account_foreign_view(v_pruef, v_org, p_on_date);
  end if;
  v_saldo := app.time_account_balance(v_org, v_staff);
  return v_pruef || jsonb_build_object(
    'balance_minutes', v_saldo,
    'balance_after', case when v_pruef ->> 'minutes' is null then null
                          else v_saldo + (v_pruef ->> 'minutes')::integer end
  );
end;
$$;

revoke all on function public.preview_time_account_entry(uuid, text, date, time, time, integer) from public, anon;
grant execute on function public.preview_time_account_entry(uuid, text, date, time, time, integer) to authenticated;

comment on function public.preview_time_account_entry(uuid, text, date, time, time, integer) is
  'ZK-001: Was ein Eintrag im Zeitkonto ergäbe - der Tag, Minuten, Saldo danach, Gründe dagegen, Termine in einem Freizeitausgleich. Schreibt nichts.';

create function public.record_time_account_entry(
  p_staff_member_id uuid, p_kind text, p_on_date date,
  p_starts_at time, p_ends_at time, p_minutes integer, p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org      uuid;
  v_staff    uuid;
  v_andere   boolean;
  v_text     text := nullif(btrim(coalesce(p_note, '')), '');
  v_pruef    jsonb;
  v_problem  text;
  v_id       uuid;
begin
  v_org := app.staff_request_org(app.can_keep_time_account(), 'not allowed to keep a time account');
  v_staff := app.time_account_target(v_org, p_staff_member_id);
  v_andere := v_staff is distinct from app.own_staff_member(v_org);
  if v_text is not null and length(v_text) > 500 then
    raise exception 'note is too long' using errcode = '22023';
  end if;
  -- Korrekturen buchen owner und Büro; im eigenen Konto nur owner (ANN-594).
  if p_kind = 'correction' and not (app.can_book_time_accounts() and (v_andere or app.has_any_role('owner'))) then
    raise exception 'not allowed to book corrections' using errcode = '42501';
  end if;

  -- Gesperrt wird die Person wie bei Urlaub, Arbeitszeit und Pflege: Zwei
  -- Einträge und eine gleichzeitige Pflege laufen nicht gegeneinander.
  perform 1 from public.staff_members sm where sm.id = v_staff for no key update;

  if p_kind <> 'correction' and (p_starts_at is null or p_ends_at is null) then
    raise exception 'time account rule: times_invalid' using errcode = '22023';
  end if;
  if p_kind = 'correction' and (p_minutes is null or v_text is null) then
    raise exception 'time account rule: correction_invalid' using errcode = '22023';
  end if;
  v_pruef := app.time_account_check(v_org, v_staff, p_kind, p_on_date, p_starts_at, p_ends_at, p_minutes);
  v_problem := case when v_andere then app.time_account_foreign_view(v_pruef, v_org, p_on_date)
                    else v_pruef end -> 'problems' ->> 0;
  if v_problem is not null then
    raise exception 'time account rule: %', v_problem
      using errcode = case
        when v_problem in ('leave', 'absent', 'changed_day') then '55000'
        when v_problem = 'overlaps_entry' then '23P01'
        else '22023'
      end;
  end if;

  begin
    insert into public.staff_time_account_entries (
      organization_id, staff_member_id, kind, on_date, starts_at, ends_at, minutes, note,
      entered_by, entered_for_other
    )
    values (
      v_org, v_staff, p_kind, p_on_date,
      case when p_kind <> 'correction' then p_starts_at end,
      case when p_kind <> 'correction' then p_ends_at end,
      (v_pruef ->> 'minutes')::integer, v_text, auth.uid(), v_andere
    )
    returning id into v_id;
  exception
    when exclusion_violation then
      raise exception 'time account rule: overlaps_entry' using errcode = '23P01';
  end;

  -- Der Freizeitausgleich als Abweichung: die übrigen Blöcke des Tages, oder
  -- der ganze Tag abwesend (ANN-595).
  if p_kind = 'time_off' then
    if jsonb_array_length(v_pruef -> 'remaining') = 0 then
      insert into public.staff_working_hour_exceptions
        (organization_id, staff_member_id, on_date, kind, created_by, time_account_entry_id)
      values (v_org, v_staff, p_on_date, 'unavailable', auth.uid(), v_id);
    else
      insert into public.staff_working_hour_exceptions
        (organization_id, staff_member_id, on_date, kind, starts_at, ends_at, created_by,
         time_account_entry_id)
      select v_org, v_staff, p_on_date, 'block', (b ->> 'von')::time, (b ->> 'bis')::time,
             auth.uid(), v_id
      from jsonb_array_elements(v_pruef -> 'remaining') as b;
    end if;
  end if;

  return jsonb_build_object(
    'id', v_id,
    'minutes', (v_pruef ->> 'minutes')::integer,
    'balance_minutes', app.time_account_balance(v_org, v_staff),
    'appointments', coalesce((v_pruef ->> 'appointments')::integer, 0)
  );
end;
$$;

revoke all on function public.record_time_account_entry(uuid, text, date, time, time, integer, text) from public, anon;
grant execute on function public.record_time_account_entry(uuid, text, date, time, time, integer, text) to authenticated;

comment on function public.record_time_account_entry(uuid, text, date, time, time, integer, text) is
  'ZK-001 (ANN-593 bis ANN-595): Mehrarbeit oder Freizeitausgleich mit Datum, Beginn und Ende eintragen - gilt sofort; owner und Büro auch für andere und Korrekturen. Ein Freizeitausgleich wirkt als Abweichung in den Arbeitszeiten. Kein Auditeintrag (ADR-010 Punkt 15).';

-- Die eigene Eingabe zurücknehmen: wer eingetragen hat, solange sie gilt; ein
-- Freizeitausgleich nur vor seinem Tag - sonst ließe sich genommene Zeit
-- zurückholen (ANN-594).
create function public.withdraw_time_account_entry(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_eintrag record;
begin
  v_org := app.staff_request_org(app.can_keep_time_account(), 'not allowed to keep a time account');
  select e.id, e.staff_member_id into v_eintrag
  from public.staff_time_account_entries e
  join public.organizations o on o.id = e.organization_id
  where e.id = p_entry_id
    and e.organization_id = v_org
    and e.status = 'valid'
    and e.entered_by = auth.uid()
    and (e.kind <> 'time_off' or e.on_date > (now() at time zone o.time_zone)::date)
    -- Wer für andere gebucht hat, nimmt das nur zurück, solange er es noch
    -- darf (Zweitreview B5).
    and (not (e.entered_for_other or e.kind = 'correction') or app.can_book_time_accounts())
  for update of e;
  if not found then
    raise exception 'time account entry not found' using errcode = 'P0002';
  end if;
  perform 1 from public.staff_members sm where sm.id = v_eintrag.staff_member_id for no key update;
  update public.staff_time_account_entries
     set status = 'withdrawn', withdrawn_at = now()
   where id = v_eintrag.id;
  delete from public.staff_working_hour_exceptions e where e.time_account_entry_id = v_eintrag.id;
end;
$$;

revoke all on function public.withdraw_time_account_entry(uuid) from public, anon;
grant execute on function public.withdraw_time_account_entry(uuid) to authenticated;

comment on function public.withdraw_time_account_entry(uuid) is
  'ZK-001 (ANN-594): die eigene Eingabe zurücknehmen, solange sie gilt; einen Freizeitausgleich nur vor seinem Tag, eine Buchung für andere oder eine Korrektur nur mit dem Recht dazu. Fremde, entschiedene und unbekannte Einträge sind nicht zu unterscheiden.';

-- Zurückweisen: owner mit Grund, nie im eigenen Konto. Der Eintrag bleibt
-- sichtbar und zählt nicht; ein Freizeitausgleich gibt die Zeit wieder als
-- Arbeitszeit frei (ANN-594, ANN-595).
create function public.reject_time_account_entry(p_entry_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_text    text := nullif(btrim(coalesce(p_note, '')), '');
  v_eintrag record;
begin
  v_org := app.staff_request_org(app.can_decide_staff_requests(), 'not allowed to reject time account entries');
  if v_text is null then
    raise exception 'rejection needs a reason' using errcode = '22023';
  end if;
  if length(v_text) > 500 then
    raise exception 'note is too long' using errcode = '22023';
  end if;
  select e.id, e.staff_member_id, e.kind into v_eintrag
  from public.staff_time_account_entries e
  where e.id = p_entry_id and e.organization_id = v_org and e.status = 'valid'
    and e.kind <> 'carryover'
  for update;
  if not found then
    raise exception 'time account entry not found' using errcode = 'P0002';
  end if;
  if v_eintrag.staff_member_id = app.own_staff_member(v_org) then
    raise exception 'not allowed to reject own entry' using errcode = '42501';
  end if;
  perform 1 from public.staff_members sm where sm.id = v_eintrag.staff_member_id for no key update;
  update public.staff_time_account_entries
     set status = 'rejected', rejected_by = auth.uid(), rejected_at = now(), rejection_note = v_text
   where id = v_eintrag.id;
  delete from public.staff_working_hour_exceptions e where e.time_account_entry_id = v_eintrag.id;
  return jsonb_build_object('status', 'rejected', 'freed', v_eintrag.kind = 'time_off');
end;
$$;

revoke all on function public.reject_time_account_entry(uuid, text) from public, anon;
grant execute on function public.reject_time_account_entry(uuid, text) to authenticated;

comment on function public.reject_time_account_entry(uuid, text) is
  'ZK-001 (ANN-594): owner weist einen gültigen Eintrag mit Grund zurück, nie im eigenen Konto. Er bleibt sichtbar und zählt nicht; ein Freizeitausgleich gibt die Zeit wieder frei.';

-- -----------------------------------------------------------------------------
-- 6. Lesen: das Zeitkonto in einem Aufruf (ANN-596)
-- -----------------------------------------------------------------------------
-- Ohne Angabe das eigene Konto; owner und Büro auch das einer anderen Person
-- und die Salden aller je Person - ohne Summe über alle (PROJECT_PRINCIPLES.md
-- 20). Den Grund eines Eintrags sehen, wer das Konto sieht.
create function public.list_time_account(p_staff_member_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_eigen  uuid;
  v_andere boolean;
  v_owner  boolean;
  v_ziel   uuid;
  v_heute  date;
begin
  v_org := app.staff_request_org(app.can_keep_time_account(), 'not allowed to keep a time account');
  v_eigen := app.own_staff_member(v_org);
  v_andere := app.can_book_time_accounts();
  v_owner := app.can_decide_staff_requests();
  v_ziel := case when p_staff_member_id is null then v_eigen
                 else app.time_account_target(v_org, p_staff_member_id) end;
  select (now() at time zone o.time_zone)::date into v_heute
  from public.organizations o where o.id = v_org;

  return jsonb_build_object(
    'my_staff_member_id', v_eigen,
    'can_book_others', v_andere,
    'can_reject', v_owner,
    'account', case when v_ziel is null then null else jsonb_build_object(
      'staff_member_id', v_ziel,
      'name', app.staff_display_name(v_ziel),
      'balance_minutes', app.time_account_balance(v_org, v_ziel),
      'entries', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'id', e.id,
                 'kind', e.kind,
                 'on_date', e.on_date,
                 'starts_at', to_char(e.starts_at, 'HH24:MI'),
                 'ends_at', to_char(e.ends_at, 'HH24:MI'),
                 'minutes', e.minutes,
                 'note', e.note,
                 'status', e.status,
                 'entered_at', e.entered_at,
                 'entered_by_name', case when e.entered_for_other then app.account_display_name(e.entered_by) end,
                 'rejected_at', e.rejected_at,
                 'rejected_by_name', app.account_display_name(e.rejected_by),
                 'rejection_note', e.rejection_note,
                 'withdrawn_at', e.withdrawn_at,
                 -- Ein Übertrag hat niemanden, der ihn eingetragen hat.
                 'can_withdraw', coalesce(e.status = 'valid' and e.entered_by = auth.uid()
                                 and (e.kind <> 'time_off' or e.on_date > v_heute)
                                 and (not (e.entered_for_other or e.kind = 'correction') or v_andere),
                                 false),
                 'can_reject', v_owner and e.status = 'valid' and e.kind <> 'carryover'
                               and e.staff_member_id is distinct from v_eigen
               ) order by e.on_date desc, e.starts_at desc nulls last, e.entered_at desc), '[]'::jsonb)
        from public.staff_time_account_entries e
        where e.organization_id = v_org and e.staff_member_id = v_ziel
      )
    ) end,
    'accounts', case when not v_andere then '[]'::jsonb else (
      select coalesce(jsonb_agg(jsonb_build_object(
               'staff_member_id', k.id,
               'name', k.name,
               'balance_minutes', app.time_account_balance(v_org, k.id)
             ) order by k.name, k.id), '[]'::jsonb)
      from (
        select sm.id, app.staff_display_name(sm.id) as name
        from public.staff_members sm
        where sm.organization_id = v_org
          and (sm.employment_status = 'active' or exists (
            select 1 from public.staff_time_account_entries e
            where e.staff_member_id = sm.id and e.status = 'valid'))
      ) k
    ) end
  );
end;
$$;

revoke all on function public.list_time_account(uuid) from public, anon;
grant execute on function public.list_time_account(uuid) to authenticated;

comment on function public.list_time_account(uuid) is
  'ZK-001 (ANN-596, BEF-066 Option 2 mit Büro): das Zeitkonto in einem Aufruf - das eigene mit allen Einträgen; owner und Büro auch das einer anderen Person und die Salden aller je Person, ohne Summe über alle (PROJECT_PRINCIPLES.md 20).';

-- -----------------------------------------------------------------------------
-- 7. Ein Tag mit Freizeitausgleich bleibt, wie er eingetragen ist (ANN-595)
-- -----------------------------------------------------------------------------

-- Stand URL-001, dazu der Freizeitausgleich: Die Planung überschreibt einen
-- solchen Tag nicht still.
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

  -- ZK-001: ebenso ein Tag mit Freizeitausgleich - der Eintrag zählte sonst
  -- weiter im Saldo, die freie Zeit wäre aber wieder Arbeitszeit. Erst
  -- zurückweisen oder zurücknehmen (55000, ANN-595).
  if exists (
    select 1 from public.staff_working_hour_exceptions a
    where a.organization_id = v_org
      and a.staff_member_id = p_staff_member_id
      and a.on_date = p_date
      and a.time_account_entry_id is not null
  ) then
    raise exception 'day has time off in lieu' using errcode = '55000';
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

-- Stand URL-001, dazu der Freizeitausgleich: Er hält eine Genehmigung an wie
-- abweichende Arbeitszeiten - auch ganztägig, sonst zählte der Tag doppelt.
create or replace function app.apply_leave(p_org uuid, p_request_id uuid)
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
      and (e.kind = 'block' or e.time_account_entry_id is not null)
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

-- Stand AZ-001, dazu der Freizeitausgleich: Eine einmalige Änderung ersetzt
-- ihn nicht still.
create or replace function app.working_time_baseline(p_org uuid, p_staff_member_id uuid, p_kind text, p_on_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tag   jsonb;
  v_woche jsonb;
begin
  if not exists (
    select 1 from public.staff_working_hours h
    where h.organization_id = p_org and h.staff_member_id = p_staff_member_id
      and (h.valid_until is null or h.valid_until >= p_on_date)
  ) then
    raise exception 'no working plan' using errcode = '22023';
  end if;

  if p_kind = 'once' then
    -- ZK-001: Einen Tag mit Freizeitausgleich ändert kein Antrag - erst den
    -- Eintrag zurückweisen oder zurücknehmen (ANN-595).
    if exists (
      select 1 from public.staff_working_hour_exceptions e
      where e.organization_id = p_org and e.staff_member_id = p_staff_member_id
        and e.on_date = p_on_date and e.time_account_entry_id is not null
    ) then
      raise exception 'day has time off in lieu' using errcode = '55000';
    end if;
    v_tag := app.effective_day(p_org, p_staff_member_id, p_on_date);
    if v_tag ->> 'kind' = 'leave' then
      raise exception 'day is part of approved leave' using errcode = '55000';
    end if;
    if v_tag ->> 'kind' = 'unavailable' then
      raise exception 'day is marked absent' using errcode = '55000';
    end if;
    return jsonb_build_object(
      'blocks', coalesce(v_tag -> 'blocks', '[]'::jsonb),
      'minutes', app.working_day_minutes(v_tag -> 'blocks')
    );
  end if;

  if exists (
    select 1 from public.staff_working_hours h
    where h.organization_id = p_org and h.staff_member_id = p_staff_member_id
      and h.valid_from > p_on_date
  ) then
    raise exception 'later working plan exists' using errcode = '55000';
  end if;
  v_woche := app.plan_week(p_org, p_staff_member_id, p_on_date);
  return jsonb_build_object(
    'blocks', v_woche,
    'minutes', (select sum(app.working_day_minutes(v_woche -> t.tag::text))::integer
                from generate_series(1, 7) as t (tag))
  );
end;
$$;

-- Stand AZ-001, dazu der Freizeitausgleich: ebenso wenig ein neuer Wochenplan
-- ab seinem Datum (Zweitreview B4).
create or replace function app.assert_working_time_change(
  p_org uuid, p_staff_member_id uuid, p_kind text, p_on_date date, p_blocks jsonb, p_errcode text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_bisher   jsonb;
  v_minuten  integer;
  v_probleme text[];
begin
  v_bisher := app.working_time_baseline(p_org, p_staff_member_id, p_kind, p_on_date);
  if p_blocks = v_bisher -> 'blocks' then
    raise exception 'working time unchanged' using errcode = p_errcode;
  end if;
  -- ZK-001 (Zweitreview B4): Ein neuer Wochenplan ändert keinen Tag mit
  -- Freizeitausgleich ab seinem Datum still - der Eintrag rechnet mit den
  -- bisherigen Zeiten. Erst zurückweisen oder zurücknehmen (55000, ANN-595).
  if p_kind = 'permanent' and exists (
    select 1 from public.staff_time_account_entries e
    where e.organization_id = p_org and e.staff_member_id = p_staff_member_id
      and e.kind = 'time_off' and e.status = 'valid' and e.on_date >= p_on_date
      and p_blocks -> extract(isodow from e.on_date)::text
          is distinct from v_bisher -> 'blocks' -> extract(isodow from e.on_date)::text
  ) then
    raise exception 'day has time off in lieu' using errcode = '55000';
  end if;
  v_minuten := app.working_time_minutes(p_kind, p_blocks);
  if v_minuten < (v_bisher ->> 'minutes')::integer then
    raise exception 'working time would be reduced' using errcode = p_errcode;
  end if;
  v_probleme := app.working_time_problems(p_org, p_staff_member_id, p_kind, p_on_date, p_blocks);
  if cardinality(v_probleme) > 0 then
    raise exception 'working time rule: %', array_to_string(v_probleme, ', ') using errcode = p_errcode;
  end if;
  return v_bisher || jsonb_build_object('new_minutes', v_minuten);
end;
$$;

-- Stand AZ-001, dazu der Freizeitausgleich: auch die Pflege in der Planung
-- nicht (Zweitreview B4).
CREATE OR REPLACE FUNCTION public.set_staff_working_hours(p_staff_member_id uuid, p_weekday smallint, p_blocks jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor    uuid;
  v_org      uuid;
  v_tz       text;
  v_heute    date;
  v_ab       date;
  v_bis      date;
  v_alt      jsonb;
  v_neu      jsonb;
  v_alt_ids  uuid[];
  v_neu_ids  uuid[];
  v_aktion   text;
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

  -- Arbeitszeiten sind Ortszeiten. Ohne hinterlegte Praxiszeitzone waeren sie
  -- nicht auswertbar; dieselbe Vorbedingung gilt an allen Schreibpfaden mit
  -- Zeitbezug (CAL-001).
  select o.time_zone into v_tz
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  if p_weekday is null or p_weekday not between 1 and 7 then
    raise exception 'weekday must be between 1 and 7' using errcode = '22023';
  end if;

  -- Fremde und unbekannte Personen sind ununterscheidbar.
  if not app.is_assignable_therapist(p_staff_member_id, v_org) then
    raise exception 'staff member not assignable' using errcode = 'P0002';
  end if;

  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' then
    raise exception 'blocks must be an array' using errcode = '22023';
  end if;

  -- AZ-001: dieselbe Sperre wie app.apply_working_time_change.
  perform 1 from public.staff_members sm where sm.id = p_staff_member_id for no key update;

  -- Die heute gueltige Fassung und ihre Grenzen (ANN-589).
  v_heute := (now() at time zone v_tz)::date;
  select h.valid_from, h.valid_until into v_ab, v_bis
  from public.staff_working_hours h
  where h.staff_member_id = p_staff_member_id
    and h.organization_id = v_org
    and daterange(h.valid_from, h.valid_until, '[]') @> v_heute
  limit 1;
  if not found then
    select max(h.valid_until) + 1 into v_ab
    from public.staff_working_hours h
    where h.staff_member_id = p_staff_member_id and h.organization_id = v_org
      and h.valid_until < v_heute;
    select min(h.valid_from) - 1 into v_bis
    from public.staff_working_hours h
    where h.staff_member_id = p_staff_member_id and h.organization_id = v_org
      and h.valid_from > v_heute;
  end if;

  -- Bestehender Stand, normalisiert und sortiert - Grundlage fuer die
  -- No-op-Erkennung und fuer die Art des Vorgangs.
  select coalesce(
           jsonb_agg(jsonb_build_array(h.starts_at::text, h.ends_at::text) order by h.starts_at),
           '[]'::jsonb
         ),
         coalesce(array_agg(h.id order by h.starts_at), '{}'::uuid[])
    into v_alt, v_alt_ids
  from public.staff_working_hours h
  where h.staff_member_id = p_staff_member_id
    and h.organization_id = v_org
    and h.weekday = p_weekday
    and daterange(h.valid_from, h.valid_until, '[]') @> v_heute;

  begin
    select coalesce(
             jsonb_agg(jsonb_build_array(w.von::text, w.bis::text) order by w.von),
             '[]'::jsonb
           )
      into v_neu
    from (
      select (b ->> 'von')::time as von, (b ->> 'bis')::time as bis
      from jsonb_array_elements(p_blocks) as b
    ) w;
  exception
    -- Unbrauchbare Zeitangaben im Array sind ein Eingabefehler, kein interner
    -- Fehler. Bewusst nur diese Faelle - ein `when others` wuerde echte
    -- Stoerungen verschlucken.
    when invalid_datetime_format or datetime_field_overflow
         or invalid_text_representation then
      raise exception 'working hour block is invalid' using errcode = '22023';
  end;

  -- Speichern ohne tatsaechliche Aenderung ist kein Vorgang: weder
  -- Schreibzugriff noch Auditeintrag.
  if v_alt = v_neu then
    return jsonb_array_length(v_alt);
  end if;

  -- ZK-001 (Zweitreview B4): Ein Freizeitausgleich ab heute an diesem
  -- Wochentag rechnet mit den bisherigen Zeiten - erst zurückweisen oder
  -- zurücknehmen (55000, ANN-595).
  if exists (
    select 1 from public.staff_time_account_entries e
    where e.organization_id = v_org and e.staff_member_id = p_staff_member_id
      and e.kind = 'time_off' and e.status = 'valid'
      and e.on_date >= v_heute and (v_bis is null or e.on_date <= v_bis)
      and extract(isodow from e.on_date) = p_weekday
  ) then
    raise exception 'day has time off in lieu' using errcode = '55000';
  end if;

  delete from public.staff_working_hours
   where staff_member_id = p_staff_member_id
     and organization_id = v_org
     and weekday = p_weekday
     and daterange(valid_from, valid_until, '[]') @> v_heute;

  begin
    with eingefuegt as (
      insert into public.staff_working_hours (
        organization_id, staff_member_id, weekday, starts_at, ends_at, created_by,
        valid_from, valid_until
      )
      select v_org, p_staff_member_id, p_weekday,
             (b ->> 'von')::time, (b ->> 'bis')::time, v_actor, v_ab, v_bis
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

  v_aktion := app.working_hour_action(
    jsonb_array_length(v_alt), jsonb_array_length(v_neu)
  );


  return jsonb_array_length(v_neu);
end;
$function$;

comment on function public.set_staff_working_hours(uuid, smallint, jsonb) is
  'Ersetzt einen Wochentag der heute gueltigen Fassung des Wochenplans (CAL-005, AZ-001 ANN-589). Eine kuenftige Fassung aus einem genehmigten Antrag bleibt unberuehrt. Ein leeres Array loescht den Tag. Nicht, solange ab heute ein Freizeitausgleich an dem Wochentag gilt (ZK-001, ANN-595).';

-- -----------------------------------------------------------------------------
-- 8. Löschlauf (ADR-008, ANN-597)
-- -----------------------------------------------------------------------------
create function app.delete_due_time_account_entries(p_org uuid, p_time_zone text, p_run uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anzahl integer := 0;
  v_teil   integer;
begin
  -- Gültige: drei Jahre ab Ende des Jahres ihres Datums. Ihr Saldo bleibt als
  -- Übertrag des Jahres stehen (app.carry_over_time_account_entry); ihre
  -- Abweichung fällt mit (cascade). Überträge bleiben (ANN-030).
  with faellig as (
    select e.id, e.organization_id,
           app.retention_due_at(
             make_date(extract(year from e.on_date)::integer, 12, 31),
             app.retention_interval('zeitkonto'),
             p_time_zone
           ) as due_at
    from public.staff_time_account_entries e
    where e.organization_id = p_org and e.status = 'valid' and e.kind <> 'carryover'
  ),
  geloescht as (
    delete from public.staff_time_account_entries e
    using faellig f
    where e.id = f.id and f.due_at <= now()
    returning e.id, e.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run, 'staff_time_account_entries', g.id, 'zeitkonto', f.due_at
  from geloescht g join faellig f on f.id = g.id;
  get diagnostics v_teil = row_count;
  v_anzahl := v_anzahl + v_teil;

  -- Zurückgewiesen und zurückgenommen: ein Jahr nach ihrem Ende.
  with faellig as (
    select e.id, e.organization_id,
           app.retention_due_at(
             (coalesce(e.rejected_at, e.withdrawn_at) at time zone p_time_zone)::date,
             app.retention_interval('zeitkonto_kurz'),
             p_time_zone
           ) as due_at
    from public.staff_time_account_entries e
    where e.organization_id = p_org and e.status in ('rejected', 'withdrawn')
  ),
  geloescht as (
    delete from public.staff_time_account_entries e
    using faellig f
    where e.id = f.id and f.due_at <= now()
    returning e.id, e.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run, 'staff_time_account_entries', g.id, 'zeitkonto_kurz', f.due_at
  from geloescht g join faellig f on f.id = g.id;
  get diagnostics v_teil = row_count;
  v_anzahl := v_anzahl + v_teil;

  return v_anzahl;
end;
$$;

revoke all on function app.delete_due_time_account_entries(uuid, text, uuid) from public, anon, authenticated;

comment on function app.delete_due_time_account_entries(uuid, text, uuid) is
  'ZK-001 (ANN-597): löscht gültige Einträge im Zeitkonto drei Jahre ab Ende ihres Jahres (ihr Saldo bleibt als Übertrag), zurückgewiesene und zurückgenommene ein Jahr nach ihrem Ende - mit Eintrag im Löschjournal. Aufgerufen aus public.apply_retention().';

-- Der Lauf ruft das Zeitkonto mit auf - sonst unverändert (Stand AZ-001).
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
                + v_radflotte + v_urlaub + v_arbeitszeit + v_zeitkonto;

    if v_fotos + v_akten + v_training + v_termine + v_audit + v_zugang + v_warte + v_aufgaben + v_anrufe
       + v_konten + v_plattform + v_auftraege + v_journal + v_wuensche + v_nachrichten + v_anhaenge
       + v_radflotte + v_urlaub + v_arbeitszeit + v_zeitkonto > 0
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
          'legal_hold_gehalten', v_gehalten,
          'steuerfrist_gehalten', v_steuer
        )
      );
    end if;
  end loop;

  return v_gesamt;
end;
$function$;

-- Nach einem Restore werden Einträge im Zeitkonto wie alle anderen erneut
-- gelöscht.
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
